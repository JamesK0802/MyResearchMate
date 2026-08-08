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
  title?: string;
  category: string;
  source?: string;
  description?: string;
  defaultReactionVolume: number;
  allowedReactionVolumes: number[];
  isSystem: boolean;
  ownerUserId?: number;
  components: PCRComponent[];
  created_at?: string;
  updated_at?: string;
  is_shared?: boolean;
  shared_by_name?: string;
  shared_with_labs?: string[];
}

@Injectable({
  providedIn: 'root'
})
export class PcrPresetService {
  private apiUrl = `${environment.apiBaseUrl}/pcr-presets`;
  private pendingOpenPresetId: string | null = null;

  constructor(private http: HttpClient, private auth: AuthService) {}

  /** Mirrors the application's two built-in PCR defaults for local demo use. */
  getDemoDataPresets(): PCRPreset[] {
    const base = (name: string, buffer: string, polymerase: string, volume: number, ratio: number): PCRPreset => ({
      id: `demo-system-${name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`, name, title: name, category: 'System',
      defaultReactionVolume: volume, allowedReactionVolumes: [20, 25, 50], isSystem: true,
      components: [
        { name: buffer, componentType: '', calculationMode: 'fixed_ratio', ratioDenominator: ratio, includeInMasterMix: true, isOptional: false, displayOrder: 1 },
        { name: 'dNTPs (10 mM)', componentType: '', calculationMode: 'fixed_volume', fixedVolume: volume === 25 ? 0.5 : 0.4, includeInMasterMix: true, isOptional: false, displayOrder: 2 },
        { name: 'Forward Primer (10 μM)', componentType: '', calculationMode: 'primer_concentration', stockConcentration: 10, finalConcentration: 0.5, includeInMasterMix: true, isOptional: false, displayOrder: 3 },
        { name: 'Reverse Primer (10 μM)', componentType: '', calculationMode: 'primer_concentration', stockConcentration: 10, finalConcentration: 0.5, includeInMasterMix: true, isOptional: false, displayOrder: 4 },
        { name: polymerase, componentType: '', calculationMode: 'fixed_volume', fixedVolume: volume === 25 ? 0.25 : 0.2, includeInMasterMix: true, isOptional: false, displayOrder: 5 },
        { name: 'Template DNA', componentType: '', calculationMode: 'fixed_volume', fixedVolume: 1, includeInMasterMix: false, isOptional: false, displayOrder: 6 },
        { name: 'Nuclease-Free Water', componentType: '', calculationMode: 'fill_to_reaction_volume', includeInMasterMix: true, isOptional: false, displayOrder: 7 },
      ]
    });
    const now = new Date().toISOString();
    return [
      base('Standard Taq Protocol', '10X Taq Buffer', 'Taq Polymerase', 20, 10),
      base('Q5 High-Fidelity Protocol', '5X Q5 Buffer', 'Q5 Polymerase', 25, 5),
      ...['Genotyping PCR', 'Colony PCR', 'qPCR Mix'].map((name, index) => ({
        ...base(`Demo ${name}`, '10X PCR Buffer', 'Taq Polymerase', 20, 10), id: `demo-pcr-${index}`, isSystem: false, category: 'Demo', created_at: now,
      }))
    ];
  }

  private async getHeaders() {
    // Access session from AuthService's internal state
    const session = (this.auth as any).sessionSubject?.value;
    const token = session?.access_token || '';
    return new HttpHeaders().set('Authorization', `Bearer ${token}`);
  }

  async getPresets(): Promise<{ presets: PCRPreset[], transfers: any[] }> {
    if (this.auth.isDemo) return { presets: this.getDemoDataPresets(), transfers: [] };
    // The calculator remains useful without an account. Only the two built-in
    // protocols are exposed until a user signs in; personal/lab data stays private.
    if (!this.auth.isLoggedIn) {
      return { presets: this.getDemoDataPresets().filter(preset => preset.isSystem), transfers: [] };
    }
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

  async getDataPresets(scope: 'all' | 'my' | 'shared'): Promise<PCRPreset[]> {
    if (this.auth.isDemo) return scope === 'shared' ? [] : this.getDemoDataPresets();
    return firstValueFrom(this.http.get<PCRPreset[]>(`${this.apiUrl}/data/${scope}`, { headers: await this.getHeaders() }));
  }

  async getDataPresetShares(id: string): Promise<string[]> {
    return firstValueFrom(this.http.get<string[]>(`${this.apiUrl}/data/${id}/shares`, { headers: await this.getHeaders() }));
  }

  async updateDataPresetShares(id: string, labIds: string[]): Promise<any> {
    return firstValueFrom(this.http.put(`${this.apiUrl}/data/${id}/shares`, { lab_ids: labIds }, { headers: await this.getHeaders() }));
  }

  openPresetInCalculator(id: string) { this.pendingOpenPresetId = id; }
  consumePendingOpenPresetId(): string | null { const id = this.pendingOpenPresetId; this.pendingOpenPresetId = null; return id; }
}
