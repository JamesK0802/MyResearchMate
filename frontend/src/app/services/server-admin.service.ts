import { Injectable } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { AuthService } from './auth.service';

export interface ServerDataEntry {
  name: string;
  path: string;
  kind: 'directory' | 'file';
  size: number | null;
  item_count: number | null;
  managed: boolean;
  modified_at: string;
}

export interface DatabaseTableSummary {
  name: string;
  row_count: number;
  managed: boolean;
  columns: { name: string; type: string; nullable: boolean; primary_key: boolean; managed: boolean }[];
}

export interface ServerOperationStatus {
  active: boolean;
  kind?: 'backup' | 'restore' | 'cleanup' | 'delete';
  label?: string;
  stage?: string;
  started_at?: string;
}

@Injectable({ providedIn: 'root' })
export class ServerAdminService {
  private readonly apiUrl = '/api/server-admin';

  constructor(private http: HttpClient, private auth: AuthService) {}

  private async headers(): Promise<HttpHeaders> {
    const session = await this.auth.getSession();
    return new HttpHeaders({ Authorization: `Bearer ${session?.access_token || ''}` });
  }

  async listData(path = ''): Promise<{ path: string; parent: string; entries: ServerDataEntry[] }> {
    return firstValueFrom(this.http.get<any>(`${this.apiUrl}/data?path=${encodeURIComponent(path)}`, { headers: await this.headers() }));
  }

  async listTables(): Promise<DatabaseTableSummary[]> {
    return firstValueFrom(this.http.get<DatabaseTableSummary[]>(`${this.apiUrl}/database/tables`, { headers: await this.headers() }));
  }

  async previewTable(name: string, offset = 0): Promise<any> {
    return firstValueFrom(this.http.get<any>(`${this.apiUrl}/database/tables/${encodeURIComponent(name)}?limit=50&offset=${offset}`, { headers: await this.headers() }));
  }

  async listBackups(): Promise<ServerDataEntry[]> {
    return firstValueFrom(this.http.get<ServerDataEntry[]>(`${this.apiUrl}/backups`, { headers: await this.headers() }));
  }

  async operationStatus(): Promise<ServerOperationStatus> {
    return firstValueFrom(this.http.get<ServerOperationStatus>(`${this.apiUrl}/operation-status`, { headers: await this.headers() }));
  }

  async createBackup(): Promise<ServerDataEntry> {
    return firstValueFrom(this.http.post<ServerDataEntry>(`${this.apiUrl}/backups`, {}, { headers: await this.headers() }));
  }

  async restore(file: File): Promise<any> {
    const form = new FormData();
    form.append('archive', file);
    form.append('confirmation', 'RESTORE');
    return firstValueFrom(this.http.post<any>(`${this.apiUrl}/restore`, form, { headers: await this.headers() }));
  }

  async cleanup(payload: { data_roots: string[]; tables: string[]; columns: { table: string; column: string }[] }): Promise<any> {
    return firstValueFrom(this.http.post<any>(`${this.apiUrl}/cleanup`, { ...payload, confirmation: 'CLEANUP' }, { headers: await this.headers() }));
  }

  async downloadData(entry: ServerDataEntry): Promise<void> {
    await this.download(`${this.apiUrl}/data/download?path=${encodeURIComponent(entry.path)}`, entry.name);
  }

  async downloadBackup(entry: ServerDataEntry): Promise<void> {
    await this.download(`${this.apiUrl}/backups/${encodeURIComponent(entry.name)}`, entry.name);
  }

  async deleteBackup(entry: ServerDataEntry): Promise<void> {
    await firstValueFrom(this.http.delete<void>(`${this.apiUrl}/backups/${encodeURIComponent(entry.name)}`, { headers: await this.headers() }));
  }

  private async download(url: string, filename: string): Promise<void> {
    const blob = await firstValueFrom(this.http.get(url, { headers: await this.headers(), responseType: 'blob' }));
    const objectUrl = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = objectUrl;
    anchor.download = filename;
    anchor.click();
    setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
  }
}
