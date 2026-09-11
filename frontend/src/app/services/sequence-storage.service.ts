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

interface SequenceUploadSession {
  upload_id: string;
  chunk_size: number;
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

  async upload(file: File, metadata: Record<string, unknown>, onProgress?: (fraction: number) => void): Promise<StoredSequenceFile> {
    const headers = await this.headers();
    const session = await firstValueFrom(this.http.post<SequenceUploadSession>(`${this.apiUrl}/uploads`, {
      filename: file.name,
      size_bytes: file.size,
      metadata_json: metadata,
    }, { headers }));

    let offset = 0;
    try {
      while (offset < file.size) {
        const chunk = file.slice(offset, Math.min(file.size, offset + session.chunk_size));
        await firstValueFrom(this.http.put(`${this.apiUrl}/uploads/${session.upload_id}?offset=${offset}`, chunk, {
          headers: headers.set('Content-Type', 'application/octet-stream'),
        }));
        offset += chunk.size;
        onProgress?.(file.size ? offset / file.size : 1);
      }
      return await firstValueFrom(this.http.post<StoredSequenceFile>(`${this.apiUrl}/uploads/${session.upload_id}/complete`, {}, { headers }));
    } catch (error) {
      try {
        await firstValueFrom(this.http.delete(`${this.apiUrl}/uploads/${session.upload_id}`, { headers }));
      } catch {
        // Stale upload sessions are cleaned by the server after 24 hours.
      }
      throw error;
    }
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
