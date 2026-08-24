import { Injectable } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { AuthService } from './auth.service';
import { environment } from '../../environments/environment';

export interface SequenceStorageUsage {
  used_bytes: number;
  quota_bytes: number;
}

export interface StoredSequenceFile {
  id: string;
  original_name: string;
  size_bytes: number;
  metadata_json: Record<string, unknown>;
  created_at: string;
  updated_at: string | null;
}

@Injectable({ providedIn: 'root' })
export class SequenceStorageService {
  private readonly apiUrl = `${environment.apiBaseUrl}/sequence-workspace`;

  constructor(private http: HttpClient, private auth: AuthService) {}

  private async headers(): Promise<HttpHeaders> {
    const session = await this.auth.getSession();
    return new HttpHeaders({ Authorization: `Bearer ${session?.access_token || ''}` });
  }

  async getUsage(): Promise<SequenceStorageUsage> {
    return firstValueFrom(this.http.get<SequenceStorageUsage>(`${this.apiUrl}/usage`, { headers: await this.headers() }));
  }

  async list(): Promise<StoredSequenceFile[]> {
    return firstValueFrom(this.http.get<StoredSequenceFile[]>(`${this.apiUrl}/files`, { headers: await this.headers() }));
  }

  async upload(file: File, metadata: Record<string, unknown>): Promise<StoredSequenceFile> {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('metadata_json', JSON.stringify(metadata));
    return firstValueFrom(this.http.post<StoredSequenceFile>(`${this.apiUrl}/files`, formData, { headers: await this.headers() }));
  }

  async updateMetadata(fileId: string, metadata: Record<string, unknown>): Promise<StoredSequenceFile> {
    return firstValueFrom(this.http.put<StoredSequenceFile>(`${this.apiUrl}/files/${fileId}/metadata`, {
      metadata_json: metadata,
    }, { headers: await this.headers() }));
  }

  async rename(fileId: string, name: string, itemIndex = 0): Promise<StoredSequenceFile> {
    return firstValueFrom(this.http.patch<StoredSequenceFile>(`${this.apiUrl}/files/${fileId}`, {
      name,
      item_index: itemIndex,
    }, { headers: await this.headers() }));
  }

  async download(fileId: string): Promise<Blob> {
    return firstValueFrom(this.http.get(`${this.apiUrl}/files/${fileId}/download`, {
      headers: await this.headers(),
      responseType: 'blob',
    }));
  }

  async delete(fileId: string): Promise<void> {
    await firstValueFrom(this.http.delete(`${this.apiUrl}/files/${fileId}`, { headers: await this.headers() }));
  }
}
