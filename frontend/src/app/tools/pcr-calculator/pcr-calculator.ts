import { Component, OnInit, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormBuilder, FormGroup, FormArray, Validators, FormsModule } from '@angular/forms';
import { PcrPresetService, PCRPreset, PCRComponent } from '../../services/pcr-preset.service';
import { AuthService } from '../../services/auth.service';
import { LabService } from '../../services/lab.service';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';

interface CalculatedComponent {
  name: string;
  perReaction: number;
  total: number;
  isOptional: boolean;
  includeInMasterMix: boolean;
}

@Component({
  selector: 'app-pcr-calculator',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, FormsModule],
  templateUrl: './pcr-calculator.html',
  styleUrl: './pcr-calculator.css',
})
export class PcrCalculator implements OnInit {
  pcrForm!: FormGroup;
  
  // Preset Storage
  allPresets: PCRPreset[] = [];
  incomingTransfers: any[] = [];
  
  selectedPreset: PCRPreset | null = null;
  viewMode: 'calculator' | 'manager' = 'calculator';
  managerTab: 'system' | 'my' | 'incoming' = 'system';

  // Sharing State
  sharingPreset: PCRPreset | null = null;
  userSearchQuery = '';
  foundUsers: any[] = [];
  isSearchingUsers = false;

  constructor(
    private fb: FormBuilder,
    private presetService: PcrPresetService,
    public auth: AuthService,
    private labService: LabService,
    private cdr: ChangeDetectorRef
  ) {}

  ngOnInit() {
    this.initForm();
    this.loadData();
  }

  initForm() {
    this.pcrForm = this.fb.group({
      presetId: [''],
      numReactions: [10, [Validators.required, Validators.min(1)]],
      reactionVolume: [20, [Validators.required, Validators.min(0.1)]],
      overage: [10, [Validators.required, Validators.min(0), Validators.max(100)]],
      components: this.fb.array([])
    });
  }

  async loadData() {
    try {
      const data = await this.presetService.getPresets();
      this.allPresets = data.presets;
      this.incomingTransfers = data.transfers;
      
      const pendingPresetId = this.presetService.consumePendingOpenPresetId();
      if (pendingPresetId && this.allPresets.some(preset => preset.id === pendingPresetId)) {
        this.selectPreset(pendingPresetId);
      } else if (this.allPresets.length > 0 && !this.selectedPreset) {
        this.selectPreset(this.allPresets[0].id!);
      }
      this.cdr.detectChanges();
    } catch (err) {
      console.error('Failed to load presets', err);
    }
  }

  get systemPresets() { return this.allPresets.filter(p => p.isSystem); }
  get myPresets() { return this.allPresets.filter(p => !p.isSystem && p.ownerUserId === this.auth.currentProfile?.id); }

  get componentForms() {
    return this.pcrForm.get('components') as FormArray;
  }

  selectPreset(id: string) {
    if (id === 'custom') {
      this.selectedPreset = {
        name: 'Custom Protocol',
        category: 'Custom',
        defaultReactionVolume: 20,
        allowedReactionVolumes: [],
        isSystem: false,
        components: []
      };
      this.pcrForm.patchValue({ presetId: 'custom', reactionVolume: 20 });
      while (this.componentForms.length) this.componentForms.removeAt(0);
      this.addComponent('Template DNA', 'fixed_volume', false);
      this.addComponent('Nuclease-Free Water', 'fill_to_reaction_volume', true);
      return;
    }

    const preset = this.allPresets.find(p => p.id === id);
    if (!preset) return;
    
    this.selectedPreset = preset;
    this.pcrForm.patchValue({
      presetId: id,
      reactionVolume: preset.defaultReactionVolume || 20
    });

    while (this.componentForms.length) this.componentForms.removeAt(0);
    
    const sortedComps = [...preset.components].sort((a, b) => (a.displayOrder || 0) - (b.displayOrder || 0));

    sortedComps.forEach(comp => {
      this.componentForms.push(this.fb.group({
        id: [comp.id],
        name: [comp.name],
        calculationMode: [comp.calculationMode],
        isOptional: [!!comp.isOptional],
        enabled: [!comp.isOptional],
        userInputVolume: [comp.fixedVolume || 0],
        stockConcentration: [comp.stockConcentration || 10],
        stockUnit: [comp.stockUnit || 'µM'],
        finalConcentration: [comp.finalConcentration || 0.5],
        finalUnit: [comp.finalUnit || 'µM'],
        ratioDenominator: [comp.ratioDenominator || 2],
        fixedVolume: [comp.fixedVolume || 0],
        includeInMasterMix: [comp.includeInMasterMix !== false]
      }));
    });
  }

  addComponent(name = 'New Component', mode = 'fixed_volume', atEnd = false) {
    const group = this.fb.group({
      id: [null],
      name: [name],
      calculationMode: [mode],
      isOptional: [false],
      enabled: [true],
      userInputVolume: [0],
      stockConcentration: [10],
      stockUnit: ['µM'],
      finalConcentration: [0.5],
      finalUnit: ['µM'],
      ratioDenominator: [2],
      fixedVolume: [0],
      includeInMasterMix: [!name.toLowerCase().includes('template')]
    });

    if (atEnd || this.componentForms.length === 0) {
      this.componentForms.push(group);
    } else {
      const lastIdx = this.componentForms.length - 1;
      const lastMode = this.componentForms.at(lastIdx).value.calculationMode;
      if (lastMode === 'fill_to_reaction_volume') {
        this.componentForms.insert(lastIdx, group);
      } else {
        this.componentForms.push(group);
      }
    }
  }

  removeComponent(index: number) {
    this.componentForms.removeAt(index);
  }

  private toMicromolar(value: number, unit: string): number {
    switch (unit) {
      case 'mM': return value * 1000;
      case 'µM': return value;
      case 'nM': return value / 1000;
      default: return value;
    }
  }

  calculateResults() {
    if (!this.selectedPreset) return null;
    const formVal = this.pcrForm.value;
    const rxnVol = formVal.reactionVolume;
    const nRxn = formVal.numReactions;
    const effectiveRxns = nRxn * (1 + formVal.overage / 100);
    
    let results: CalculatedComponent[] = [];
    let waterComponent: any = null;
    let sumOtherVols = 0;

    formVal.components.forEach((c: any) => {
      if (c.isOptional && !c.enabled) return;
      let perRxn = 0;
      switch (c.calculationMode) {
        case 'fixed_ratio': perRxn = rxnVol / (c.ratioDenominator || 1); break;
        case 'fixed_volume': perRxn = c.fixedVolume || 0; break;
        case 'primer_concentration':
          const stockUM = this.toMicromolar(c.stockConcentration, c.stockUnit);
          const finalUM = this.toMicromolar(c.finalConcentration, c.finalUnit);
          if (stockUM > 0) perRxn = (finalUM * rxnVol) / stockUM;
          break;
        case 'fill_to_reaction_volume': waterComponent = c; return; 
      }
      results.push({
        name: c.name, perReaction: perRxn,
        total: perRxn * (c.includeInMasterMix ? effectiveRxns : nRxn),
        isOptional: c.isOptional, includeInMasterMix: c.includeInMasterMix
      });
      sumOtherVols += perRxn;
    });

    const waterVol = Math.max(0, rxnVol - sumOtherVols);
    if (waterComponent) {
      results.push({
        name: waterComponent.name, perReaction: waterVol,
        total: waterVol * effectiveRxns, isOptional: false, includeInMasterMix: true
      });
    }
    return { components: results, effectiveRxns, totalRxnVol: rxnVol, waterVol: rxnVol - sumOtherVols, clampedWater: waterVol };
  }

  get results() { return this.calculateResults(); }

  get errors() {
    const res = this.results;
    const errs: string[] = [];
    if (res && res.waterVol < -0.0001) {
      errs.push('Total components exceed reaction volume! Water cannot be added.');
    }
    return errs;
  }

  get warnings() {
    const res = this.results;
    const warns: string[] = [];
    if (res) {
      res.components.forEach(c => {
        if (c.total > 0 && c.total < 0.5) warns.push(`Total bulk volume for ${c.name} is very low (< 0.5 µL).`);
      });
      if (res.clampedWater * res.effectiveRxns < 1 && res.waterVol >= 0) warns.push('Total water volume is extremely low. Pipetting may be difficult.');
    }
    return warns;
  }

  async saveAsPreset() {
    if (!this.auth.isLoggedIn) {
      alert('Please log in to save your personal presets.');
      return;
    }
    const name = prompt('Enter a name for this preset:');
    if (!name) return;

    const formVal = this.pcrForm.value;
    const newPreset: PCRPreset = {
      name: name, category: 'User Created',
      defaultReactionVolume: formVal.reactionVolume,
      allowedReactionVolumes: [formVal.reactionVolume],
      isSystem: false,
      components: formVal.components.map((c: any, i: number) => ({
        name: c.name, componentType: 'other', calculationMode: c.calculationMode,
        stockConcentration: c.stockConcentration, stockUnit: c.stockUnit,
        finalConcentration: c.finalConcentration, finalUnit: c.finalUnit,
        ratioDenominator: c.ratioDenominator, fixedVolume: c.fixedVolume,
        includeInMasterMix: c.includeInMasterMix !== false, isOptional: !!c.isOptional, displayOrder: i
      }))
    };

    try {
      await this.presetService.createPreset(newPreset);
      alert('Preset saved successfully!');
      this.loadData();
    } catch (err: any) {
      console.error('Failed to save Solution Protocol', err);
      const detail = err?.error?.detail;
      const message = Array.isArray(detail)
        ? detail.map((item: any) => `${(item.loc || []).slice(1).join('.')}: ${item.msg || 'Invalid value'}`).join('\n')
        : detail || err?.message || 'Failed to save Solution Protocol';
      alert(message);
    }
  }

  async deletePreset(id: string) {
    if (confirm('Are you sure you want to delete this preset?')) {
      await this.presetService.deletePreset(id);
      this.loadData();
    }
  }

  // --- Sharing / Transfers ---

  allUsers: any[] = [];
  filteredUsers: any[] = [];

  async openShareModal(preset: PCRPreset) {
    this.sharingPreset = preset;
    this.userSearchQuery = '';
    this.isSearchingUsers = true;
    try {
      // Use the same endpoint as manager management
      this.allUsers = await this.labService.getAllUsers();
      // Filter out self and owner if needed, but usually just self
      this.allUsers = this.allUsers.filter(u => u.id !== this.auth.currentProfile?.id);
      this.filteredUsers = [...this.allUsers];
      this.cdr.detectChanges();
    } catch (err) {
      console.error('Failed to load users for sharing', err);
    } finally {
      this.isSearchingUsers = false;
      this.cdr.detectChanges();
    }
  }

  searchUsers() {
    const term = this.userSearchQuery.toLowerCase().trim();
    if (!term) {
      this.filteredUsers = [...this.allUsers];
    } else {
      this.filteredUsers = this.allUsers.filter(u => 
        (u.name || '').toLowerCase().includes(term) || 
        (u.email || '').toLowerCase().includes(term) ||
        (u.uid || '').toLowerCase().includes(term)
      );
    }
    this.cdr.detectChanges();
  }

  async sendToUser(user: any) {
    if (!this.sharingPreset) return;
    try {
      await this.presetService.sendPreset(this.sharingPreset.id!, user.id);
      alert(`Preset sent to ${user.name}!`);
      this.sharingPreset = null;
    } catch (err) {
      alert('Failed to send preset');
    }
  }

  async acceptIncoming(transfer: any) {
    try {
      await this.presetService.acceptTransfer(transfer.id);
      alert('Preset added to your collection!');
      this.loadData();
    } catch (err) {
      alert('Failed to accept preset');
    }
  }

  async rejectIncoming(transfer: any) {
    if (!confirm('Are you sure you want to ignore this preset?')) return;
    try {
      await this.presetService.rejectTransfer(transfer.id);
      this.loadData();
    } catch (err) {
      alert('Failed to reject preset');
    }
  }

  exportPDF() {
    const doc = new jsPDF();
    const res = this.results;
    const form = this.pcrForm.value;
    if (!res || !this.selectedPreset) return;

    doc.setFontSize(22);
    doc.setTextColor(30, 41, 59);
    doc.text('PCR Setup Protocol', 14, 20);
    doc.setFontSize(10);
    doc.setTextColor(100, 116, 139);
    doc.text(`Preset: ${this.selectedPreset.name}`, 14, 30);
    doc.text(`Date: ${new Date().toLocaleDateString()}`, 160, 30);
    doc.setDrawColor(226, 232, 240);
    doc.setFillColor(248, 250, 252);
    doc.rect(14, 35, 182, 20, 'FD');
    doc.setFontSize(11);
    doc.setTextColor(30, 41, 59);
    doc.setFont('helvetica', 'bold');
    doc.text('Experiment Settings', 20, 42);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
    doc.text(`Reactions: ${form.numReactions}`, 20, 49);
    doc.text(`Overage: ${form.overage}%`, 70, 49);
    doc.text(`Total Vol/Rxn: ${form.reactionVolume} µL`, 120, 49);

    autoTable(doc, {
      startY: 60,
      head: [['Component', 'Per Rxn (µL)', 'Total Bulk (µL)']],
      body: res.components.map(c => [c.name, c.perReaction.toFixed(2), c.total.toFixed(2)]),
      headStyles: { fillColor: [30, 41, 59] },
      alternateRowStyles: { fillColor: [248, 250, 252] },
      columnStyles: { 1: { halign: 'right' }, 2: { halign: 'right' } }
    });

    doc.save(`${this.selectedPreset.name.replace(/\s+/g, '_')}_Protocol.pdf`);
  }
}
