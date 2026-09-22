import { Component, Input, Output, EventEmitter } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { calculateStorageLocation, makeStoragePart, StorageLocationRule, StorageRulePart, storagePartValue } from '../utils/storage-location-rules';
import { suggestLocationRule } from '../utils/suggest-location-rule';

@Component({
  selector: 'app-location-rule-designer', standalone: true, imports: [CommonModule, FormsModule],
  template: `
    <section class="start">
      <h3>Show one example</h3>
      <p>Enter a barcode and the location you want to see.</p>
      <label>Barcode<input [(ngModel)]="example" (ngModelChange)="suggestion=null" placeholder="ADS572"></label>
      <label>Desired location<input [(ngModel)]="desired" (ngModelChange)="suggestion=null" placeholder="Admin Room S level 5 tray barcode 72"></label>
      <button type="button" class="primary" (click)="suggest()">Suggest a rule</button>
      <p role="alert" *ngIf="error">{{error}}</p>
      <div class="suggestion" *ngIf="suggestion">
        <strong>{{ preview(example, suggestion) }}</strong>
        <ol><li *ngFor="let part of suggestion.parts">{{ describe(part) }}</li></ol>
        <p>This is a guess from one example. Check a second barcode, especially if code lengths vary.</p>
        <label>Try another barcode<input [(ngModel)]="checkBarcode" placeholder="ADS683"></label>
        <output>{{ preview(checkBarcode, suggestion) }}</output>
        <button *ngIf="editable" type="button" class="primary" (click)="accept()">Use this rule</button>
      </div>
    </section>
    <section class="manual" *ngIf="editable">
      <button type="button" (click)="manualOpen=!manualOpen">{{manualOpen ? '−' : '+'}} Set a rule myself</button>
      <div *ngIf="manualOpen">
        <label>What do you want to do?<select [(ngModel)]="operation"><option value="compose">Build a location name</option><option value="replace">Replace characters in a barcode</option></select></label>
        <ng-container *ngIf="operation==='replace'">
          <label>Count from<select [(ngModel)]="side"><option value="start">Start</option><option value="end">End</option></select></label>
          <div class="numbers"><label>Skip<input type="number" min="0" [(ngModel)]="skip"></label><span>characters, then take</span><label>Count<input type="number" min="1" [(ngModel)]="count"></label></div>
          <label>If these characters equal<input [(ngModel)]="find" placeholder="XX"></label>
          <label>Replace them with<input [(ngModel)]="replacement" placeholder="0XX"></label>
          <p>The rest of the barcode stays in place. Other values stay unchanged.</p>
        </ng-container>
        <button type="button" (click)="createManual()" [disabled]="operation==='replace' && (!find || !replacement)">Create rule</button>
      </div>
    </section>
    <section class="saved" *ngIf="rules.length">
      <h3>Your rules</h3><p>The first enabled matching rule is used.</p>
      <article *ngFor="let rule of rules; let i=index">
        <div class="rule-row"><button type="button" (click)="selected=selected===rule?null:rule">{{i+1}}. {{rule.name}} {{rule.enabled ? '' : '(disabled)'}} <span>{{selected===rule?'−':'Edit'}}</span></button>
          <button *ngIf="editable" type="button" (click)="move(i,-1)" [disabled]="i===0" aria-label="Move rule up">↑</button>
          <button *ngIf="editable" type="button" (click)="move(i,1)" [disabled]="i===rules.length-1" aria-label="Move rule down">↓</button>
        </div>
        <div *ngIf="selected===rule" class="editor">
          <label>Rule name<input [(ngModel)]="rule.name" [disabled]="!editable"></label>
          <label class="inline"><input type="checkbox" [(ngModel)]="rule.enabled" [disabled]="!editable"> Use this rule</label>
          <label>Use for barcodes that<select [(ngModel)]="rule.match.type" [disabled]="!editable"><option value="always">Match any barcode</option><option value="starts_with">Start with</option><option value="ends_with">End with</option><option value="contains">Contain</option><option value="equals">Exactly match</option></select></label>
          <input *ngIf="rule.match.type!=='always'" [(ngModel)]="rule.match.value" [disabled]="!editable" aria-label="Barcode condition">
          <div class="part" *ngFor="let part of rule.parts; let j=index">
            <div class="rule-row"><button type="button" (click)="editing=editing===part?null:part">{{j+1}}. {{describe(part)}} <span>{{editing===part?'−':'Edit'}}</span></button>
              <button *ngIf="editable" type="button" (click)="movePart(rule,j,-1)" [disabled]="j===0" aria-label="Move part up">↑</button>
              <button *ngIf="editable" type="button" (click)="rule.parts.splice(j,1)" aria-label="Delete part">×</button>
            </div>
            <div *ngIf="editing===part" class="fields">
              <label>Use<select [(ngModel)]="part.type" [disabled]="!editable">
                <option value="text">Words I type</option><option value="characters">Characters from the start</option><option value="characters_from_end">Characters from the end</option><option value="barcode">Whole barcode</option>
                <option *ngIf="legacy(part)" [value]="part.type">Existing advanced extraction</option>
              </select></label>
              <label *ngIf="part.type==='text'">Text<input [(ngModel)]="part.value" [disabled]="!editable"></label>
              <div class="numbers" *ngIf="part.type==='characters'||part.type==='characters_from_end'">
                <label>Skip<input type="number" min="0" [ngModel]="part.start-1" (ngModelChange)="setRange(part,$event,part.end-part.start+1)" [disabled]="!editable"></label>
                <span>characters, then take</span><label>Count<input type="number" min="1" [ngModel]="part.end-part.start+1" (ngModelChange)="setRange(part,part.start-1,$event)" [disabled]="!editable"></label>
              </div>
              <p *ngIf="legacy(part)">This saved extraction uses advanced settings, available below.</p>
              <ng-container *ngIf="part.type!=='text'">
                <div *ngFor="let mapping of part.mappings; let m=index" class="mapping">
                  <label>If it equals<input [(ngModel)]="mapping.from" [disabled]="!editable"></label><label>Use instead<input [(ngModel)]="mapping.to" [disabled]="!editable"></label>
                  <button *ngIf="editable" type="button" (click)="part.mappings!.splice(m,1)" aria-label="Remove replacement">×</button>
                </div>
                <button *ngIf="editable" type="button" (click)="addMapping(part)">+ Replace a specific value</button>
                <label>Text before<input [(ngModel)]="part.prefix" placeholder="level " [disabled]="!editable"></label>
                <label>Text after<input [(ngModel)]="part.suffix" [disabled]="!editable"></label>
              </ng-container>
              <label *ngIf="j>0">Join with<input [ngModel]="part.joiner ?? rule.separator" (ngModelChange)="part.joiner=$event" [disabled]="!editable" placeholder="Space, / or nothing"></label>
              <output>{{value(part)}}</output>
            </div>
          </div>
          <div class="buttons" *ngIf="editable"><button type="button" (click)="add(rule,'text')">+ Add words</button><button type="button" (click)="add(rule,'characters')">+ Take barcode characters</button></div>
          <output>{{preview(example,rule)}}</output>
          <button *ngIf="editable" type="button" class="delete" (click)="remove(i)">Delete rule</button>
        </div>
      </article>
    </section>
  `,
  styles: [`
    :host{display:block;color:#243447;font-size:14px}section{padding:18px;background:white;border:1px solid #dce5e1;border-radius:12px;margin:12px}
    h3{margin:0 0 8px;font-size:18px}p{color:#62736c;font-size:13px;line-height:1.5}label{display:block;font-weight:600;margin:12px 0 6px}
    input,select{display:block;box-sizing:border-box;width:100%;padding:10px;margin-top:5px;min-height:42px;border:1px solid #cbd5d1;border-radius:7px;background:white;color:#243447;font:inherit}
    button{padding:10px 12px;min-height:42px;border:1px solid #bdcfc5;border-radius:8px;background:white;color:#176b40;font:inherit;cursor:pointer}button:disabled{opacity:.5;cursor:default}
    .primary{background:#176b40;color:white;margin-top:12px}.suggestion{padding:14px;background:#f1faf4;border-radius:10px;margin-top:14px}.suggestion li{margin:8px 0;line-height:1.5}
    output{display:block;padding:12px;background:#eff8f2;color:#155c36;border-radius:8px;margin:12px 0;overflow-wrap:anywhere}
    .rule-row{display:flex;gap:5px;align-items:start}.rule-row>button:first-child{flex:1;text-align:left;overflow-wrap:anywhere}.rule-row span{float:right;margin-left:8px}
    article{margin:12px 0}.editor{padding:12px;border:1px solid #dce5e1;border-radius:8px}.part{margin-top:12px}.fields{padding:12px;background:#f6f8f7}
    .numbers{display:flex;gap:10px;align-items:center;flex-wrap:wrap}.numbers input{width:75px}.numbers span{padding-top:24px}.mapping{display:flex;gap:8px;align-items:end}.mapping label{min-width:0;flex:1}
    .inline{display:flex;gap:8px;align-items:center}.inline input{width:20px;min-height:20px;margin:0}.buttons{display:flex;gap:8px;flex-wrap:wrap;margin-top:12px}.delete{color:#b42318}
    @media(max-width:600px){section{margin:8px;padding:14px}.rule-row{gap:3px}.rule-row button{padding:8px}.editor{padding:8px}.fields{padding:8px}}
  `]
})
export class LocationRuleDesignerComponent {
  @Input() rules: StorageLocationRule[] = [];
  @Input() editable = false;
  @Output() rulesChange = new EventEmitter<StorageLocationRule[]>();
  @Output() exampleChange = new EventEmitter<string>();
  example = 'ADS572'; desired = 'Admin Room S level 5 tray barcode 72'; checkBarcode = 'ADS683';
  suggestion: StorageLocationRule | null = null; selected: StorageLocationRule | null = null;
  editing: StorageRulePart | null = null; error = ''; manualOpen = false;
  operation = 'compose'; side = 'end'; skip = 0; count = 2; find = 'XX'; replacement = '0XX';
  suggest() {
    this.suggestion = suggestLocationRule(this.example, this.desired);
    this.error = this.suggestion ? '' : 'Could not identify barcode fields in this example. Try spaces between the copied fields, or use “Set a rule myself”.';
  }
  accept() {
    if (!this.editable || !this.suggestion) return;
    this.selected = this.suggestion; this.rulesChange.emit([this.suggestion, ...this.rules]);
    this.exampleChange.emit(this.example); this.suggestion = null;
  }
  preview(barcode: string, rule: StorageLocationRule) { return calculateStorageLocation(barcode, [rule]) || 'No matching location'; }
  value(part: StorageRulePart) { return storagePartValue(this.example, part) || 'No characters selected'; }
  legacy(part: StorageRulePart) { return !['text','characters','characters_from_end','barcode'].includes(part.type); }
  describe(part: StorageRulePart): string {
    let text = part.type === 'text' ? `Add “${part.value || 'your text'}”` : part.type === 'barcode' ? 'Use the whole barcode' : this.legacy(part) ? (part.label || 'Saved extraction') : `From the ${part.type === 'characters' ? 'start' : 'end'}, skip ${part.start-1} and take ${part.end-part.start+1}`;
    if (part.mappings?.length) text += ': ' + part.mappings.map(m=>`“${m.from}” → “${m.to}”`).join(', ');
    if (part.prefix) text += `; add “${part.prefix}” before`;
    if (part.suffix) text += `; add “${part.suffix}” after`;
    if (part.trimStart || part.trimEnd) text += `; remove ${part.trimStart || 0} from start, ${part.trimEnd || 0} from end`;
    return text;
  }
  setRange(part: StorageRulePart, skip: number, count: number) { part.start=Math.max(0,Math.floor(Number(skip)||0))+1; part.end=part.start+Math.max(1,Math.floor(Number(count)||1))-1; }
  addMapping(part: StorageRulePart) { (part.mappings ||= []).push({from:'',to:''}); }
  add(rule: StorageLocationRule, type: 'text'|'characters') { const part=makeStoragePart(type); part.joiner=rule.parts.length?' ':''; rule.parts.push(part); this.editing=part; }
  move(i:number, d:number) { const next=[...this.rules]; [next[i],next[i+d]]=[next[i+d],next[i]];this.rulesChange.emit(next); }
  remove(i:number) { this.rulesChange.emit(this.rules.filter((_,index)=>index!==i));this.selected=null; }
  movePart(rule:StorageLocationRule,i:number,d:number) { [rule.parts[i],rule.parts[i+d]]=[rule.parts[i+d],rule.parts[i]]; }
  createManual() {
    if (!this.editable) return;
    const rule:StorageLocationRule={id:globalThis.crypto?.randomUUID?.() || `rule-${Date.now()}-${Math.random()}`,name:'New location',enabled:true,match:{type:'always',value:''},separator:' ',parts:[]};
    if(this.operation==='replace') {
      const skip=Math.max(0,Math.floor(Number(this.skip)||0)), count=Math.max(1,Math.floor(Number(this.count)||1));
      const selected={...makeStoragePart(this.side==='start'?'characters':'characters_from_end'),start:skip+1,end:skip+count,mappings:[{from:this.find,to:this.replacement}],joiner:''};
      const remainder={...makeStoragePart('barcode'),joiner:'',...(this.side==='start'?{trimStart:skip+count}:{trimEnd:skip+count})};
      const untouched={...makeStoragePart(this.side==='start'?'characters':'characters_from_end'),start:1,end:skip,joiner:''};
      rule.parts=this.side==='start'?[...(skip?[untouched]:[]),selected,remainder]:[remainder,selected,...(skip?[untouched]:[])];
      rule.name=`Replace “${this.find}” with “${this.replacement}”`;
    }
    this.selected=rule;this.rulesChange.emit([rule,...this.rules]);this.exampleChange.emit(this.example);this.manualOpen=false;
  }
}
