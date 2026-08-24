import { Injectable } from '@angular/core';
import { BehaviorSubject, combineLatest, map } from 'rxjs';
import { ProjectItem, SequenceDocument, SequenceFeature } from '../models/sequence.model';
import { parseFasta, parseGenBank, parseFastqFile } from '../utils/parsers.utils';
import { shiftFeatures } from '../utils/biology.utils';
import { exportToFasta, exportToGenBank } from '../utils/export.utils';
import { AuthService } from './auth.service';
import { SequenceStorageService, SequenceStorageUsage, StoredSequenceFile } from './sequence-storage.service';

const DB_NAME = 'SequenceWorkspaceDB';
const STORE_NAME = 'ProjectItems';
const DB_VERSION = 1;

export interface AutoAlignPayload {
  windowSeq: string;
  refSeq?: string;
  grnaSeq?: string;
  winSize?: number;
}

@Injectable({
  providedIn: 'root'
})
export class SequenceWorkspaceService {
  private db: IDBDatabase | null = null;
  private itemsSubject = new BehaviorSubject<ProjectItem[]>([]);
  public items$ = this.itemsSubject.asObservable();
  private usageSubject = new BehaviorSubject<SequenceStorageUsage>({ used_bytes: 0, quota_bytes: 5 * 1024 * 1024 * 1024 });
  public usage$ = this.usageSubject.asObservable();
  private suppressRemoteSync = false;
  
  private selectedItemIdSubject = new BehaviorSubject<string | null>(null);
  public selectedItemId$ = this.selectedItemIdSubject.asObservable();

  public selectedItem$ = combineLatest([this.items$, this.selectedItemId$]).pipe(
    map(([items, id]) => id ? items.find(i => i.id === id) || null : null)
  );

  private selectedRegionSubject = new BehaviorSubject<{start: number, end: number, length: number} | null>(null);
  public selectedRegion$ = this.selectedRegionSubject.asObservable();

  private pendingAutoAlignSubject = new BehaviorSubject<AutoAlignPayload | null>(null);
  public pendingAutoAlign$ = this.pendingAutoAlignSubject.asObservable();

  setPendingAutoAlign(payload: AutoAlignPayload) {
    this.pendingAutoAlignSubject.next(payload);
  }

  getPendingAutoAlign(): AutoAlignPayload | null {
    return this.pendingAutoAlignSubject.value;
  }

  clearPendingAutoAlign() {
    this.pendingAutoAlignSubject.next(null);
  }

  private history: Record<string, { past: SequenceDocument[], future: SequenceDocument[] }> = {};
  private readonly MAX_HISTORY = 20;
  private storageUserId: string | null | undefined;

  constructor(private auth: AuthService, private cloudStorage: SequenceStorageService) {
    this.initDB().then(() => {
      // Wait until Supabase has restored the session. Loading IndexedDB first made the
      // temporary example appear briefly before the signed-in cloud workspace replaced it.
      combineLatest([this.auth.session$, this.auth.loading$]).subscribe(([session, loading]) => {
        if (loading) return;

        // TOKEN_REFRESHED can emit a new session while the same user is working. The
        // workspace must not be reset or reselected for that routine auth event.
        const userId = session && !this.auth.isDemo ? session.user.id : null;
        if (this.storageUserId === userId) return;
        this.storageUserId = userId;

        if (userId) {
          void this.loadCloudItems();
        } else {
          void this.loadAllItems();
        }
      });
    });
  }

  private get usesCloudStorage(): boolean {
    return this.auth.isLoggedIn && !this.auth.isDemo;
  }

  private initDB(): Promise<void> {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onerror = () => {
        console.error('IndexedDB error:', request.error);
        reject(request.error);
      };

      request.onsuccess = () => {
        this.db = request.result;
        resolve();
      };

      request.onupgradeneeded = (event: IDBVersionChangeEvent) => {
        const db = (event.target as IDBOpenDBRequest).result;
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          db.createObjectStore(STORE_NAME, { keyPath: 'id' });
        }
      };
    });
  }

  private async loadAllItems() {
    if (!this.db) return;
    const items = await this.readLocalItems();
    this.itemsSubject.next(items);
    if (items.length > 0 && !this.selectedItemIdSubject.value) {
      await this.selectItem(items[0].id);
    } else if (items.length === 0 && !this.usesCloudStorage) {
      this.loadExample();
    }
  }

  private readLocalItems(): Promise<ProjectItem[]> {
    if (!this.db) return Promise.resolve([]);
    return new Promise<ProjectItem[]>((resolve, reject) => {
      const transaction = this.db!.transaction(STORE_NAME, 'readonly');
      const store = transaction.objectStore(STORE_NAME);
      const request = store.getAll();

      request.onsuccess = () => {
        resolve(request.result as ProjectItem[]);
      };

      request.onerror = () => reject(request.error);
    });
  }

  private loadExample() {
    const example: SequenceDocument = {
      type: 'sequence',
      id: 'example-1',
      name: 'pUC19 Example',
      description: 'Standard cloning vector',
      sequence: 'TCGCGCGTTTCGGTGATGACGGTGAAAACCTCTGACACATGCAGCTCCCGGAGACGGTCACAGCTTGTCTGTAAGCGGATGCCGGGAGCAGACAAGCCCGTCAGGGCGCGTCAGCGGGTGTTGGCGGGTGTCGGGGCTGGCTTAACTATGCGGCATCAGAGCAGATTGTACTGAGAGTGCACCATATGCGGTGTGAAATACCGCACAGATGCGTAAGGAGAAAATACCGCATCAGGCGCCATTCGCCATTCAGGCTGCGCAACTGTTGGGAAGGGCGATCGGTGCGGGCCTCTTCGCTATTACGCCAGCTGGCGAAAGGGGGATGTGCTGCAAGGCGATTAAGTTGGGTAACGCCAGGGTTTTCCCAGTCACGACGTTGTAAAACGACGGCCAGTGAATTCGAGCTCGGTACCCGGGGATCCTCTAGAGTCGACCTGCAGGCATGCAAGCTTGGCGTAATCATGGTCATAGCTGTTTCCTGTGTGAAATTGTTATCCGCTCACAATTCCACACAACATACGAGCCGGAAGCATAAAGTGTAAAGCCTGGGGTGCCTAATGAGTGAGCTAACTCACATTAATTGCGTTGCGCTCACTGCCCGCTTTCCAGTCGGGAAACCTGTCGTGCCAGCTGCATTAATGAATCGGCCAACGCGCGGGGAGAGGCGGTTTGCGTATTGGGCGCTCTTCCGCTTCCTCGCTCACTGACTCGCTGCGCTCGGTCGTTCGGCTGCGGCGAGCGGTATCAGCTCACTCAAAGGCGGTAATACGGTTATCCACAGAATCAGGGGATAACGCAGGAAAGAACATGTGAGCAAAAGGCCAGCAAAAGGCCAGGAACCGTAAAAAGGCCGCGTTGCTGGCGTTTTTCCATAGGCTCCGCCCCCCTGACGAGCATCACAAAAATCGACGCTCAAGTCAGAGGTGGCGAAACCCGACAGGACTATAAAGATACCAGGCGTTTCCCCCTGGAAGCTCCCTCGTGCGCTCTCCTGTTCCGACCCTGCCGCTTACCGGATACCTGTCCGCCTTTCTCCCTTCGGGAAGCGTGGCGCTTTCTCATAGCTCACGCTGTAGGTATCTCAGTTCGGTGTAGGTCGTTCGCTCCAAGCTGGGCTGTGTGCACGAACCCCCCGTTCAGCCCGACCGCTGCGCCTTATCCGGTAACTATCGTCTTGAGTCCAACCCGGTAAGACACGACTTATCGCCACTGGCAGCAGCCACTGGTAACAGGATTAGCAGAGCGAGGTATGTAGGCGGTGCTACAGAGTTCTTGAAGTGGTGGCCTAACTACGGCTACACTAGAAGAACAGTATTTGGTATCTGCGCTCTGCTGAAGCCAGTTACCTTCGGAAAAAGAGTTGGTAGCTCTTGATCCGGCAAACAAACCACCGCTGGTAGCGGTGGTTTTTTTGTTTGCAAGCAGCAGATTACGCGCAGAAAAAAAGGATCTCAAGAAGATCCTTTGATCTTTTCTACGGGGTCTGACGCTCAGTGGAACGAAAACTCACGTTAAGGGATTTTGGTCATGAGATTATCAAAAAGGATCTTCACCTAGATCCTTTTAAATTAAAAATGAAGTTTTAAATCAATCTAAAGTATATATGAGTAAACTTGGTCTGACAGTTACCAATGCTTAATCAGTGAGGCACCTATCTCAGCGATCTGTCTATTTCGTTCATCCATAGTTGCCTGACTCCCCGTCGTGTAGATAACTACGATACGGGAGGGCTTACCATCTGGCCCCAGTGCTGCAATGATACCGCGAGACCCACGCTCACCGGCTCCAGATTTATCAGCAATAAACCAGCCAGCCGGAAGGGCCGAGCGCAGAAGTGGTCCTGCAACTTTATCCGCCTCCATCCAGTCTATTAATTGTTGCCGGGAAGCTAGAGTAAGTAGTTCGCCAGTTAATAGTTTGCGCAACGTTGTTGCCATTGCTACAGGCATCGTGGTGTCACGCTCGTCGTTTGGTATGGCTTCATTCAGCTCCGGTTCCCAACGATCAAGGCGAGTTACATGATCCCCCATGTTGTGCAAAAAAGCGGTTAGCTCCTTCGGTCCTCCGATCGTTGTCAGAAGTAAGTTGGCCGCAGTGTTATCACTCATGGTTATGGCAGCACTGCATAATTCTCTTACTGTCATGCCATCCGTAAGATGCTTTTCTGTGACTGGTGAGTACTCAACCAAGTCATTCTGAGAATAGTGTATGCGGCGACCGAGTTGCTCTTGCCCGGCGTCAATACGGGATAATACCGCGCCACATAGCAGAACTTTAAAAGTGCTCATCATTGGAAAACGTTCTTCGGGGCGAAAACTCTCAAGGATCTTACCGCTGTTGAGATCCAGTTCGATGTAACCCACTCGTGCACCCAACTGATCTTCAGCATCTTTTACTTTCACCAGCGTTTCTGGGTGAGCAAAAACAGGAAGGCAAAATGCCGCAAAAAAGGGAATAAGGGCGACACGGAAATGTTGAATACTCATACTCTTCCTTTTTCAATATTATTGAAGCATTTATCAGGGTTATTGTCTCATGAGCGGATACATATTTGAATGTATTTAGAAAAATAAACAAATAGGGGTTCCGCGCACATTTCCCCGAAAAGTGCCACCTGACGTCTAAGAAACCATTATTATCATGACATTAACCTATAAAAATAGGCGTATCACGAGGCCCTTTCGTC',
      topology: 'circular',
      features: [
        { id: 'f1', name: 'lacZa', type: 'CDS', start: 145, end: 469, strand: 1, color: '#3498db' },
        { id: 'f2', name: 'AmpR', type: 'CDS', start: 1625, end: 2486, strand: -1, color: '#e74c3c' },
        { id: 'f3', name: 'ori', type: 'rep_origin', start: 805, end: 1494, strand: 1, color: '#2ecc71' }
      ],
      primers: [],
      sourceFormat: 'manual',
      createdTimestamp: Date.now(),
      updatedTimestamp: Date.now()
    };
    this.saveItem(example);
  }

  private itemMetadata(item: ProjectItem): ProjectItem {
    const clone = JSON.parse(JSON.stringify(item)) as ProjectItem;
    delete (clone as any).fileHandle;
    delete (clone as any).remoteFileId;
    delete (clone as any).remoteItemIndex;
    delete (clone as any).originalFileName;
    delete (clone as any).contentLoaded;
    if (clone.type === 'fastq') {
      clone.reads = [];
    }
    return clone;
  }

  private metadataForItems(items: ProjectItem[]): Record<string, unknown> {
    return { items: items.map(item => this.itemMetadata(item)) };
  }

  private async refreshUsage() {
    if (!this.usesCloudStorage) {
      this.usageSubject.next({ used_bytes: 0, quota_bytes: 5 * 1024 * 1024 * 1024 });
      return;
    }
    try {
      this.usageSubject.next(await this.cloudStorage.getUsage());
    } catch (error) {
      console.error('Failed to load Sequence Viewer storage usage', error);
    }
  }

  private async loadCloudItems() {
    try {
      const previouslySelectedId = this.selectedItemIdSubject.value;
      // IndexedDB is guest-only. Migrate any pre-existing guest documents once,
      // then keep signed-in work exclusively in account storage + memory.
      const cachedItems = await this.readLocalItems();
      const localItems = cachedItems.filter(item => !item.remoteFileId && item.id !== 'example-1');
      if (localItems.length) {
        await this.migrateLocalItems(localItems);
      }
      if (cachedItems.length) await this.clearLocalCache();
      const files = await this.cloudStorage.list();
      const items = files.flatMap(file => this.itemsFromCloudFile(file));
      this.itemsSubject.next(items);
      await this.refreshUsage();
      const selectedId = previouslySelectedId && items.some(item => item.id === previouslySelectedId)
        ? previouslySelectedId
        : items[0]?.id ?? null;
      await this.selectItem(selectedId);
    } catch (error) {
      console.error('Failed to load saved Sequence Viewer files', error);
    }
  }

  private fileFromCachedItem(item: ProjectItem): File | null {
    if (item.type === 'fastq') {
      const content = item.reads.map(read => `@${read.id}\n${read.seq}\n+\n${read.qualString}`).join('\n') + '\n';
      return new File([content], item.name || 'saved-reads.fastq', { type: 'text/plain' });
    }
    if (item.type === 'sequence') {
      const isGenBank = item.sourceFormat === 'genbank';
      const content = isGenBank ? exportToGenBank(item) : exportToFasta(item);
      const name = item.name || 'saved-sequence';
      const extension = isGenBank ? '.gb' : '.fasta';
      return new File([content], /\.(gb|gbk|fa|fasta)$/i.test(name) ? name : `${name}${extension}`, { type: 'text/plain' });
    }
    return null;
  }

  private async migrateLocalItems(items: ProjectItem[]) {
    for (const item of items) {
      const file = this.fileFromCachedItem(item);
      if (!file) continue;
      await this.cloudStorage.upload(file, this.metadataForItems([item]));
    }
  }

  private async clearLocalCache() {
    if (!this.db) return;
    await new Promise<void>((resolve, reject) => {
      const transaction = this.db!.transaction(STORE_NAME, 'readwrite');
      const request = transaction.objectStore(STORE_NAME).clear();
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  private itemsFromCloudFile(file: StoredSequenceFile): ProjectItem[] {
    const storedItems = Array.isArray((file.metadata_json as any)?.items) ? (file.metadata_json as any).items : [];
    return storedItems.map((stored: ProjectItem, index: number) => {
      const item = JSON.parse(JSON.stringify(stored)) as ProjectItem;
      item.id = `${file.id}:${index}`;
      item.remoteFileId = file.id;
      item.remoteItemIndex = index;
      item.originalFileName = file.original_name;
      item.contentLoaded = item.type !== 'fastq';
      if (item.type === 'fastq') item.reads = [];
      return item;
    });
  }

  private async syncRemoteItem(item: ProjectItem) {
    if (!this.usesCloudStorage || this.suppressRemoteSync || !item.remoteFileId) return;
    try {
      const related = this.itemsSubject.value.filter(existing =>
        existing.remoteFileId === item.remoteFileId && existing.id !== item.id
      );
      await this.cloudStorage.updateMetadata(item.remoteFileId, this.metadataForItems([...related, item]));
    } catch (error) {
      console.error('Failed to update saved Sequence Viewer file', error);
    }
  }

  async saveItem(item: ProjectItem) {
    const clonedItem = JSON.parse(JSON.stringify(item));
    clonedItem.updatedTimestamp = Date.now();

    if (this.usesCloudStorage) {
      const currentItems = this.itemsSubject.value.filter(i => i.id !== clonedItem.id);
      this.itemsSubject.next([...currentItems, clonedItem]);
      await this.syncRemoteItem(clonedItem);
      return;
    }

    if (!this.db) await this.initDB();
    return new Promise<void>((resolve, reject) => {
      const transaction = this.db!.transaction(STORE_NAME, 'readwrite');
      const store = transaction.objectStore(STORE_NAME);
      const request = store.put(clonedItem);

      request.onsuccess = () => {
        const currentItems = this.itemsSubject.value.filter(i => i.id !== clonedItem.id);
        this.itemsSubject.next([...currentItems, clonedItem]);
        this.syncRemoteItem(clonedItem).then(() => resolve()).catch(reject);
      };
      request.onerror = () => reject(request.error);
    });
  }

  async deleteItem(id: string) {
    if (!this.db) return;
    const target = this.itemsSubject.value.find(item => item.id === id);
    if (target?.remoteFileId && this.usesCloudStorage) {
      try {
        await this.cloudStorage.delete(target.remoteFileId);
        const relatedIds = this.itemsSubject.value
          .filter(item => item.remoteFileId === target.remoteFileId)
          .map(item => item.id);
        await Promise.all(relatedIds.map(itemId => this.deleteLocalItem(itemId)));
        await this.refreshUsage();
        return;
      } catch (error) {
        console.error('Failed to delete saved Sequence Viewer file', error);
        throw error;
      }
    }
    return this.deleteLocalItem(id);
  }

  private async deleteLocalItem(id: string) {
    if (!this.db) return;
    return new Promise<void>((resolve, reject) => {
      const transaction = this.db!.transaction(STORE_NAME, 'readwrite');
      const store = transaction.objectStore(STORE_NAME);
      const request = store.delete(id);

      request.onsuccess = () => {
        this.itemsSubject.next(this.itemsSubject.value.filter(i => i.id !== id));
        if (this.selectedItemIdSubject.value === id) {
          this.selectedItemIdSubject.next(null);
        }
        resolve();
      };
      request.onerror = () => reject(request.error);
    });
  }

  async selectItem(id: string | null) {
    // Set selection synchronously so the viewer never flashes "No Item Selected"
    // while a saved FASTQ file is downloading and parsing.
    this.selectedItemIdSubject.next(id);
    if (id) {
      const item = this.itemsSubject.value.find(candidate => candidate.id === id);
      if (item?.type === 'fastq' && item.remoteFileId && !item.contentLoaded) {
        await this.loadRemoteFastq(item);
      }
    }
  }

  getSelectedItem(): ProjectItem | null {
    const id = this.selectedItemIdSubject.value;
    if (!id) return null;
    return this.itemsSubject.value.find(i => i.id === id) || null;
  }

  selectRegion(start: number, end: number) {
    let length = end - start;
    if (length < 0) {
      // Circular cross origin? Ignore for now and handle linear
      const doc = this.getSelectedItem();
      if (doc && doc.type === 'sequence') {
        length = (end + doc.sequence.length) - start;
      } else {
        length = 0;
      }
    }
    this.selectedRegionSubject.next({ start, end, length });
  }

  clearRegion() {
    this.selectedRegionSubject.next(null);
  }

  private pushHistoryState(doc: SequenceDocument) {
    if (!this.history[doc.id]) {
      this.history[doc.id] = { past: [], future: [] };
    }
    const h = this.history[doc.id];
    // Deep copy document to save state
    h.past.push(JSON.parse(JSON.stringify(doc)));
    if (h.past.length > this.MAX_HISTORY) h.past.shift();
    h.future = [];
  }

  async undo(id: string) {
    const h = this.history[id];
    if (!h || h.past.length === 0) return;
    
    const currentDoc = this.itemsSubject.value.find(i => i.id === id) as SequenceDocument;
    if (!currentDoc) return;

    h.future.push(JSON.parse(JSON.stringify(currentDoc)));
    const prevDoc = h.past.pop()!;
    await this.saveItem(prevDoc);
  }

  async redo(id: string) {
    const h = this.history[id];
    if (!h || h.future.length === 0) return;
    
    const currentDoc = this.itemsSubject.value.find(i => i.id === id) as SequenceDocument;
    if (!currentDoc) return;

    h.past.push(JSON.parse(JSON.stringify(currentDoc)));
    const nextDoc = h.future.pop()!;
    await this.saveItem(nextDoc);
  }

  canUndo(id: string): boolean {
    return !!this.history[id] && this.history[id].past.length > 0;
  }

  canRedo(id: string): boolean {
    return !!this.history[id] && this.history[id].future.length > 0;
  }

  async insertBases(id: string, startPos: number, insertedSeq: string) {
    const doc = this.itemsSubject.value.find(i => i.id === id) as SequenceDocument;
    if (!doc) return;

    this.pushHistoryState(doc);

    const cleanInsert = insertedSeq.replace(/[^A-Za-z]/g, '').toUpperCase();
    if (!cleanInsert) return;

    doc.sequence = doc.sequence.substring(0, startPos) + cleanInsert + doc.sequence.substring(startPos);
    doc.features = shiftFeatures(doc.features, startPos, 0, cleanInsert.length, doc.sequence.length, doc.topology);
    
    await this.saveItem(doc);
  }

  async deleteBases(id: string, startPos: number, length: number) {
    const doc = this.itemsSubject.value.find(i => i.id === id) as SequenceDocument;
    if (!doc) return;

    this.pushHistoryState(doc);

    doc.sequence = doc.sequence.substring(0, startPos) + doc.sequence.substring(startPos + length);
    doc.features = shiftFeatures(doc.features, startPos, length, 0, doc.sequence.length, doc.topology);

    await this.saveItem(doc);
  }

  async updateFeature(id: string, newFeature: SequenceFeature) {
    const doc = this.itemsSubject.value.find(i => i.id === id) as SequenceDocument;
    if (!doc) return;

    this.pushHistoryState(doc);

    const idx = doc.features.findIndex(f => f.id === newFeature.id);
    if (idx !== -1) {
      doc.features[idx] = newFeature;
    } else {
      doc.features.push(newFeature);
    }
    
    await this.saveItem(doc);
  }

  async deleteFeature(id: string, featureId: string) {
    const doc = this.itemsSubject.value.find(i => i.id === id) as SequenceDocument;
    if (!doc) return;

    this.pushHistoryState(doc);
    doc.features = doc.features.filter(f => f.id !== featureId);
    await this.saveItem(doc);
  }

  private async loadRemoteFastq(item: import('../models/sequence.model').FastqDocument) {
    try {
      const blob = await this.cloudStorage.download(item.remoteFileId!);
      const sourceFile = new File([blob], item.originalFileName || item.name);
      const parsed = await parseFastqFile(sourceFile);
      parsed.id = item.id;
      parsed.remoteFileId = item.remoteFileId;
      parsed.remoteItemIndex = item.remoteItemIndex;
      parsed.originalFileName = item.originalFileName;
      parsed.contentLoaded = true;
      this.suppressRemoteSync = true;
      await this.saveItem(parsed);
      this.suppressRemoteSync = false;
    } catch (error) {
      this.suppressRemoteSync = false;
      console.error('Failed to load saved FASTQ file', error);
      alert('The saved FASTQ file could not be opened. Please try downloading it again.');
    }
  }

  private async persistImportedFile(file: File, items: ProjectItem[]) {
    if (!items.length) return;
    if (!this.usesCloudStorage) {
      for (const item of items) await this.saveItem(item);
      this.selectItem(items[0].id);
      return;
    }

    try {
      const stored = await this.cloudStorage.upload(file, this.metadataForItems(items));
      this.suppressRemoteSync = true;
      for (const [index, item] of items.entries()) {
        item.id = `${stored.id}:${index}`;
        item.remoteFileId = stored.id;
        item.remoteItemIndex = index;
        item.originalFileName = stored.original_name;
        item.contentLoaded = item.type !== 'fastq' || item.reads.length > 0;
        await this.saveItem(item);
      }
      this.suppressRemoteSync = false;
      await this.cloudStorage.updateMetadata(stored.id, this.metadataForItems(items));
      await this.refreshUsage();
      await this.selectItem(items[0].id);
    } catch (error: any) {
      this.suppressRemoteSync = false;
      console.error('Failed to save Sequence Viewer file', error);
      alert(error?.error?.detail || 'Could not save this file to your Sequence Viewer storage.');
    }
  }

  async importFile(file: File) {
    const isFastq = file.name.endsWith('.fastq') || file.name.endsWith('.fq') || file.name.endsWith('.fastq.gz') || file.name.endsWith('.fq.gz');
    
    if (isFastq) {
      try {
        const doc = await parseFastqFile(file);
        await this.persistImportedFile(file, [doc]);
      } catch (e) {
        console.error('Failed to parse FASTQ', e);
      }
      return;
    }

    const text = await file.text();
    const isFasta = file.name.endsWith('.fasta') || file.name.endsWith('.fa') || text.startsWith('>');
    const isGenBank = file.name.endsWith('.gb') || file.name.endsWith('.gbk') || text.startsWith('LOCUS');

    const importedItems: ProjectItem[] = [];
    if (isGenBank) {
      const doc = parseGenBank(text);
      if (doc) {
        doc.id = Math.random().toString(36).substring(2, 9);
        doc.type = 'sequence';
        doc.sourceFormat = 'genbank';
        doc.createdTimestamp = Date.now();
        doc.primers = doc.primers || [];
        importedItems.push(doc as SequenceDocument);
      }
    } else if (isFasta) {
      const docs = parseFasta(text);
      for (const d of docs) {
        d.id = Math.random().toString(36).substring(2, 9);
        d.type = 'sequence';
        d.sourceFormat = 'fasta';
        d.topology = 'linear';
        d.features = [];
        d.primers = [];
        d.createdTimestamp = Date.now();
        importedItems.push(d as SequenceDocument);
      }
    } else {
      // Treat as plain sequence
      const cleanSeq = text.replace(/[^A-Za-z]/g, '').toUpperCase();
      if (cleanSeq.length > 0) {
        const doc: SequenceDocument = {
          id: Math.random().toString(36).substring(2, 9),
          type: 'sequence',
          name: file.name,
          description: 'Imported from text',
          sequence: cleanSeq,
          topology: 'linear',
          features: [],
          primers: [],
          sourceFormat: 'text',
          createdTimestamp: Date.now(),
          updatedTimestamp: Date.now()
        };
        importedItems.push(doc);
      }
    }
    await this.persistImportedFile(file, importedItems);
  }

  async importGeneratedFastq(file: File, autoAlign?: AutoAlignPayload) {
    const doc = await parseFastqFile(file);
    if (autoAlign) doc.autoAlign = autoAlign;
    await this.persistImportedFile(file, [doc]);
    if (autoAlign) this.setPendingAutoAlign(autoAlign);
  }

  async downloadOriginal(item: ProjectItem) {
    if (!item.remoteFileId || !this.usesCloudStorage) {
      alert('The original file is only available after signing in and saving it to Sequence Viewer storage.');
      return;
    }
    try {
      const blob = await this.cloudStorage.download(item.remoteFileId);
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = item.originalFileName || item.name;
      link.click();
      URL.revokeObjectURL(url);
    } catch (error) {
      console.error('Failed to download saved Sequence Viewer file', error);
      alert('Could not download the original file.');
    }
  }

  async renameItem(item: ProjectItem, requestedName: string) {
    const name = requestedName.trim();
    if (!name || name === item.name) return;
    try {
      if (item.remoteFileId && this.usesCloudStorage) {
        const stored = await this.cloudStorage.rename(item.remoteFileId, name, item.remoteItemIndex ?? 0);
        item.originalFileName = stored.original_name;
      }
      item.name = name;
      item.updatedTimestamp = Date.now();
      const currentItems = this.itemsSubject.value.map(existing => existing.id === item.id ? { ...item } : existing);
      this.itemsSubject.next(currentItems);
      if (!item.remoteFileId || !this.usesCloudStorage) await this.saveItem(item);
    } catch (error: any) {
      console.error('Failed to rename Sequence Viewer file', error);
      alert(error?.error?.detail || 'Could not rename this file.');
    }
  }

  async clearWorkspace() {
    if (!this.db) return;
    return new Promise<void>((resolve, reject) => {
      const transaction = this.db!.transaction(STORE_NAME, 'readwrite');
      const store = transaction.objectStore(STORE_NAME);
      const request = store.clear();

      request.onsuccess = () => {
        this.itemsSubject.next([]);
        this.selectedItemIdSubject.next(null);
        resolve();
      };
      request.onerror = () => reject(request.error);
    });
  }

  // --- File System Access API Methods ---

  public async openLocalDirectory() {
    if (!('showDirectoryPicker' in window)) {
      alert('Your browser does not support the File System Access API. Please use a Chromium-based browser like Chrome or Edge.');
      return;
    }

    try {
      const dirHandle = await (window as any).showDirectoryPicker();
      // Clear the current workspace items? 
      // For now, let's clear the workspace to act as a "project folder" load
      const items: ProjectItem[] = [];
      
      for await (const entry of dirHandle.values()) {
        if (entry.kind === 'file') {
          const fileHandle = entry;
          const name = fileHandle.name.toLowerCase();
          
          if (name.endsWith('.fasta') || name.endsWith('.fa') || name.endsWith('.gb') || name.endsWith('.gbk') || name.endsWith('.fastq') || name.endsWith('.fq') || name.endsWith('.fastq.gz') || name.endsWith('.fq.gz')) {
            const file = await fileHandle.getFile();
            
            try {
              if (name.endsWith('.fastq') || name.endsWith('.fq') || name.endsWith('.fastq.gz') || name.endsWith('.fq.gz')) {
                const doc = await parseFastqFile(file);
                doc.fileHandle = fileHandle;
                items.push(doc);
              } else {
                const text = await file.text();
                if (name.endsWith('.fasta') || name.endsWith('.fa')) {
                  const docs = parseFasta(text);
                  for (const d of docs) {
                    d.id = Math.random().toString(36).substring(2, 9);
                    d.type = 'sequence';
                    d.sourceFormat = 'fasta';
                    d.topology = 'linear';
                    d.features = [];
                    d.primers = [];
                    d.createdTimestamp = Date.now();
                    d.updatedTimestamp = Date.now();
                    d.fileHandle = fileHandle;
                    if (!d.name || d.name === 'Untitled Sequence') d.name = fileHandle.name;
                    items.push(d as SequenceDocument);
                  }
                } else if (name.endsWith('.gb') || name.endsWith('.gbk')) {
                  const doc = parseGenBank(text);
                  if (doc) {
                    doc.id = Math.random().toString(36).substring(2, 9);
                    doc.type = 'sequence';
                    doc.sourceFormat = 'genbank';
                    doc.createdTimestamp = Date.now();
                    doc.updatedTimestamp = Date.now();
                    doc.primers = doc.primers || [];
                    doc.fileHandle = fileHandle;
                    if (!doc.name || doc.name === 'Untitled') doc.name = fileHandle.name;
                    items.push(doc as SequenceDocument);
                  }
                }
              }
            } catch (err) {
              console.error(`Failed to parse file: ${fileHandle.name}`, err);
            }
          }
        }
      }

      // Overwrite DB and memory
      if (this.db) {
        // Clear IndexedDB completely
        await new Promise<void>((resolve, reject) => {
          const tx = this.db!.transaction(STORE_NAME, 'readwrite');
          tx.objectStore(STORE_NAME).clear();
          tx.oncomplete = () => resolve();
          tx.onerror = () => reject(tx.error);
        });
        
        this.itemsSubject.next([]);
        if (this.usesCloudStorage) {
          const grouped = new Map<any, ProjectItem[]>();
          for (const item of items) {
            const handle = (item as any).fileHandle;
            grouped.set(handle, [...(grouped.get(handle) || []), item]);
          }
          for (const [handle, groupedItems] of grouped) {
            await this.persistImportedFile(await handle.getFile(), groupedItems);
          }
        } else {
          for (const item of items) await this.saveItem(item);
        }
      }

      const savedItems = this.itemsSubject.value;
      if (savedItems.length > 0) await this.selectItem(savedItems[0].id);
      
    } catch (err: any) {
      if (err.name !== 'AbortError') {
        console.error('Error opening directory:', err);
        alert('Failed to open directory.');
      }
    }
  }

  public async saveToDisk(item: ProjectItem) {
    if (item.type !== 'sequence') {
      alert('Only sequences can be exported to disk right now.');
      return;
    }

    try {
      let handle = item.fileHandle;
      if (!handle) {
        // Fallback to Save As
        handle = await (window as any).showSaveFilePicker({
          suggestedName: item.name,
          types: [{
            description: 'Sequence Files',
            accept: {
              'text/plain': ['.gb', '.gbk', '.fasta', '.fa']
            }
          }]
        });
      }

      // Check permission
      const options = { mode: 'readwrite' };
      if ((await handle.queryPermission(options)) !== 'granted') {
        if ((await handle.requestPermission(options)) !== 'granted') {
          throw new Error('Permission not granted');
        }
      }

      const writable = await handle.createWritable();
      
      let content = '';
      if (handle.name.toLowerCase().endsWith('.fasta') || handle.name.toLowerCase().endsWith('.fa')) {
        content = exportToFasta(item as SequenceDocument);
      } else {
        content = exportToGenBank(item as SequenceDocument);
      }
      
      await writable.write(content);
      await writable.close();
      
      // Update item with handle in case it was a new Save As
      item.fileHandle = handle;
      await this.saveItem(item);
      
      alert('Saved to disk successfully!');
      
    } catch (err: any) {
      if (err.name !== 'AbortError') {
        console.error('Failed to save file:', err);
        alert('Failed to save to disk.');
      }
    }
  }
}
