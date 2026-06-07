import { Injectable } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { AuthService } from './auth.service';
import { firstValueFrom } from 'rxjs';

@Injectable({ providedIn: 'root' })
export class LabArchiveService {
  private apiUrl = '/api/lab-archive';

  constructor(private http: HttpClient, private auth: AuthService) {}

  private async getAuthHeaders() {
    const session = await this.auth.getSession();
    return new HttpHeaders({
      'Authorization': `Bearer ${session?.access_token}`
    });
  }

  // --- Records ---
  async getRecords(labId: string): Promise<any[]> {
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
    const headers = await this.getAuthHeaders();
    return firstValueFrom(
      this.http.get<any[]>(`${this.apiUrl}/${labId}/fs?path=${encodeURIComponent(path)}`, { headers })
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
    const headers = await this.getAuthHeaders();
    return firstValueFrom(
      this.http.get<any[]>(`${this.apiUrl}/${labId}/samples`, { headers })
    );
  }

  async saveSamples(labId: string, samples: any[]): Promise<any[]> {
    const headers = await this.getAuthHeaders();
    return firstValueFrom(
      this.http.post<any[]>(`${this.apiUrl}/${labId}/samples`, { samples }, { headers })
    );
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
