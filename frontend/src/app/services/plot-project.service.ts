import { Injectable } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import ExcelJS from 'exceljs';
import { environment } from '../../environments/environment';
import { AuthService } from './auth.service';
import { PlotProjectDocument } from './r-plot-sync.service';
import { ShareAccessSettings } from '../models/share-access.model';

export interface PlotProjectRecord {
  id: string;
  owner_user_id: number;
  title: string;
  project_json: PlotProjectDocument;
  created_at: string;
  updated_at: string | null;
  is_shared?: boolean;
  shared_by_name?: string;
  shared_with_labs?: string[];
  shared_with_users?: string[];
  share_access?: 'owner' | 'read' | 'edit';
  can_edit?: boolean;
}

@Injectable({ providedIn: 'root' })
export class PlotProjectService {
  private readonly apiUrl = `${environment.apiBaseUrl}/plot-projects`;
  private pendingProject: PlotProjectRecord | null = null;

  constructor(private http: HttpClient, private auth: AuthService) {}

  private async headers() {
    const session = await this.auth.getSession();
    return new HttpHeaders({ Authorization: `Bearer ${session?.access_token}` });
  }

  async save(title: string, project: PlotProjectDocument): Promise<PlotProjectRecord> {
    return firstValueFrom(this.http.post<PlotProjectRecord>(this.apiUrl, { title, project_json: project }, { headers: await this.headers() }));
  }

  async update(id: string, title: string, project: PlotProjectDocument): Promise<PlotProjectRecord> {
    return firstValueFrom(this.http.put<PlotProjectRecord>(`${this.apiUrl}/${id}`, { title, project_json: project }, { headers: await this.headers() }));
  }

  async getProjects(scope: 'all' | 'my' | 'shared' = 'all'): Promise<PlotProjectRecord[]> {
    return firstValueFrom(this.http.get<PlotProjectRecord[]>(`${this.apiUrl}/${scope}`, { headers: await this.headers() }));
  }

  async getMyProjects(): Promise<PlotProjectRecord[]> {
    return this.getProjects('my');
  }

  async delete(id: string) {
    return firstValueFrom(this.http.delete(`${this.apiUrl}/${id}`, { headers: await this.headers() }));
  }

  async getShares(id: string): Promise<ShareAccessSettings> {
    return firstValueFrom(this.http.get<ShareAccessSettings>(`${this.apiUrl}/${id}/shares`, { headers: await this.headers() }));
  }

  async updateShares(id: string, settings: ShareAccessSettings) {
    return firstValueFrom(this.http.put(`${this.apiUrl}/${id}/shares`, settings, { headers: await this.headers() }));
  }

  queueOpen(project: PlotProjectRecord) { this.pendingProject = project; }
  consumeQueuedOpen(): PlotProjectRecord | null { const project = this.pendingProject; this.pendingProject = null; return project; }

  async downloadExcel(project: PlotProjectRecord) {
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('Data');
    sheet.columns = project.project_json.columns.map(name => ({ header: name, key: name }));
    project.project_json.data.forEach(row => sheet.addRow(row));
    sheet.getRow(1).font = { bold: true };
    sheet.columns.forEach(column => { column.width = Math.max(14, String(column.header || '').length + 4); });
    const content = await workbook.xlsx.writeBuffer();
    this.downloadBlob(new Blob([content], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), `${this.safeName(project.title)}.xlsx`);
  }

  downloadR(project: PlotProjectRecord) {
    this.downloadBlob(new Blob([project.project_json.rCode || ''], { type: 'text/x-rsrc;charset=utf-8' }), `${this.safeName(project.title)}.R`);
  }

  private downloadBlob(blob: Blob, filename: string) {
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = filename;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  private safeName(value: string) { return (value || 'plot-project').replace(/[\\/:*?"<>|]+/g, '-').trim(); }
}
