import { Injectable } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { AuthService } from './auth.service';
import { firstValueFrom } from 'rxjs';

export interface LabMemberInfo {
  uid: string;
  name: string;
  email: string;
}

export interface LabRegistrationRequest {
  id: string;
  lab_name: string;
  lab_leader_name: string;
  lab_leader_email: string;
  lab_leader_uid: string;
  lab_tagline?: string;
  lab_description?: string;
  members_json: LabMemberInfo[];
  status: 'pending' | 'approved' | 'rejected';
  requested_by: number;
  created_at: string;
}

@Injectable({ providedIn: 'root' })
export class LabService {
  private apiUrl = '/api';

  constructor(private http: HttpClient, private auth: AuthService) {}

  private async getAuthHeaders() {
    const session = await this.auth.getSession();
    return new HttpHeaders({
      'Authorization': `Bearer ${session?.access_token}`
    });
  }

  async getAllUsers(): Promise<any[]> {
    const headers = await this.getAuthHeaders();
    return firstValueFrom(
      this.http.get<any[]>(`${this.apiUrl}/auth/users`, { headers })
    );
  }

  async searchUsers(query: string): Promise<any[]> {
    const headers = await this.getAuthHeaders();
    return firstValueFrom(
      this.http.get<any[]>(`${this.apiUrl}/auth/users/search?q=${query}`, { headers })
    );
  }

  async createLabRequest(data: any): Promise<LabRegistrationRequest> {
    const headers = await this.getAuthHeaders();
    return firstValueFrom(
      this.http.post<LabRegistrationRequest>(`${this.apiUrl}/lab-requests`, data, { headers })
    );
  }

  async getMyRequests(): Promise<LabRegistrationRequest[]> {
    const headers = await this.getAuthHeaders();
    return firstValueFrom(
      this.http.get<LabRegistrationRequest[]>(`${this.apiUrl}/lab-requests/my`, { headers })
    );
  }

  async getMyLabs(): Promise<any[]> {
    const headers = await this.getAuthHeaders();
    return firstValueFrom(
      this.http.get<any[]>(`${this.apiUrl}/labs/my`, { headers })
    );
  }

  // --- Admin Methods ---

  async getAllRequests(): Promise<LabRegistrationRequest[]> {
    const headers = await this.getAuthHeaders();
    return firstValueFrom(
      this.http.get<LabRegistrationRequest[]>(`${this.apiUrl}/admin/lab-requests`, { headers })
    );
  }

  async approveRequest(id: string): Promise<any> {
    const headers = await this.getAuthHeaders();
    return firstValueFrom(
      this.http.post(`${this.apiUrl}/admin/lab-requests/${id}/approve`, {}, { headers })
    );
  }

  async rejectRequest(id: string): Promise<any> {
    const headers = await this.getAuthHeaders();
    return firstValueFrom(
      this.http.post(`${this.apiUrl}/admin/lab-requests/${id}/reject`, {}, { headers })
    );
  }

  // --- Lab Discovery ---

  async getAllLabs(): Promise<any[]> {
    const headers = await this.getAuthHeaders();
    return firstValueFrom(
      this.http.get<any[]>(`${this.apiUrl}/labs/all`, { headers })
    );
  }

  async requestToJoinLab(labId: string, message: string = ''): Promise<any> {
    const headers = await this.getAuthHeaders();
    return firstValueFrom(
      this.http.post(`${this.apiUrl}/labs/${labId}/join`, { message }, { headers })
    );
  }

  async getMyJoinRequests(): Promise<any[]> {
    const headers = await this.getAuthHeaders();
    return firstValueFrom(
      this.http.get<any[]>(`${this.apiUrl}/labs/join-requests/my`, { headers })
    );
  }

  async getLabJoinRequests(labId: string): Promise<any[]> {
    const headers = await this.getAuthHeaders();
    return firstValueFrom(
      this.http.get<any[]>(`${this.apiUrl}/labs/${labId}/join-requests`, { headers })
    );
  }

  async approveJoinRequest(requestId: string): Promise<any> {
    const headers = await this.getAuthHeaders();
    return firstValueFrom(
      this.http.post(`${this.apiUrl}/labs/join-requests/${requestId}/approve`, {}, { headers })
    );
  }

  async rejectJoinRequest(requestId: string): Promise<any> {
    const headers = await this.getAuthHeaders();
    return firstValueFrom(
      this.http.post(`${this.apiUrl}/labs/join-requests/${requestId}/reject`, {}, { headers })
    );
  }

  async getLabMembers(labId: string): Promise<any[]> {
    const headers = await this.getAuthHeaders();
    return firstValueFrom(
      this.http.get<any[]>(`${this.apiUrl}/labs/${labId}/members`, { headers })
    );
  }

  async removeLabMember(labId: string, targetUid: string): Promise<any> {
    const headers = await this.getAuthHeaders();
    return firstValueFrom(
      this.http.delete(`${this.apiUrl}/labs/${labId}/members/${targetUid}`, { headers })
    );
  }

  async deleteLab(labId: string): Promise<any> {
    const headers = await this.getAuthHeaders();
    return firstValueFrom(
      this.http.delete(`${this.apiUrl}/labs/${labId}`, { headers })
    );
  }
}
