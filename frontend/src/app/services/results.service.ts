import { Injectable } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { environment } from '../../environments/environment';
import { AuthService } from './auth.service';
import { Observable, firstValueFrom } from 'rxjs';

export interface CrisprResult {
  id: string;
  owner_user_id: string | number;
  title: string;
  metadata_json: any;
  result_json: any;
  created_at: string;
  updated_at: string;
  is_shared?: boolean;
  shared_by_name?: string;
  lab_name?: string;
  shared_with_labs?: string[];
  shared_with_users?: string[];
}

@Injectable({
  providedIn: 'root'
})
export class ResultsService {
  private apiUrl = `${environment.apiBaseUrl}/crispr-results`;

  constructor(private http: HttpClient, private auth: AuthService) {}

  private async getAuthHeaders() {
    const session = await this.auth.getSession();
    return new HttpHeaders({
      'Authorization': `Bearer ${session?.access_token}`
    });
  }

  async saveResult(title: string, metadata: any, result: any): Promise<CrisprResult> {
    const headers = await this.getAuthHeaders();
    return firstValueFrom(
      this.http.post<CrisprResult>(this.apiUrl, {
        title,
        metadata_json: metadata,
        result_json: result
      }, { headers })
    );
  }

  async getMyResults(): Promise<CrisprResult[]> {
    const headers = await this.getAuthHeaders();
    return firstValueFrom(
      this.http.get<CrisprResult[]>(`${this.apiUrl}/my`, { headers })
    );
  }

  async getSharedResults(): Promise<CrisprResult[]> {
    const headers = await this.getAuthHeaders();
    return firstValueFrom(
      this.http.get<CrisprResult[]>(`${this.apiUrl}/shared`, { headers })
    );
  }

  async getAllResults(): Promise<CrisprResult[]> {
    const headers = await this.getAuthHeaders();
    return firstValueFrom(
      this.http.get<CrisprResult[]>(`${this.apiUrl}/all`, { headers })
    );
  }

  async getResult(id: string): Promise<CrisprResult> {
    const headers = await this.getAuthHeaders();
    return firstValueFrom(
      this.http.get<CrisprResult>(`${this.apiUrl}/${id}`, { headers })
    );
  }

  async deleteResult(id: string): Promise<any> {
    const headers = await this.getAuthHeaders();
    return firstValueFrom(
      this.http.delete(`${this.apiUrl}/${id}`, { headers })
    );
  }

  // --- Sharing ---
  async getResultShares(id: string): Promise<{ view_lab_ids: string[]; view_user_ids: string[] }> {
    const headers = await this.getAuthHeaders();
    return firstValueFrom(
      this.http.get<{ view_lab_ids: string[]; view_user_ids: string[] }>(`${this.apiUrl}/${id}/shares`, { headers })
    );
  }

  async updateResultShares(id: string, labIds: string[], userIds: string[]): Promise<any> {
    const headers = await this.getAuthHeaders();
    return firstValueFrom(
      this.http.put(`${this.apiUrl}/${id}/shares`, { view_lab_ids: labIds, view_user_ids: userIds }, { headers })
    );
  }

  async removeShare(id: string, labId: string): Promise<any> {
    const headers = await this.getAuthHeaders();
    return firstValueFrom(
      this.http.delete(`${this.apiUrl}/${id}/shares/${labId}`, { headers })
    );
  }
}
