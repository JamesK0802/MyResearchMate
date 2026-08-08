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
  members_json: LabMemberInfo[] | null;
  status: 'pending' | 'approved' | 'rejected';
  requested_by: number;
  created_at: string;
}

@Injectable({ providedIn: 'root' })
export class LabService {
  private apiUrl = '/api';
  private readonly demoLabs = [
    { id: 'demo-lab-genome', lab_name: 'Genome Engineering Lab', lab_tagline: 'Precision editing for plant science', lab_description: 'CRISPR design, genotyping, and trait validation workflows.', is_leader: true, my_role: 'leader', created_at: '2026-02-12T09:00:00Z' },
    { id: 'demo-lab-phenomics', lab_name: 'Plant Phenomics Group', lab_tagline: 'From genotype to phenotype', lab_description: 'Collaborative imaging and growth-condition experiments.', is_leader: false, my_role: 'member', created_at: '2026-03-05T09:00:00Z' },
    { id: 'demo-lab-synthetic', lab_name: 'Synthetic Biology Hub', lab_tagline: 'Build, test, learn', lab_description: 'Shared molecular biology protocols and DNA assembly resources.', is_leader: false, my_role: 'member', created_at: '2026-04-18T09:00:00Z' },
    { id: 'demo-lab-rna', lab_name: 'RNA Biology Laboratory', lab_tagline: 'Gene regulation and expression', lab_description: 'RNA-seq, expression profiling, and transcript discovery.', created_at: '2026-05-10T09:00:00Z' },
    { id: 'demo-lab-imaging', lab_name: 'Cell Imaging Core', lab_tagline: 'Visualising living systems', lab_description: 'Microscopy support and quantitative image analysis.', created_at: '2026-06-01T09:00:00Z' },
    { id: 'demo-lab-bioinformatics', lab_name: 'Computational Genomics Unit', lab_tagline: 'Data-driven biology', lab_description: 'Reproducible genomics pipelines and statistical analysis.', created_at: '2026-06-22T09:00:00Z' },
  ];
  private readonly demoMembers: Record<string, any[]> = {
    'demo-lab-genome': [{ uid: 'u0000000', name: 'Demo Manager', email: 'u0000000@anu.edu.au', role_in_lab: 'leader' }, { uid: 'u7654321', name: 'Nicole', email: 'nicole@example.edu', role_in_lab: 'member' }, { uid: 'u7654322', name: 'James', email: 'james@example.edu', role_in_lab: 'member' }],
    'demo-lab-phenomics': [{ uid: 'u5432109', name: 'Ayesha', email: 'ayesha@example.edu', role_in_lab: 'leader' }, { uid: 'u0000000', name: 'Demo Manager', email: 'u0000000@anu.edu.au', role_in_lab: 'member' }],
    'demo-lab-synthetic': [{ uid: 'u5678901', name: 'Mina Chen', email: 'mina@example.edu', role_in_lab: 'leader' }, { uid: 'u0000000', name: 'Demo Manager', email: 'u0000000@anu.edu.au', role_in_lab: 'member' }],
  };

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
    if (this.auth.isDemo) return [{ id: 'demo-registration', lab_name: 'Demo Plant Biology Lab', lab_leader_name: 'Demo Manager', lab_leader_email: 'u0000000@anu.edu.au', lab_leader_uid: 'u0000000', members_json: [], status: 'pending', requested_by: -1, created_at: new Date().toISOString() }];
    const headers = await this.getAuthHeaders();
    return firstValueFrom(
      this.http.get<LabRegistrationRequest[]>(`${this.apiUrl}/lab-requests/my`, { headers })
    );
  }

  async getMyLabs(): Promise<any[]> {
    if (this.auth.isDemo) return this.demoLabs.slice(0, 3);
    const headers = await this.getAuthHeaders();
    return firstValueFrom(
      this.http.get<any[]>(`${this.apiUrl}/labs/my`, { headers })
    );
  }

  // --- Admin Methods ---

  async getAllRequests(): Promise<LabRegistrationRequest[]> {
    if (this.auth.isDemo) {
      return [{
        id: 'demo-lab-request', lab_name: 'Demo Plant Biology Lab',
        lab_leader_name: 'Alex Example', lab_leader_email: 'u1234567@anu.edu.au',
        lab_leader_uid: 'u1234567', lab_tagline: 'Approval workflow demonstration',
        lab_description: 'This request is local to the demo session.', members_json: [],
        status: 'pending', requested_by: -1, created_at: new Date().toISOString()
      }];
    }
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
    if (this.auth.isDemo) return this.demoLabs;
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
    if (this.auth.isDemo) return [{ id: 'demo-join-request', lab_id: 'demo-lab-rna', lab_name: 'RNA Biology Laboratory', status: 'pending', message: 'Interested in RNA editing projects.', created_at: new Date().toISOString() }];
    const headers = await this.getAuthHeaders();
    return firstValueFrom(
      this.http.get<any[]>(`${this.apiUrl}/labs/join-requests/my`, { headers })
    );
  }

  async getLabJoinRequests(labId: string): Promise<any[]> {
    if (this.auth.isDemo) return labId === 'demo-lab-genome' ? [{ id: 'demo-incoming-request', uid: 'u1234567', name: 'Alex Example', email: 'alex@example.edu', message: 'Interested in CRISPR screening.', status: 'pending', created_at: new Date().toISOString() }] : [];
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
    if (this.auth.isDemo) return this.demoMembers[labId] || [];
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
