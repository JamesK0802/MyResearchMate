import { Component, Input, Output, EventEmitter } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { calculateStorageLocation, makeStoragePart, StorageLocationRule, StorageRulePart, storagePartValue } from '../utils/storage-location-rules';

@Component({
  selector: 'app-location-rule-designer', standalone: true, imports: [CommonModule, FormsModule],
  template: `
    <section class="examples" aria-label="Location examples">
      <div class="examples-scroll">
        <div class="example-row" *ngFor="let item of examples; let i=index">
        <input [(ngModel)]="item.barcode" (ngModelChange)="exampleChanged(i)" placeholder="Barcode" [attr.aria-label]="'Example barcode ' + (i + 1)">
        <span class="arrow" aria-hidden="true">→</span>
        <input [(ngModel)]="item.location" placeholder="Location" [attr.aria-label]="'Expected location ' + (i + 1)">
        <button *ngIf="examples.length > 1" type="button" class="row-remove" (click)="removeExample(i)" [attr.aria-label]="'Remove example ' + (i + 1)">×</button>
        </div>
      </div>
      <button type="button" class="icon-add" (click)="addExample()" aria-label="Add another example" title="Add another example">＋</button>
    </section>

    <section class="saved">
      <div class="section-heading rules-heading">
        <h3>Rules</h3>
        <button *ngIf="editable" type="button" class="primary add-rule" (click)="createRule()">＋ Add new rule</button>
      </div>
      <div class="empty-rules" *ngIf="!rules.length">No rules yet. Add a rule when you are ready.</div>
      <article *ngFor="let rule of rules; let i=index">
        <div class="rule-row"><button type="button" (click)="selected=selected===rule?null:rule"><span class="rule-index">{{i+1}}</span> {{rule.name}} {{rule.enabled ? '' : '(disabled)'}} <span>{{selected===rule?'Close':'Edit'}}</span></button>
          <button *ngIf="editable" type="button" (click)="move(i,-1)" [disabled]="i===0" aria-label="Move rule up">↑</button>
          <button *ngIf="editable" type="button" (click)="move(i,1)" [disabled]="i===rules.length-1" aria-label="Move rule down">↓</button>
        </div>
        <div *ngIf="selected===rule" class="editor">
          <div class="rule-basics">
            <label>Rule name<input [(ngModel)]="rule.name" [disabled]="!editable"></label>
            <label>Trigger<select [(ngModel)]="rule.match.type" [disabled]="!editable"><option value="always">Any barcode</option><option value="starts_with">Starts with</option><option value="ends_with">Ends with</option><option value="contains">Contains</option><option *ngIf="rule.match.type==='equals'" value="equals">Existing exact match</option></select></label>
            <label *ngIf="rule.match.type!=='always'">Value<input [(ngModel)]="rule.match.value" [disabled]="!editable" placeholder="ADS"></label>
            <label>Between parts<select [(ngModel)]="rule.separator" [disabled]="!editable"><option value=" ">Space</option><option value="">Nothing</option><option value=" / "> / </option><option value="_">_</option><option value="-">-</option></select></label>
          </div>
          <label class="inline"><input type="checkbox" [(ngModel)]="rule.enabled" [disabled]="!editable"> Rule enabled</label>
          <div class="build-heading"><strong>Build the location</strong><span>Parts are joined in this order.</span></div>
          <div class="part" *ngFor="let part of rule.parts; let j=index">
            <div class="part-head">
              <select [ngModel]="partKind(part)" (ngModelChange)="changePartKind(part,$event)" [disabled]="!editable" [attr.aria-label]="'Action ' + (j + 1)">
                <option value="insert">Insert</option><option value="replace">Replace</option><option value="keep">Keep as-is</option><option *ngIf="legacy(part)" value="legacy">Existing advanced step</option>
              </select>
              <span>{{ describe(part) }}</span>
              <div class="part-actions" *ngIf="editable"><button type="button" (click)="movePart(rule,j,-1)" [disabled]="j===0" aria-label="Move step up">↑</button><button type="button" (click)="movePart(rule,j,1)" [disabled]="j===rule.parts.length-1" aria-label="Move step down">↓</button><button type="button" class="delete" (click)="rule.parts.splice(j,1)" aria-label="Delete step">×</button></div>
            </div>
            <div class="fields" *ngIf="!legacy(part)">
              <ng-container *ngIf="partKind(part)==='insert'">
                <label>Text<input [(ngModel)]="part.value" [disabled]="!editable" placeholder="Text to insert"></label>
                <label>Place it<select [ngModel]="insertPosition(rule, part)" (ngModelChange)="setInsertPosition(rule, part, $event)" [disabled]="!editable"><option [ngValue]="0">At the beginning</option><option *ngFor="let other of rule.parts; let position=index" [ngValue]="position + 1" [disabled]="other === part">After part {{ position + 1 }}</option></select></label>
              </ng-container>
              <ng-container *ngIf="partKind(part)!=='insert'">
                <label>Characters<select [ngModel]="source(part)" (ngModelChange)="setSource(part,$event)" [disabled]="!editable"><option value="barcode">Entire barcode</option><option value="start">From start</option><option value="end">From end</option></select></label>
                <div class="numbers" *ngIf="source(part)!=='barcode'"><label>Skip<input type="number" min="0" [ngModel]="part.start-1" (ngModelChange)="setRange(part,$event,part.end-part.start+1)" [disabled]="!editable"></label><span>then take</span><label>Count<input type="number" min="1" [ngModel]="part.end-part.start+1" (ngModelChange)="setRange(part,part.start-1,$event)" [disabled]="!editable"></label></div>
                <div class="replacement" *ngIf="partKind(part)==='replace'">
                  <label>Replace with<input [ngModel]="replacementTemplate(part)" (ngModelChange)="setReplacementTemplate(part, $event)" [disabled]="!editable" placeholder="0{1}{2}"></label>
                  <div class="token-hint"><span class="token">{1}</span> first selected character <span class="token token-two">{2}</span> second <span class="token token-three">{3}</span> third</div>
                  <small *ngIf="sampleBarcode()">Produces <strong>{{ replacementPreview(part) }}</strong> for <strong>{{ sampleBarcode() }}</strong></small>
                </div>
              </ng-container>
            </div>
          </div>
          <div class="buttons" *ngIf="editable"><button type="button" (click)="add(rule,'text')">＋ Insert</button><button type="button" (click)="addReplace(rule)">＋ Replace</button><button type="button" (click)="add(rule,'characters')">＋ Keep as-is</button></div>
          <button *ngIf="editable" type="button" class="delete" (click)="remove(i)">Delete rule</button>
        </div>
      </article>
    </section>
  `,
  styles: [`
    :host{display:block;color:#243447;font-size:14px}section{padding:16px 18px;background:white;border:1px solid #dce5e1;border-radius:12px;margin:12px}
    h3{margin:0 0 3px;font-size:18px}p{margin:0;color:#62736c;font-size:13px;line-height:1.45}label{display:block;font-weight:700;font-size:12px;color:#52647a}
    input,select{display:block;box-sizing:border-box;width:100%;height:40px;padding:8px 10px;margin-top:5px;border:1px solid #cbd5d1;border-radius:7px;background:white;color:#243447;font:inherit}
    button{padding:8px 11px;min-height:40px;border:1px solid #bdcfc5;border-radius:8px;background:white;color:#176b40;font:inherit;cursor:pointer}button:disabled{opacity:.5;cursor:default}
    .primary{background:#176b40;color:white}.section-heading{display:flex;align-items:center;justify-content:space-between;gap:16px}.examples{position:sticky;top:0;z-index:3;display:flex;gap:8px;align-items:flex-start;margin:0 12px;padding:8px 18px;border-radius:0 0 10px 10px;box-shadow:0 5px 10px rgba(15,23,42,.06)}.examples-scroll{flex:1;max-height:132px;overflow-y:auto;padding-right:4px}.icon-add{flex:0 0 40px;width:40px;font-size:20px}
    .example-row{display:grid;grid-template-columns:minmax(120px,.75fr) 20px minmax(180px,1.5fr) 30px;gap:7px;align-items:center}.example-row+.example-row{margin-top:6px}.example-row input{margin:0}.arrow{text-align:center;color:#7a8a81}.row-remove{min-height:32px;height:32px;padding:4px;color:#b42318}
    .rules-heading{margin-bottom:12px}.add-rule{white-space:nowrap}.empty-rules{padding:22px;border:1px dashed #cbd5d1;border-radius:9px;text-align:center;color:#75857e;background:#fafcfb}
    output{display:block;padding:10px 12px;background:#eff8f2;color:#155c36;border-radius:8px;margin:12px 0;overflow-wrap:anywhere}
    .rule-row{display:flex;gap:5px;align-items:stretch}.rule-row>button:first-child{flex:1;text-align:left;overflow-wrap:anywhere}.rule-row>button:first-child>span:last-child{float:right;margin-left:8px}.rule-index{display:inline-grid;place-items:center;width:22px;height:22px;margin-right:6px;border-radius:50%;background:#e9f6ed;color:#176b40;font-weight:800}
    article{margin:9px 0}.editor{padding:14px;border:1px solid #dce5e1;border-radius:8px;background:#fbfcfb}.rule-basics{display:grid;grid-template-columns:1.2fr .8fr 1fr .7fr;gap:10px}.inline{display:flex;gap:8px;align-items:center;margin:12px 0}.inline input{width:20px;height:20px;margin:0}
    .build-heading{display:flex;align-items:baseline;gap:8px;margin:15px 0 8px}.build-heading span{color:#6b7b74;font-size:12px}.part{margin-top:8px;border:1px solid #dce5e1;border-radius:9px;background:white;overflow:hidden}.part-head{display:grid;grid-template-columns:120px 1fr auto;gap:8px;align-items:center;padding:8px}.part-head select{margin:0}.part-head>span{font-size:12px;color:#62736c;overflow-wrap:anywhere}.part-actions{display:flex;gap:4px}.part-actions button{min-height:40px;height:40px;padding:5px 9px}.fields{display:grid;grid-template-columns:minmax(150px,1fr) minmax(180px,2fr);gap:10px;align-items:end;padding:10px;background:#f6f8f7;border-top:1px solid #e4ebe7}
    .numbers{display:flex;gap:8px;align-items:end;flex-wrap:wrap}.numbers label{flex:0 0 80px}.numbers input{width:80px}.numbers span{padding-bottom:11px}.replacement{display:grid;grid-template-columns:minmax(180px,1fr) 1.5fr;gap:8px;align-items:end}.replacement small{grid-column:1/-1;color:#54705f}.token-hint{padding-bottom:8px;color:#607067;font-size:11px}.token{display:inline-block;padding:1px 4px;margin-right:3px;border-radius:4px;background:#e6f3ff;color:#176b9e;font-weight:800}.token-two{background:#fce8f3;color:#a21b62}.token-three{background:#fff3d6;color:#9b6700}.buttons{display:flex;gap:7px;flex-wrap:wrap;margin-top:10px}.delete{color:#b42318}
    @media(max-width:700px){section{margin:8px;padding:13px}.examples{margin:0 8px;padding:7px 13px}.rule-basics{grid-template-columns:1fr 1fr}.part-head{grid-template-columns:105px 1fr}.part-actions{grid-column:1/-1;justify-content:flex-end}.fields,.replacement{grid-template-columns:1fr}.rule-row{gap:3px}.rule-row button{padding:7px}.editor{padding:9px}}
    @media(max-width:430px){.example-row{grid-template-columns:1fr 16px 1fr 26px}.section-heading.rules-heading{align-items:stretch;flex-direction:column}.add-rule{width:100%}.rule-basics{grid-template-columns:1fr}}
  `]
})
export class LocationRuleDesignerComponent {
  @Input() rules: StorageLocationRule[] = [];
  @Input() editable = false;
  @Output() rulesChange = new EventEmitter<StorageLocationRule[]>();
  @Output() exampleChange = new EventEmitter<string>();
  examples = [{ barcode: '', location: '' }];
  selected: StorageLocationRule | null = null;
  get example() { return this.examples[0]?.barcode || ''; }
  addExample() { this.examples.push({barcode:'',location:''}); }
  removeExample(index:number) { this.examples.splice(index,1); if(index===0) this.exampleChange.emit(this.example); }
  exampleChanged(index:number) { if(index===0) this.exampleChange.emit(this.example); }
  sampleBarcode() { return this.examples.find(item => item.barcode.trim())?.barcode || ''; }
  createRule() {
    if(!this.editable) return;
    const rule:StorageLocationRule={id:globalThis.crypto?.randomUUID?.() || `rule-${Date.now()}-${Math.random()}`,name:'New location rule',enabled:true,match:{type:'always',value:''},separator:' ',parts:[]};
    this.selected=rule;this.rulesChange.emit([...this.rules,rule]);this.exampleChange.emit(this.example);
  }
  legacy(part: StorageRulePart) { return !['text','characters','characters_from_end','barcode'].includes(part.type); }
  partKind(part:StorageRulePart) { return part.type==='text'?'insert':this.legacy(part)?'legacy':part.template !== undefined || part.mappings?.length?'replace':'keep'; }
  source(part:StorageRulePart) { return part.type==='barcode'?'barcode':part.type==='characters_from_end'?'end':'start'; }
  setSource(part:StorageRulePart,source:'barcode'|'start'|'end') { part.type=source==='barcode'?'barcode':source==='end'?'characters_from_end':'characters'; if(source==='barcode'){part.start=1;part.end=1;} }
  changePartKind(part:StorageRulePart,kind:'insert'|'replace'|'keep'|'legacy') { if(kind==='legacy') return; if(kind==='insert'){part.type='text';part.value='';part.template=undefined;part.mappings=[];} else {if(part.type==='text'||this.legacy(part)) part.type='characters';part.value='';part.template=kind==='replace'?'{1}':undefined;part.mappings=[];} }
  describe(part: StorageRulePart): string {
    let text = part.type === 'text' ? `Add “${part.value || 'your text'}”` : part.type === 'barcode' ? 'Use the whole barcode' : this.legacy(part) ? (part.label || 'Saved extraction') : `From the ${part.type === 'characters' ? 'start' : 'end'}, skip ${part.start-1} and take ${part.end-part.start+1}`;
    if (part.template !== undefined) text += `: ${part.template}`;
    else if (part.mappings?.length) text += ': ' + part.mappings.map(m=>`“${m.from}” → “${m.to}”`).join(', ');
    if (part.prefix) text += `; add “${part.prefix}” before`;
    if (part.suffix) text += `; add “${part.suffix}” after`;
    if (part.trimStart || part.trimEnd) text += `; remove ${part.trimStart || 0} from start, ${part.trimEnd || 0} from end`;
    return text;
  }
  setRange(part: StorageRulePart, skip: number, count: number) { part.start=Math.max(0,Math.floor(Number(skip)||0))+1; part.end=part.start+Math.max(1,Math.floor(Number(count)||1))-1; }
  add(rule: StorageLocationRule, type: 'text'|'characters') { const part=makeStoragePart(type); part.joiner=undefined; if(type==='characters'){part.start=1;part.end=1;} rule.parts.push(part); }
  addReplace(rule:StorageLocationRule) { const part=makeStoragePart('characters_from_end');part.start=1;part.end=2;part.joiner=undefined;part.template='{1}{2}';part.mappings=[];rule.parts.push(part); }
  replacementTemplate(part:StorageRulePart) { return part.template ?? part.mappings?.[0]?.to ?? ''; }
  setReplacementTemplate(part:StorageRulePart, template:string) { part.template=template;part.mappings=[]; }
  replacementPreview(part:StorageRulePart) { const barcode=this.sampleBarcode(); if(!barcode) return '—'; const raw=storagePartValue(barcode,{...part,template:undefined,mappings:[]}); return (part.template || '').replace(/\{(\d+)\}/g,(_match,indexText)=>raw.charAt(Math.max(0,Number(indexText)-1))||''); }
  insertPosition(rule:StorageLocationRule,part:StorageRulePart) { return Math.max(0,rule.parts.indexOf(part)); }
  setInsertPosition(rule:StorageLocationRule,part:StorageRulePart,target:number) { const from=rule.parts.indexOf(part); if(from<0)return; rule.parts.splice(from,1); let index=Math.max(0,Number(target)||0); if(from<index)index--; rule.parts.splice(Math.min(index,rule.parts.length),0,part); }
  move(i:number, d:number) { const next=[...this.rules]; [next[i],next[i+d]]=[next[i+d],next[i]];this.rulesChange.emit(next); }
  remove(i:number) { this.rulesChange.emit(this.rules.filter((_,index)=>index!==i));this.selected=null; }
  movePart(rule:StorageLocationRule,i:number,d:number) { [rule.parts[i],rule.parts[i+d]]=[rule.parts[i+d],rule.parts[i]]; }
}
