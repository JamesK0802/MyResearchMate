import { Injectable } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { environment } from '../../environments/environment';
import { AuthService } from './auth.service';
import { ShareAccessSettings } from '../models/share-access.model';

export interface PdfDocumentRecord {
  id: string;
  title: string;
  created_at: string;
  updated_at: string;
  document_json?: Record<string, unknown>;
  owner_user_id?: string | number;
  is_shared?: boolean;
  shared_by_name?: string;
  shared_with_labs?: string[];
  shared_with_users?: string[];
  share_access?: 'owner' | 'read' | 'edit';
  can_edit?: boolean;
}

export interface SavedSignature extends PdfDocumentRecord {
  document_json: { image_url?: string };
}

@Injectable({ providedIn: 'root' })
export class PdfDocumentService {
  private readonly apiUrl = `${environment.apiBaseUrl}/pdf-documents`;
  constructor(private http: HttpClient, private auth: AuthService) {}
  private async headers() {
    const session = await this.auth.getSession();
    return new HttpHeaders({ Authorization: `Bearer ${session?.access_token}` });
  }
  async list(scope: 'all' | 'my' | 'shared' = 'all'): Promise<PdfDocumentRecord[]> {
    return firstValueFrom(this.http.get<PdfDocumentRecord[]>(`${this.apiUrl}?scope=${scope}`, { headers: await this.headers() }));
  }
  async get(id: string): Promise<PdfDocumentRecord> {
    return firstValueFrom(this.http.get<PdfDocumentRecord>(`${this.apiUrl}/${id}`, { headers: await this.headers() }));
  }
  async save(title: string, document: Record<string, unknown>): Promise<PdfDocumentRecord> {
    return firstValueFrom(this.http.post<PdfDocumentRecord>(this.apiUrl, { title, document_json: document }, { headers: await this.headers() }));
  }
  async update(id: string, title: string, document: Record<string, unknown>): Promise<PdfDocumentRecord> {
    return firstValueFrom(this.http.put<PdfDocumentRecord>(`${this.apiUrl}/${id}`, { title, document_json: document }, { headers: await this.headers() }));
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
  async listSignatures(): Promise<SavedSignature[]> {
    return firstValueFrom(this.http.get<SavedSignature[]>(`${this.apiUrl}/signatures`, { headers: await this.headers() }));
  }
  async saveSignature(title: string, imageUrl: string): Promise<SavedSignature> {
    return firstValueFrom(this.http.post<SavedSignature>(`${this.apiUrl}/signatures`, { title, image_url: imageUrl }, { headers: await this.headers() }));
  }
  async deleteSignature(id: string) {
    return firstValueFrom(this.http.delete(`${this.apiUrl}/signatures/${id}`, { headers: await this.headers() }));
  }
}
