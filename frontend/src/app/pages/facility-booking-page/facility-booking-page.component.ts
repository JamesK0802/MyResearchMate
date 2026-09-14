import { Component, OnInit, ChangeDetectorRef, HostListener, ViewChild, ElementRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { FacilityBookingService, AllocationItem, FacilityArea, FacilityBooking, FacilitySpot, AvailabilityResult, YearlySummaryResponse } from '../../services/facility-booking.service';
import { AuthService } from '../../services/auth.service';

type TabType = 'table' | 'map' | 'yearly';

@Component({
  selector: 'app-facility-booking',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './facility-booking-page.component.html',
  styleUrl: './facility-booking-page.component.css'
})
export class FacilityBookingPageComponent implements OnInit {
  // Global State
  activeTab: TabType = 'table';
  mobileBookingFormOpen = false;
  allSpots: FacilitySpot[] = [];
  facilities: FacilityArea[] = [];
  selectedFacilityId = '';
  showFacilityEditor = false;
  facilityEditorMode: 'create' | 'edit' = 'edit';
  facilityForm = { name:'', location:'', description:'', grid_columns:4, grid_rows:4, display_order:0 };
  spotDrafts: FacilitySpot[] = [];
  newSpotForm = { name:'', category:'General', grid_x:1, grid_y:1, grid_width:1, grid_height:1 };
  selectedEditorSpotId = '';
  layoutDirty = false;
  facilitySaving = false;
  facilityDeleting = false;
  facilityError = '';
  facilitySuccess = '';
  showDeleteFacilityConfirm = false;
  private layoutGesture: null | {
    spot: FacilitySpot; mode: 'move' | 'resize'; startX: number; startY: number;
    x: number; y: number; width: number; height: number; cellWidth: number; cellHeight: number;
  } = null;
  
  // Booking Form State (Top Section) - Using Year-Month string format ("YYYY-MM")
  form = { spot_id: '', user_name: '', species: '', start_month: '', end_month: '', comment: '' };
  formError = '';
  formSuccess = '';
  formLoading = false;
  availability: AvailabilityResult | null = null;
  
  // Edit/Delete Modal
  showEditModal = false;
  selectedBooking: FacilityBooking | null = null;
  // Modal also uses "YYYY-MM"
  editForm = { user_name: '', species: '', start_month: '', end_month: '', comment: '' };
  showDeleteConfirm = false;

  // Filter State
  selectedYear = new Date().getFullYear();
  selectedMonth = new Date().getMonth() + 1;
  selectedRoom = '';

  // Tab 1: Table State
  allBookings: FacilityBooking[] = [];
  showExpired = false;

  // Tab 2: Map State
  allocation: AllocationItem[] = [];
  mapSummary = { total_spots: 0, booked: 0, available: 0 };
  
  // Tab 3: Yearly State
  yearlySummary: YearlySummaryResponse | null = null;
  
  // Drag Selection State for Yearly Map
  isDragging = false;
  dragSpotId: string | null = null;
  dragStartMonth: number | null = null;
  dragCurrentMonth: number | null = null;
  private yearlyTouchStartX = 0;
  private yearlyTouchStartY = 0;

  // Options
  years: number[] = [];
  months = [
    { value: 1, label: 'January' }, { value: 2, label: 'February' },
    { value: 3, label: 'March' }, { value: 4, label: 'April' },
    { value: 5, label: 'May' }, { value: 6, label: 'June' },
    { value: 7, label: 'July' }, { value: 8, label: 'August' },
    { value: 9, label: 'September' }, { value: 10, label: 'October' },
    { value: 11, label: 'November' }, { value: 12, label: 'December' }
  ];
  rooms: string[] = [];
  
  loading = true;
  error = '';

  constructor(
    private bookingService: FacilityBookingService,
    public auth: AuthService,
    private cdr: ChangeDetectorRef
  ) {
    const now = new Date().getFullYear();
    this.years = Array.from({ length: 7 }, (_, i) => now - 1 + i);
  }

  ngOnInit() { 
    this.initFormDates();
    this.loadInitialData(); 
  }

  get canManageFacilities(): boolean { return ['manager','owner','admin'].includes(this.auth.currentProfile?.role || ''); }
  get selectedFacility(): FacilityArea | undefined { return this.facilities.find(f => f.id === this.selectedFacilityId); }
  get facilitySpots(): FacilitySpot[] { return this.allSpots.filter(spot => spot.facility_id === this.selectedFacilityId); }

  initFormDates() {
    const today = new Date();
    const y = today.getFullYear();
    const m = String(today.getMonth() + 1).padStart(2, '0');
    // Set to current month ("YYYY-MM")
    this.form.start_month = `${y}-${m}`;
    this.form.end_month = `${y}-${m}`;
  }

  async loadInitialData() {
    this.loading = true;
    try {
      this.facilities = await this.bookingService.getFacilities();
      this.allSpots = await this.bookingService.getSpots();
      if (!this.selectedFacilityId || !this.facilities.some(f => f.id === this.selectedFacilityId)) this.selectedFacilityId = this.facilities[0]?.id || '';
      const roomsSet = new Set(this.allSpots.map(s => s.room));
      this.rooms = Array.from(roomsSet).sort();
      if (this.allSpots.length > 0) {
        this.form.spot_id = this.facilitySpots[0]?.id || this.allSpots[0].id;
      }
      // Populate user name if available
      const profile = this.auth.currentProfile;
      if (profile) {
        this.form.user_name = profile.name;
      }
      await this.refreshActiveTab();
    } catch (e: any) {
      this.error = 'Failed to load initial data.';
    } finally {
      this.loading = false;
      this.cdr.detectChanges();
    }
  }

  setTab(tab: TabType) {
    this.activeTab = tab;
    this.refreshActiveTab();
  }

  selectFacility(facilityId: string) {
    this.selectedFacilityId = facilityId;
    this.form.spot_id = this.facilitySpots[0]?.id || '';
    this.refreshActiveTab();
  }

  async refreshActiveTab() {
    this.loading = true;
    this.error = '';
    this.cdr.detectChanges();
    try {
      if (this.activeTab === 'table') {
        this.allBookings = await this.bookingService.getBookings(undefined, undefined, undefined, this.selectedFacilityId || undefined);
      } else if (this.activeTab === 'map') {
        const res = await this.bookingService.getAllocation(Number(this.selectedYear), Number(this.selectedMonth), undefined, this.selectedFacilityId || undefined);
        this.allocation = res.allocation;
        this.mapSummary = res.summary;
      } else if (this.activeTab === 'yearly') {
        this.yearlySummary = await this.bookingService.getYearlySummary(Number(this.selectedYear), undefined, this.selectedFacilityId || undefined);
      }
    } catch (e: any) {
      this.error = e?.error?.detail || e?.message || 'Failed to load data.';
    } finally {
      this.loading = false;
      this.cdr.detectChanges();
    }
  }

  openNewFacility() {
    this.cancelLayoutGesture();
    if (!this.canManageFacilities) return;
    this.facilityEditorMode = 'create';
    this.facilityForm = { name:'', location:'', description:'', grid_columns:4, grid_rows:4, display_order:this.facilities.length + 1 };
    this.spotDrafts = [];
    this.selectedEditorSpotId = '';
    this.layoutDirty = false;
    this.facilityError = '';
    this.facilitySuccess = '';
    this.showDeleteFacilityConfirm = false;
    this.showFacilityEditor = true;
  }

  openFacilitySettings() {
    this.cancelLayoutGesture();
    const facility = this.selectedFacility;
    if (!facility || !this.canManageFacilities) return;
    this.facilityEditorMode = 'edit';
    this.facilityForm = { name:facility.name, location:facility.location || '', description:facility.description || '', grid_columns:facility.grid_columns || 4, grid_rows:facility.grid_rows || 4, display_order:facility.display_order || 0 };
    this.spotDrafts = this.facilitySpots.map(spot => ({ ...spot }));
    this.selectedEditorSpotId = this.spotDrafts[0]?.id || '';
    this.layoutDirty = false;
    this.facilityError = '';
    this.facilitySuccess = '';
    this.showDeleteFacilityConfirm = false;
    this.showFacilityEditor = true;
  }

  closeFacilityEditor() {
    if (!this.facilitySaving && !this.facilityDeleting) {
      this.showFacilityEditor = false;
      this.showDeleteFacilityConfirm = false;
      this.facilitySuccess = '';
      this.facilityError = '';
    }
  }

  async saveFacilityDetails() {
    if (!this.canManageFacilities || !this.facilityForm.name.trim()) return;
    this.facilitySaving = true; this.facilityError = ''; this.facilitySuccess = '';
    try {
      if (this.facilityEditorMode === 'create') {
        const created = await this.bookingService.createFacility(this.facilityForm);
        this.selectedFacilityId = created.id;
        this.facilityEditorMode = 'edit';
        this.facilitySuccess = 'Facility created! You can now arrange spots below.';
      } else if (this.selectedFacilityId) {
        await this.persistFacilityLayout();
        this.facilitySuccess = '✓ Facility saved successfully!';
      }
      await this.reloadFacilities();
      this.spotDrafts = this.facilitySpots.map(spot => ({ ...spot }));
      this.selectedEditorSpotId = this.spotDrafts[0]?.id || '';
      this.layoutDirty = false;
      setTimeout(() => { if (this.facilitySuccess) { this.facilitySuccess = ''; this.cdr.detectChanges(); } }, 3500);
    } catch (error: any) { this.facilityError = error?.error?.detail || error?.message || 'Could not save facility.'; }
    finally { this.facilitySaving = false; this.cdr.detectChanges(); }
  }

  async deleteCurrentFacility() {
    if (!this.selectedFacilityId || !this.canManageFacilities || this.facilityDeleting) return;
    this.facilityDeleting = true;
    this.facilityError = '';
    try {
      await this.bookingService.deleteFacility(this.selectedFacilityId);
      this.showDeleteFacilityConfirm = false;
      this.showFacilityEditor = false;
      this.facilitySuccess = '';
      await this.loadInitialData();
    } catch (error: any) {
      this.facilityError = error?.error?.detail || error?.message || 'Could not delete facility.';
    } finally {
      this.facilityDeleting = false;
      this.cdr.detectChanges();
    }
  }

  async reloadFacilities() {
    this.facilities = await this.bookingService.getFacilities();
    this.allSpots = await this.bookingService.getSpots();
    const selected = this.facilities.find(f => f.id === this.selectedFacilityId) || this.facilities[0];
    this.selectedFacilityId = selected?.id || '';
    this.form.spot_id = this.facilitySpots.some(s => s.id === this.form.spot_id) ? this.form.spot_id : (this.facilitySpots[0]?.id || '');
    await this.refreshActiveTab();
  }

  async addFacilitySpot() {
    if (this.facilitySaving || !this.selectedFacilityId || !this.newSpotForm.name.trim() || !this.drawnArea) return;
    this.facilitySaving = true; this.facilityError = '';
    try {
      if (this.layoutDirty) await this.persistFacilityLayout();
      Object.assign(this.newSpotForm, this.drawnArea);
      await this.bookingService.createSpot(this.selectedFacilityId, this.newSpotForm);
      this.newSpotForm = { name:'', category:'General', grid_x:1, grid_y:1, grid_width:1, grid_height:1 };
      this.drawnArea = null;
      this.layoutDirty = false;
      await this.reloadFacilities();
      this.spotDrafts = this.facilitySpots.map(spot => ({ ...spot }));
      this.selectedEditorSpotId = this.spotDrafts.at(-1)?.id || '';
    } catch (error:any) { this.facilityError = error?.error?.detail || error?.message || 'Could not add booking spot.'; }
    finally { this.facilitySaving=false; this.cdr.detectChanges(); }
  }

  async saveFacilityLayout() {
    if (!this.selectedFacilityId || !this.canManageFacilities) return;
    this.facilitySaving = true; this.facilityError = ''; this.facilitySuccess = '';
    try {
      await this.persistFacilityLayout();
      await this.reloadFacilities();
      this.spotDrafts = this.facilitySpots.map(item => ({ ...item }));
      this.layoutDirty = false;
      this.facilitySuccess = '✓ Room layout saved successfully!';
      setTimeout(() => { if (this.facilitySuccess) { this.facilitySuccess = ''; this.cdr.detectChanges(); } }, 3500);
    } catch (error: any) {
      this.facilityError = error?.error?.detail || error?.message || 'Could not save the facility layout.';
    } finally { this.facilitySaving = false; this.cdr.detectChanges(); }
  }

  private async persistFacilityLayout() {
    await this.bookingService.updateFacility(this.selectedFacilityId, this.facilityForm);
    for (const spot of this.spotDrafts) {
      await this.bookingService.updateSpot(spot.id, {
        name: spot.name, category: spot.category, display_order: spot.display_order,
        grid_x: spot.grid_x, grid_y: spot.grid_y, grid_width: spot.grid_width, grid_height: spot.grid_height
      });
    }
  }

  async removeFacilitySpot(spot: FacilitySpot) {
    if (!confirm(`Remove “${spot.name}” from future bookings? Existing booking history will be kept.`)) return;
    this.facilitySaving=true;
    try { await this.bookingService.deactivateSpot(spot.id); await this.reloadFacilities(); this.spotDrafts=this.facilitySpots.map(item=>({...item})); }
    catch(error:any) { this.facilityError=error?.error?.detail || error?.message || 'Could not remove booking spot.'; }
    finally { this.facilitySaving=false; this.cdr.detectChanges(); }
  }

  spotGridStyle(spot: FacilitySpot): Record<string,string> {
    const columns = this.selectedFacility?.grid_columns || 4;
    const start = Math.min(Math.max(1, spot.grid_x || 1), columns);
    const width = Math.min(Math.max(1, spot.grid_width || 1), columns - start + 1);
    return { 'grid-column': `${start} / span ${width}`, 'grid-row': `${Math.max(1,spot.grid_y || 1)} / span ${Math.max(1,spot.grid_height || 1)}` };
  }

  get selectedEditorSpot(): FacilitySpot | undefined { return this.spotDrafts.find(spot => spot.id === this.selectedEditorSpotId); }
  get layoutCells(): number[] {
    const count = Math.max(1, Number(this.facilityForm.grid_columns) || 1) * Math.max(1, Number(this.facilityForm.grid_rows) || 1);
    return Array.from({ length: count }, (_, index) => index);
  }

  markLayoutDirty() { this.layoutDirty = true; }

  drawnArea: { grid_x:number; grid_y:number; grid_width:number; grid_height:number } | null = null;
  showAreaName = false;
  @ViewChild('areaNameInput') areaNameInput?: ElementRef<HTMLInputElement>;
  private drawGesture: { x:number; y:number; canvas:HTMLElement; pointerId:number } | null = null;

  private cellAt(event: PointerEvent, canvas: HTMLElement) {
    const rect = canvas.getBoundingClientRect();
    return {
      x: Math.max(1, Math.min(this.facilityForm.grid_columns, Math.floor((event.clientX - rect.left) / rect.width * this.facilityForm.grid_columns) + 1)),
      y: Math.max(1, Math.min(this.facilityForm.grid_rows, Math.floor((event.clientY - rect.top) / rect.height * this.facilityForm.grid_rows) + 1))
    };
  }

  beginAreaDraw(event: PointerEvent) {
    if (this.facilitySaving || event.button !== 0) return;
    event.preventDefault();
    const canvas = event.currentTarget as HTMLElement;
    const cell = this.cellAt(event, canvas);
    canvas.setPointerCapture(event.pointerId);
    this.newSpotForm.name = '';
    this.showAreaName = false;
    this.drawGesture = { ...cell, canvas, pointerId:event.pointerId };
    this.updateDrawnArea(event);
  }

  private updateDrawnArea(event: PointerEvent) {
    const start = this.drawGesture;
    if (!start || start.pointerId !== event.pointerId) return;
    const end = this.cellAt(event, start.canvas);
    const area = { grid_x:Math.min(start.x,end.x), grid_y:Math.min(start.y,end.y), grid_width:Math.abs(end.x-start.x)+1, grid_height:Math.abs(end.y-start.y)+1 };
    const overlaps = this.spotDrafts.some(s => area.grid_x < s.grid_x+s.grid_width && area.grid_x+area.grid_width > s.grid_x && area.grid_y < s.grid_y+s.grid_height && area.grid_y+area.grid_height > s.grid_y);
    this.drawnArea = overlaps ? null : area;
    this.facilityError = overlaps ? 'Choose empty cells without overlapping an existing area.' : '';
  }

  drawnCell(cell:number): boolean {
    const area = this.drawnArea;
    const x = cell % this.facilityForm.grid_columns + 1;
    const y = Math.floor(cell / this.facilityForm.grid_columns) + 1;
    return !!area && x >= area.grid_x && x < area.grid_x+area.grid_width && y >= area.grid_y && y < area.grid_y+area.grid_height;
  }

  layoutCellStyle(cell:number): Record<string,string> {
    return { 'grid-column':String(cell % this.facilityForm.grid_columns + 1), 'grid-row':String(Math.floor(cell / this.facilityForm.grid_columns) + 1) };
  }

  private firstOpenLayoutCell(): { x: number; y: number } | null {
    const columns = Math.max(1, Number(this.facilityForm.grid_columns) || 1);
    const rows = Math.max(1, Number(this.facilityForm.grid_rows) || 1);
    const occupied = new Set<string>();
    for (const spot of this.spotDrafts) {
      for (let y = spot.grid_y; y < spot.grid_y + spot.grid_height; y++) {
        for (let x = spot.grid_x; x < spot.grid_x + spot.grid_width; x++) occupied.add(`${x}:${y}`);
      }
    }
    for (let y = 1; y <= rows; y++) for (let x = 1; x <= columns; x++) if (!occupied.has(`${x}:${y}`)) return { x, y };
    return null;
  }

  editorSpotGridStyle(spot: FacilitySpot): Record<string,string> {
    const columns = Math.max(1, Number(this.facilityForm.grid_columns) || 1);
    const rows = Math.max(1, Number(this.facilityForm.grid_rows) || 1);
    const x = Math.min(Math.max(1, spot.grid_x || 1), columns);
    const y = Math.min(Math.max(1, spot.grid_y || 1), rows);
    const width = Math.min(Math.max(1, spot.grid_width || 1), columns - x + 1);
    const height = Math.min(Math.max(1, spot.grid_height || 1), rows - y + 1);
    return { 'grid-column': `${x} / span ${width}`, 'grid-row': `${y} / span ${height}` };
  }

  selectEditorSpot(spot: FacilitySpot) { this.drawnArea = null; this.selectedEditorSpotId = spot.id; }

  beginLayoutGesture(event: PointerEvent, spot: FacilitySpot, mode: 'move' | 'resize') {
    event.preventDefault(); event.stopPropagation();
    if (this.facilitySaving) return;
    this.drawnArea = null;
    const target = event.currentTarget as HTMLElement;
    try { target.setPointerCapture?.(event.pointerId); } catch (e) {}
    const canvas = target.closest('.facility-layout-canvas') as HTMLElement | null;
    if (!canvas) return;
    const columns = Math.max(1, Number(this.facilityForm.grid_columns) || 1);
    const rows = Math.max(1, Number(this.facilityForm.grid_rows) || 1);
    const style = getComputedStyle(canvas);
    const columnGap = parseFloat(style.columnGap) || 8;
    const rowGap = parseFloat(style.rowGap) || 8;
    const cellWidth = (canvas.clientWidth - (columns - 1) * columnGap) / columns + columnGap;
    const cellHeight = (canvas.clientHeight - (rows - 1) * rowGap) / rows + rowGap;
    this.selectedEditorSpotId = spot.id;
    this.layoutGesture = { spot, mode, startX:event.clientX, startY:event.clientY, x:spot.grid_x || 1, y:spot.grid_y || 1, width:spot.grid_width || 1, height:spot.grid_height || 1, cellWidth, cellHeight };
  }

  onLayoutPointerMove(event: PointerEvent) {
    if (this.drawGesture) { event.preventDefault(); this.updateDrawnArea(event); return; }
    const gesture = this.layoutGesture;
    if (!gesture) return;
    event.preventDefault();
    const columns = Math.max(1, Number(this.facilityForm.grid_columns) || 1);
    const rows = Math.max(1, Number(this.facilityForm.grid_rows) || 1);
    const dx = Math.round((event.clientX - gesture.startX) / gesture.cellWidth);
    const dy = Math.round((event.clientY - gesture.startY) / gesture.cellHeight);
    if (gesture.mode === 'move') {
      gesture.spot.grid_x = Math.min(Math.max(1, gesture.x + dx), Math.max(1, columns - gesture.width + 1));
      gesture.spot.grid_y = Math.min(Math.max(1, gesture.y + dy), Math.max(1, rows - gesture.height + 1));
    } else {
      gesture.spot.grid_width = Math.min(Math.max(1, gesture.width + dx), columns - gesture.x + 1);
      gesture.spot.grid_height = Math.min(Math.max(1, gesture.height + dy), rows - gesture.y + 1);
    }
    this.layoutDirty = true;
  }

  endLayoutGesture() {
    if (this.drawGesture && this.drawnArea) {
      this.selectedEditorSpotId = '';
      this.showAreaName = true;
      this.cdr.detectChanges();
      this.areaNameInput?.nativeElement.focus();
    }
    this.layoutGesture = null; this.drawGesture = null;
  }

  cancelLayoutGesture() { this.layoutGesture = null; this.drawGesture = null; this.drawnArea = null; this.showAreaName = false; }

  onLayoutSizeChange() {
    this.drawnArea = null;
    this.facilityForm.grid_columns = Math.min(12, Math.max(1, Number(this.facilityForm.grid_columns) || 1));
    this.facilityForm.grid_rows = Math.min(20, Math.max(1, Number(this.facilityForm.grid_rows) || 1));
    for (const spot of this.spotDrafts) {
      spot.grid_x = Math.min(spot.grid_x || 1, this.facilityForm.grid_columns);
      spot.grid_y = Math.min(spot.grid_y || 1, this.facilityForm.grid_rows);
      spot.grid_width = Math.min(spot.grid_width || 1, this.facilityForm.grid_columns - spot.grid_x + 1);
      spot.grid_height = Math.min(spot.grid_height || 1, this.facilityForm.grid_rows - spot.grid_y + 1);
    }
    this.layoutDirty = true;
  }

  onMonthlySpotItemClick(item: AllocationItem) {
    if (item.booking) this.openEditModal(item.booking);
    else {
      this.mobileBookingFormOpen=true; this.form.spot_id=item.spot.id;
      const month=String(this.selectedMonth).padStart(2,'0'); this.form.start_month=`${this.selectedYear}-${month}`; this.form.end_month=`${this.selectedYear}-${month}`;
      window.scrollTo({top:0,behavior:'smooth'}); this.cdr.detectChanges();
    }
  }

  onFilterChange() {
    this.selectedYear = Number(this.selectedYear);
    this.selectedMonth = Number(this.selectedMonth);
    this.refreshActiveTab();
  }

  // ── Helpers to format "YYYY-MM" to full API date strings ──

  getStartDateFromMonthStr(monthStr: string): string {
    return `${monthStr}-01`;
  }

  getEndDateFromMonthStr(monthStr: string): string {
    const parts = monthStr.split('-');
    if (parts.length !== 2) return '';
    const y = Number(parts[0]);
    const m = Number(parts[1]);
    const lastDay = new Date(y, m, 0).getDate();
    return `${monthStr}-${String(lastDay).padStart(2, '0')}`;
  }

  // Helper to extract YYYY-MM from YYYY-MM-DD
  getMonthStrFromDate(dateStr: string): string {
    if (!dateStr || dateStr.length < 7) return '';
    return dateStr.substring(0, 7);
  }

  // ── Form Actions ──

  async checkAndBook() {
    if (!this.form.spot_id || !this.form.user_name || !this.form.start_month || !this.form.end_month) return;
    
    const start_date = this.getStartDateFromMonthStr(this.form.start_month);
    const end_date = this.getEndDateFromMonthStr(this.form.end_month);

    this.formLoading = true;
    this.formError = '';
    this.formSuccess = '';
    this.availability = null;
    
    try {
      this.availability = await this.bookingService.checkAvailability(this.form.spot_id, start_date, end_date);
      if (this.availability.available) {
        await this.submitNewBooking(start_date, end_date);
      }
    } catch (e: any) {
      this.formError = e?.error?.detail || e?.message || 'Check failed.';
    } finally {
      this.formLoading = false;
      this.cdr.detectChanges();
    }
  }

  pickAlternative(alt: { id: string; name: string }) {
    this.form.spot_id = alt.id;
    this.availability = null;
    this.formError = '';
    this.cdr.detectChanges();
  }

  async submitNewBooking(start_date: string, end_date: string) {
    try {
      await this.bookingService.createBooking({
        spot_id: this.form.spot_id, user_name: this.form.user_name,
        species: this.form.species, start_date, end_date, comment: this.form.comment,
      });
      this.formSuccess = 'Booking successfully created!';
      this.availability = null;
      this.form.comment = '';
      this.form.species = '';
      this.refreshActiveTab();
      
      setTimeout(() => {
        this.formSuccess = '';
        this.mobileBookingFormOpen = false;
        this.cdr.detectChanges();
      }, 3000);
    } catch (e: any) {
      this.formError = e?.error?.detail || e?.message || 'Failed to save booking.';
    }
  }

  // ── Edit/Delete Actions ──

  openEditModal(booking: FacilityBooking) {
    this.selectedBooking = booking;
    this.editForm = {
      user_name: booking.user_name, species: booking.species || '',
      start_month: this.getMonthStrFromDate(booking.start_date),
      end_month: this.getMonthStrFromDate(booking.end_date),
      comment: booking.comment || ''
    };
    this.showEditModal = true;
    this.showDeleteConfirm = false;
    this.formError = '';
    this.cdr.detectChanges();
  }

  closeEditModal() {
    this.showEditModal = false;
    this.selectedBooking = null;
    this.formError = '';
    this.cdr.detectChanges();
  }

  async saveEdit() {
    if (!this.selectedBooking) return;
    this.formLoading = true;
    this.formError = '';

    const start_date = this.getStartDateFromMonthStr(this.editForm.start_month);
    const end_date = this.getEndDateFromMonthStr(this.editForm.end_month);

    try {
      await this.bookingService.updateBooking(this.selectedBooking.id, {
        user_name: this.editForm.user_name,
        species: this.editForm.species,
        start_date,
        end_date,
        comment: this.editForm.comment
      });
      this.closeEditModal();
      this.refreshActiveTab();
    } catch (e: any) {
      this.formError = e?.error?.detail || e?.message || 'Failed to update.';
    } finally {
      this.formLoading = false;
      this.cdr.detectChanges();
    }
  }

  async confirmDelete() {
    if (!this.selectedBooking) return;
    this.formLoading = true;
    try {
      await this.bookingService.deleteBooking(this.selectedBooking.id);
      this.closeEditModal();
      this.refreshActiveTab();
    } catch (e: any) {
      this.formError = e?.error?.detail || 'Failed to delete.';
    } finally {
      this.formLoading = false;
      this.cdr.detectChanges();
    }
  }

  // ── Table View Helpers ──
  
  get filteredBookings() {
    const now = new Date();
    now.setHours(0,0,0,0);
    
    return this.allBookings.filter(b => {
      if (this.showExpired) return true;
      const end = new Date(b.end_date + 'T00:00:00');
      return end >= now;
    });
  }

  // ── Map View Helpers (Floor plan click actions) ──

  getSpotByName(name: string): AllocationItem | undefined {
    return this.allocation.find(a => a.spot.name === name);
  }

  get monthLabel(): string {
    return this.months.find(m => m.value === Number(this.selectedMonth))?.label || '';
  }

  prevMonth() {
    if (this.selectedMonth === 1) { this.selectedMonth = 12; this.selectedYear--; }
    else { this.selectedMonth--; }
    this.onFilterChange();
  }

  nextMonth() {
    if (this.selectedMonth === 12) { this.selectedMonth = 1; this.selectedYear++; }
    else { this.selectedMonth++; }
    this.onFilterChange();
  }

  isBooked(name: string): boolean {
    return !!this.getSpotByName(name)?.booking;
  }

  getBookingInfo(name: string): string {
    const b = this.getSpotByName(name)?.booking;
    return b ? `${b.user_name} · ${b.species || '—'}` : '';
  }

  onMonthlySpotClick(name: string) {
    const item = this.getSpotByName(name);
    if (!item) return;

    if (item.booking) {
      // Booked -> open booking detail modal
      this.openEditModal(item.booking);
    } else {
      // Available -> select in top form
      this.mobileBookingFormOpen = true;
      this.form.spot_id = item.spot.id;
      const mStr = String(this.selectedMonth).padStart(2, '0');
      this.form.start_month = `${this.selectedYear}-${mStr}`;
      this.form.end_month = `${this.selectedYear}-${mStr}`;
      this.cdr.detectChanges();
      
      // Smooth scroll to top form
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  }

  // ── Yearly Matrix Drag Selection & Interaction ──

  private yearRange: { pointerId:number; grid:HTMLElement } | null = null;

  beginYearRange(event:PointerEvent, spotId:string, month:number, booked:boolean) {
    if (event.button !== 0) return;
    event.preventDefault();
    if (booked) { this.fetchAndOpenBooking(spotId, month); return; }
    const target = event.currentTarget as HTMLElement;
    const grid = target.closest('.mobile-yearly-grid') as HTMLElement;
    target.setPointerCapture(event.pointerId);
    this.yearRange = { pointerId:event.pointerId, grid };
    this.onYearlyCellMouseDown(spotId, month, false, null);
  }

  @HostListener('document:pointermove', ['$event'])
  onDocumentPointerMove(event: PointerEvent) {
    this.onLayoutPointerMove(event);
    this.moveYearRange(event);
  }

  @HostListener('document:pointerup')
  onDocumentPointerUp() {
    this.endLayoutGesture();
    this.finishYearRange();
  }

  @HostListener('document:pointercancel')
  onDocumentPointerCancel() {
    this.cancelLayoutGesture();
    this.cancelYearRange();
  }

  moveYearRange(event:PointerEvent) {
    if (!this.yearRange || this.yearRange.pointerId !== event.pointerId) return;
    event.preventDefault();
    const rect = this.yearRange.grid.getBoundingClientRect();
    const month = Math.max(1,Math.min(12,Math.floor((event.clientX-rect.left)/rect.width*12)+1));
    const months = this.yearlySummary?.summary.find(s => s.spot.id === this.dragSpotId)?.months;
    const start = this.dragStartMonth!;
    const direction = month >= start ? 1 : -1;
    let end = start;
    for (let m=start; direction > 0 ? m<=month : m>=month; m+=direction) {
      if (months?.find(item => item.month === m)?.booked) break;
      end = m;
    }
    this.dragCurrentMonth = end;
    this.cdr.detectChanges();
  }

  finishYearRange() {
    if (!this.yearRange) return;
    this.yearRange = null;
    this.onGlobalMouseUp();
  }

  cancelYearRange() {
    this.yearRange = null; this.isDragging = false;
    this.dragSpotId = null; this.dragStartMonth = null; this.dragCurrentMonth = null;
  }

  onYearlyCellMouseDown(spotId: string, monthVal: number, booked: boolean, userName: string | null) {
    if (booked) {
      // Cell is already booked -> Open modal displaying booking details!
      this.fetchAndOpenBooking(spotId, monthVal);
      return;
    }
    
    // Start drag selection
    this.isDragging = true;
    this.dragSpotId = spotId;
    this.dragStartMonth = monthVal;
    this.dragCurrentMonth = monthVal;
    this.cdr.detectChanges();
  }

  onYearlyCellMouseEnter(spotId: string, monthVal: number, booked: boolean) {
    if (!this.isDragging || spotId !== this.dragSpotId || booked) return;
    this.dragCurrentMonth = monthVal;
    this.cdr.detectChanges();
  }

  onYearlyCellTouchStart(event: TouchEvent) {
    const touch = event.touches[0];
    if (!touch) return;
    this.yearlyTouchStartX = touch.clientX;
    this.yearlyTouchStartY = touch.clientY;
  }

  onYearlyCellTouchEnd(event: TouchEvent, spotId: string, monthVal: number, booked: boolean) {
    const touch = event.changedTouches[0];
    if (!touch) return;
    const moved = Math.hypot(touch.clientX - this.yearlyTouchStartX, touch.clientY - this.yearlyTouchStartY);
    // A swipe remains table scrolling; a deliberate tap opens/selects the cell.
    if (moved > 10) return;
    event.preventDefault();
    if (booked) {
      this.fetchAndOpenBooking(spotId, monthVal);
      return;
    }
    this.mobileBookingFormOpen = true;
    this.form.spot_id = spotId;
    const month = String(monthVal).padStart(2, '0');
    this.form.start_month = `${this.selectedYear}-${month}`;
    this.form.end_month = `${this.selectedYear}-${month}`;
    this.formSuccess = `Selected: ${this.months[monthVal - 1].label}`;
    window.scrollTo({ top: 0, behavior: 'smooth' });
    this.cdr.detectChanges();
  }

  onYearlyCellClick(spotId: string, monthVal: number, booked: boolean) {
    if (booked) {
      this.fetchAndOpenBooking(spotId, monthVal);
      return;
    }
    this.mobileBookingFormOpen = true;
    this.form.spot_id = spotId;
    const month = String(monthVal).padStart(2, '0');
    this.form.start_month = `${this.selectedYear}-${month}`;
    this.form.end_month = `${this.selectedYear}-${month}`;
    this.formSuccess = `Selected: ${this.months[monthVal - 1].label}`;
    window.scrollTo({ top: 0, behavior: 'smooth' });
    this.cdr.detectChanges();
  }

  @HostListener('document:mouseup')
  onGlobalMouseUp() {
    if (!this.isDragging) return;
    
    if (this.dragSpotId && this.dragStartMonth !== null && this.dragCurrentMonth !== null) {
      const m1 = Math.min(this.dragStartMonth, this.dragCurrentMonth);
      const m2 = Math.max(this.dragStartMonth, this.dragCurrentMonth);
      
      // Populate Top Booking Form
      this.mobileBookingFormOpen = true;
      this.form.spot_id = this.dragSpotId;
      this.form.start_month = `${this.selectedYear}-${String(m1).padStart(2, '0')}`;
      this.form.end_month = `${this.selectedYear}-${String(m2).padStart(2, '0')}`;
      
      this.formSuccess = `Selected range: ${this.months[m1-1].label} — ${this.months[m2-1].label}`;
      setTimeout(() => { this.formSuccess = ''; this.cdr.detectChanges(); }, 4000);
      
      // Smooth scroll to top form
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }

    // Reset Drag state
    this.isDragging = false;
    this.dragSpotId = null;
    this.dragStartMonth = null;
    this.dragCurrentMonth = null;
    this.cdr.detectChanges();
  }

  isCellSelected(spotId: string, monthVal: number): boolean {
    if (!this.isDragging || spotId !== this.dragSpotId || this.dragStartMonth === null || this.dragCurrentMonth === null) {
      return false;
    }
    const m1 = Math.min(this.dragStartMonth, this.dragCurrentMonth);
    const m2 = Math.max(this.dragStartMonth, this.dragCurrentMonth);
    return monthVal >= m1 && monthVal <= m2;
  }

  async fetchAndOpenBooking(spotId: string, monthVal: number) {
    this.formLoading = true;
    try {
      const bookings = await this.bookingService.getBookings(Number(this.selectedYear), monthVal, spotId);
      if (bookings && bookings.length > 0) {
        this.openEditModal(bookings[0]);
      }
    } catch (e: any) {
      this.error = 'Failed to load booking details.';
    } finally {
      this.formLoading = false;
      this.cdr.detectChanges();
    }
  }

  // ── Common Helpers ──

  formatDate(d: string): string {
    if (!d) return '';
    return new Date(d + 'T00:00:00').toLocaleDateString('en-AU', { year: 'numeric', month: 'short', day: 'numeric' });
  }

  formatMonth(monthStr: string): string {
    if (!monthStr) return '';
    const parts = monthStr.split('-');
    if (parts.length !== 2) return monthStr;
    const mIdx = Number(parts[1]) - 1;
    return `${this.months[mIdx]?.label} ${parts[0]}`;
  }
}
