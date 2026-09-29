import { Injectable } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { environment } from '../../environments/environment';
import { AuthService } from './auth.service';
import { NamuDocument } from '../models/namu.model';
import { ShareAccessSettings } from '../models/share-access.model';

export interface ProtocolTreeRecord {
  id: string;
  owner_user_id: string | number;
  title: string;
  document_json: NamuDocument;
  created_at: string;
  updated_at: string;
  is_shared?: boolean;
  shared_by_name?: string;
  shared_with_labs?: string[];
  shared_with_users?: string[];
  share_access?: 'owner' | 'read' | 'edit';
  can_edit?: boolean;
}

@Injectable({ providedIn: 'root' })
export class ProtocolTreeService {
  private readonly apiUrl = `${environment.apiBaseUrl}/protocol-trees`;

  constructor(private http: HttpClient, private auth: AuthService) {}

  private async headers() {
    const session = await this.auth.getSession();
    return new HttpHeaders({ Authorization: `Bearer ${session?.access_token}` });
  }

  async saveTree(title: string, document: NamuDocument): Promise<ProtocolTreeRecord> {
    return firstValueFrom(this.http.post<ProtocolTreeRecord>(this.apiUrl, {
      title, document_json: document
    }, { headers: await this.headers() }));
  }

  async getTrees(scope: 'all' | 'my' | 'shared'): Promise<ProtocolTreeRecord[]> {
    return firstValueFrom(this.http.get<ProtocolTreeRecord[]>(`${this.apiUrl}/${scope}`, { headers: await this.headers() }));
  }

  async updateTree(id: string, title: string, document: NamuDocument): Promise<ProtocolTreeRecord> {
    return firstValueFrom(this.http.put<ProtocolTreeRecord>(`${this.apiUrl}/${id}`, {
      title, document_json: document
    }, { headers: await this.headers() }));
  }

  async deleteTree(id: string) {
    return firstValueFrom(this.http.delete(`${this.apiUrl}/${id}`, { headers: await this.headers() }));
  }

  async getShares(id: string): Promise<ShareAccessSettings> {
    return firstValueFrom(this.http.get<ShareAccessSettings>(`${this.apiUrl}/${id}/shares`, { headers: await this.headers() }));
  }

  async updateShares(id: string, settings: ShareAccessSettings) {
    return firstValueFrom(this.http.put(`${this.apiUrl}/${id}/shares`, settings, { headers: await this.headers() }));
  }
}
