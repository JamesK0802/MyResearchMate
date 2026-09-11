import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';

export interface OperationProgress {
  id: string;
  label: string;
  detail: string;
  percent: number | null;
  transferred?: number;
  total?: number;
  startedAt: number;
  status: 'running' | 'complete' | 'error';
}

@Injectable({ providedIn: 'root' })
export class OperationProgressService {
  private readonly operationsSubject = new BehaviorSubject<OperationProgress[]>([]);
  readonly operations$ = this.operationsSubject.asObservable();
  private sequence = 0;

  begin(label: string, detail = 'Starting…', percent: number | null = null): string {
    const id = `operation-${Date.now()}-${++this.sequence}`;
    this.operationsSubject.next([
      ...this.operationsSubject.value,
      { id, label, detail, percent, startedAt: Date.now(), status: 'running' },
    ]);
    return id;
  }

  update(id: string, patch: Partial<Omit<OperationProgress, 'id' | 'startedAt'>>): void {
    this.operationsSubject.next(this.operationsSubject.value.map(operation =>
      operation.id === id ? { ...operation, ...patch } : operation
    ));
  }

  complete(id: string, detail = 'Complete'): void {
    this.update(id, { detail, percent: 100, status: 'complete' });
    window.setTimeout(() => this.remove(id), 900);
  }

  fail(id: string, detail = 'Operation failed'): void {
    this.update(id, { detail, percent: null, status: 'error' });
    window.setTimeout(() => this.remove(id), 5000);
  }

  remove(id: string): void {
    this.operationsSubject.next(this.operationsSubject.value.filter(operation => operation.id !== id));
  }
}
