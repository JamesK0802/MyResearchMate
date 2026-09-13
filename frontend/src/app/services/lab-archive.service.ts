import { Injectable } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { AuthService } from './auth.service';
import { firstValueFrom } from 'rxjs';
import { ArchiveSettings, StorageLocationRule } from '../utils/storage-location-rules';

@Injectable({ providedIn: 'root' })
export class LabArchiveService {
  private apiUrl = '/api/lab-archive';
  private readonly demoRecords = [
    {
      id: 'demo-archive-record-1', title: 'Demo Archive Record 1', summary: 'This is a demo archive record.',
      description: 'Sample 1-1 and Sample 1-2 demonstrate saved records, external links, image attachments, and discussion entries.',
      links: ['https://jamesk0802.github.io/myLabMate_Local/', 'https://jamesk0802.github.io/namu/'],
      files: [{ filename: 'Demo landing page.png', path: '/demo-labmate-landing.png' }, { filename: 'Demo logo.png', path: '/demo-labmate-logo.png' }],
      comments: [{ id: 'demo-comment-1', user_name: 'Demo User 1', text: 'This is a demo archive comment.', created_at: '2026-08-07T09:00:00Z' }],
      created_by: 'Demo User 1', created_at: '2026-08-07T09:00:00Z'
    },
    {
      id: 'demo-archive-record-2', title: 'Demo Archive Record 2', summary: 'This is another demo archive record.',
      description: 'Sample 2-1 shows how multiple records can keep their links and image attachments together.',
      links: ['https://jamesk0802.github.io/namu/'],
      files: [{ filename: 'Demo logo.png', path: '/demo-labmate-logo.png' }],
      comments: [{ id: 'demo-comment-2', user_name: 'Demo User 2', text: 'This is a second demo archive comment.', created_at: '2026-08-05T13:30:00Z' }],
      created_by: 'Demo User 2', created_at: '2026-08-05T13:00:00Z'
    },
    {
      id: 'demo-archive-record-3', title: 'Demo Archive Record 3', summary: 'A completed demo workflow record.',
      description: 'Sample 3-1 is included only to demonstrate archive search, record links, and attached visuals.',
      links: ['https://jamesk0802.github.io/myLabMate_Local/'],
      files: [{ filename: 'Demo landing page.png', path: '/demo-labmate-landing.png' }], comments: [],
      created_by: 'Demo User 3', created_at: '2026-08-03T11:00:00Z'
    }
  ];
  private readonly demoSamples = Array.from({ length: 6 }, (_, index) => {
    const group = Math.floor(index / 2) + 1;
    const number = (index % 2) + 1;
    return {
      id: `demo-archive-sample-${index + 1}`, storage_location: `Demo Box ${group} / Slot ${number}`,
      barcode: `DEMO-${group}${number}`, sample_name: `Sample ${group}-${number}`, person: `Demo User ${group}`,
      project: `Demo Experiment ${group}`, lab: `Demo Lab ${group}`,
      files: [{ filename: index % 2 === 0 ? 'Demo landing page.png' : 'Demo logo.png', path: index % 2 === 0 ? '/demo-labmate-landing.png' : '/demo-labmate-logo.png' }],
      links: [index % 2 === 0 ? 'https://jamesk0802.github.io/myLabMate_Local/' : 'https://jamesk0802.github.io/namu/'],
      linked_record_id: `demo-archive-record-${group}`
    };
  });
  private demoSettings: Record<string, ArchiveSettings> = {};

  constructor(private http: HttpClient, private auth: AuthService) {}

  private async getAuthHeaders() {
    const session = await this.auth.getSession();
    return new HttpHeaders({
      'Authorization': `Bearer ${session?.access_token}`
    });
  }

  // --- Records ---
  async getRecords(labId: string): Promise<any[]> {
    if (this.auth.isDemo) return this.demoRecords.map(record => ({ ...record, files: record.files.map(file => ({ ...file })), comments: record.comments.map(comment => ({ ...comment })) }));
    const headers = await this.getAuthHeaders();
    return firstValueFrom(
      this.http.get<any[]>(`${this.apiUrl}/${labId}/records`, { headers })
    );
  }

  async createRecord(labId: string, record: { title: string, summary: string, description: string, links: string[] }): Promise<any> {
    const headers = await this.getAuthHeaders();
    return firstValueFrom(
      this.http.post(`${this.apiUrl}/${labId}/records`, record, { headers })
    );
  }

  async deleteRecord(labId: string, recordId: string): Promise<any> {
    const headers = await this.getAuthHeaders();
    return firstValueFrom(
      this.http.delete(`${this.apiUrl}/${labId}/records/${recordId}`, { headers })
    );
  }

  async addComment(labId: string, recordId: string, text: string): Promise<any> {
    const headers = await this.getAuthHeaders();
    return firstValueFrom(
      this.http.post(`${this.apiUrl}/${labId}/records/${recordId}/comments`, { text }, { headers })
    );
  }

  async deleteComment(labId: string, recordId: string, commentId: string): Promise<any> {
    const headers = await this.getAuthHeaders();
    return firstValueFrom(
      this.http.delete(`${this.apiUrl}/${labId}/records/${recordId}/comments/${commentId}`, { headers })
    );
  }

  async uploadRecordAttachment(labId: string, recordId: string, file: File): Promise<any> {
    const headers = await this.getAuthHeaders();
    const formData = new FormData();
    formData.append('file', file);
    return firstValueFrom(
      this.http.post(`${this.apiUrl}/${labId}/records/${recordId}/upload`, formData, { headers })
    );
  }

  // --- File System ---
  async getFsList(labId: string, path: string = ""): Promise<any[]> {
    if (this.auth.isDemo) {
      if (path) return [];
      return [
        { name: 'Demo landing page.png', rel_path: '/demo-labmate-landing.png', is_dir: false, is_linked: true, size: 209056, modified_at: '2026-08-09T00:00:00Z' },
        { name: 'Demo logo.png', rel_path: '/demo-labmate-logo.png', is_dir: false, is_linked: true, size: 15985, modified_at: '2026-08-09T00:00:00Z' }
      ];
    }
    const headers = await this.getAuthHeaders();
    return firstValueFrom(
      this.http.get<any[]>(`${this.apiUrl}/${labId}/fs?path=${encodeURIComponent(path)}`, { headers })
    );
  }

  async downloadFile(labId: string, path: string): Promise<Blob> {
    if (path.startsWith('/')) {
      return firstValueFrom(this.http.get(path, { responseType: 'blob' }));
    }

    const headers = await this.getAuthHeaders();
    return firstValueFrom(
      this.http.get(`${this.apiUrl}/${labId}/fs/download?path=${encodeURIComponent(path)}`, {
        headers,
        responseType: 'blob'
      })
    );
  }

  async uploadFile(labId: string, path: string, file: File): Promise<any> {
    const headers = await this.getAuthHeaders();
    const formData = new FormData();
    formData.append('path', path);
    formData.append('file', file);
    return firstValueFrom(
      this.http.post(`${this.apiUrl}/${labId}/fs/upload`, formData, { headers })
    );
  }

  async createFolder(labId: string, path: string, folderName: string): Promise<any> {
    const headers = await this.getAuthHeaders();
    return firstValueFrom(
      this.http.post(`${this.apiUrl}/${labId}/fs/mkdir`, { path, folder_name: folderName }, { headers })
    );
  }

  async deletePath(labId: string, path: string): Promise<any> {
    const headers = await this.getAuthHeaders();
    return firstValueFrom(
      this.http.post(`${this.apiUrl}/${labId}/fs/delete`, { path }, { headers })
    );
  }

  async movePath(labId: string, sourcePath: string, destPath: string): Promise<any> {
    const headers = await this.getAuthHeaders();
    return firstValueFrom(
      this.http.post(`${this.apiUrl}/${labId}/fs/move`, { source_path: sourcePath, dest_path: destPath }, { headers })
    );
  }

  async copyPath(labId: string, sourcePath: string, destPath: string): Promise<any> {
    const headers = await this.getAuthHeaders();
    return firstValueFrom(
      this.http.post(`${this.apiUrl}/${labId}/fs/copy`, { source_path: sourcePath, dest_path: destPath }, { headers })
    );
  }

  async linkExistingFile(labId: string, recordId: string, path: string): Promise<any> {
    const headers = await this.getAuthHeaders();
    return firstValueFrom(
      this.http.post(`${this.apiUrl}/${labId}/records/${recordId}/link-file`, { path }, { headers })
    );
  }

  async unlinkExistingFile(labId: string, recordId: string, path: string): Promise<any> {
    const headers = await this.getAuthHeaders();
    return firstValueFrom(
      this.http.post(`${this.apiUrl}/${labId}/records/${recordId}/unlink-file`, { path }, { headers })
    );
  }

  getCurrentToken(): string | null {
    return this.auth.accessToken;
  }

  async updateRecord(labId: string, recordId: string, record: { title: string, summary: string, description: string, links: string[] }): Promise<any> {
    const headers = await this.getAuthHeaders();
    return firstValueFrom(
      this.http.patch(`${this.apiUrl}/${labId}/records/${recordId}`, record, { headers })
    );
  }

  // --- Samples ---
  async getSamples(labId: string): Promise<any[]> {
    if (this.auth.isDemo) return this.demoSamples.map(sample => ({ ...sample, files: sample.files.map(file => ({ ...file })), links: [...sample.links] }));
    const headers = await this.getAuthHeaders();
    return firstValueFrom(
      this.http.get<any[]>(`${this.apiUrl}/${labId}/samples`, { headers })
    );
  }

  async saveSamples(labId: string, samples: any[]): Promise<any[]> {
    if (this.auth.isDemo) return samples.map(sample => ({ ...sample, id: sample.id || `demo-sample-${Date.now()}-${Math.random()}` }));
    const headers = await this.getAuthHeaders();
    return firstValueFrom(
      this.http.post<any[]>(`${this.apiUrl}/${labId}/samples`, { samples }, { headers })
    );
  }

  async getSettings(labId: string): Promise<ArchiveSettings> {
    if (this.auth.isDemo) return this.demoSettings[labId] || { storage_location_rules: [], can_manage: labId === 'demo-lab-genome' };
    const headers = await this.getAuthHeaders();
    return firstValueFrom(this.http.get<ArchiveSettings>(`${this.apiUrl}/${labId}/settings`, { headers }));
  }

  async saveSettings(labId: string, rules: StorageLocationRule[]): Promise<ArchiveSettings> {
    if (this.auth.isDemo) {
      const settings = { storage_location_rules: rules, can_manage: true, updated_at: new Date().toISOString() };
      this.demoSettings[labId] = settings;
      return settings;
    }
    const headers = await this.getAuthHeaders();
    return firstValueFrom(this.http.put<ArchiveSettings>(`${this.apiUrl}/${labId}/settings`, { storage_location_rules: rules }, { headers }));
  }

  async uploadSampleAttachment(labId: string, sampleId: string, file: File): Promise<any> {
    const headers = await this.getAuthHeaders();
    const formData = new FormData();
    formData.append('file', file);
    return firstValueFrom(
      this.http.post(`${this.apiUrl}/${labId}/samples/${sampleId}/upload`, formData, { headers })
    );
  }
}
