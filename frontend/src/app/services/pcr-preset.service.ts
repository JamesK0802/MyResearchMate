import { Injectable } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { environment } from '../../environments/environment';
import { AuthService } from './auth.service';

export interface PCRComponent {
  id?: string;
  name: string;
  componentType: string;
  calculationMode: string;
  stockConcentration?: number;
  stockUnit?: string;
  finalConcentration?: number;
  finalUnit?: string;
  fixedVolume?: number;
  volumePer25ul?: number;
  ratioDenominator?: number;
  includeInMasterMix: boolean;
  isOptional: boolean;
  displayOrder: number;
}

export interface PCRPreset {
  id?: string;
  name: string;
  category: string;
  source?: string;
  description?: string;
  defaultReactionVolume: number;
  allowedReactionVolumes: number[];
  isSystem: boolean;
  ownerUserId?: number;
  components: PCRComponent[];
}

@Injectable({
  providedIn: 'root'
})
export class PcrPresetService {
  private apiUrl = `${environment.apiBaseUrl}/pcr-presets`;

  constructor(private http: HttpClient, private auth: AuthService) {}

  private async getHeaders() {
    // Access session from AuthService's internal state
    const session = (this.auth as any).sessionSubject?.value;
    const token = session?.access_token || '';
    return new HttpHeaders().set('Authorization', `Bearer ${token}`);
  }

  async getPresets(): Promise<{ presets: PCRPreset[], transfers: any[] }> {
    const headers = await this.getHeaders();
    return firstValueFrom(this.http.get<any>(this.apiUrl, { headers }));
  }

  async createPreset(preset: PCRPreset): Promise<any> {
    const headers = await this.getHeaders();
    return firstValueFrom(this.http.post(this.apiUrl, preset, { headers }));
  }

  async deletePreset(presetId: string): Promise<any> {
    const headers = await this.getHeaders();
    return firstValueFrom(this.http.delete(`${this.apiUrl}/${presetId}`, { headers }));
  }

  async sendPreset(presetId: string, toUserId: number): Promise<any> {
    const headers = await this.getHeaders();
    return firstValueFrom(this.http.post(`${this.apiUrl}/send`, { preset_id: presetId, to_user_id: toUserId }, { headers }));
  }

  async acceptTransfer(transferId: string): Promise<any> {
    const headers = await this.getHeaders();
    return firstValueFrom(this.http.post(`${this.apiUrl}/transfers/${transferId}/accept`, {}, { headers }));
  }

  async rejectTransfer(transferId: string): Promise<any> {
    const headers = await this.getHeaders();
    return firstValueFrom(this.http.post(`${this.apiUrl}/transfers/${transferId}/reject`, {}, { headers }));
  }
}
