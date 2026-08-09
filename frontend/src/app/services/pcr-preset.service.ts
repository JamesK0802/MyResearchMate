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
    const component = (name: string, calculationMode: string, displayOrder: number, extra: Partial<PCRComponent> = {}): PCRComponent => ({
      name, componentType: '', calculationMode, includeInMasterMix: true, isOptional: false, displayOrder, ...extra
    });
    const systemPresets: PCRPreset[] = [
      {
        id: 'demo-system-standard-taq-protocol', name: 'Standard Taq Protocol', title: 'Standard Taq Protocol', category: 'System',
        defaultReactionVolume: 25, allowedReactionVolumes: [20, 25, 50], isSystem: true,
        components: [
          component('10 μM Forward Primer', 'primer_concentration', 1, { stockConcentration: 10, finalConcentration: 0.2 }),
          component('10 μM Reverse Primer', 'primer_concentration', 2, { stockConcentration: 10, finalConcentration: 0.2 }),
          component('Template DNA', 'fixed_volume', 3, { fixedVolume: 1, includeInMasterMix: false }),
          component('OneTaq 2X Master Mix with Standard Buffer', 'fixed_ratio', 4, { ratioDenominator: 2 }),
          component('Nuclease-Free Water', 'fill_to_reaction_volume', 5),
        ]
      },
      {
        id: 'demo-system-q5-high-fidelity-protocol', name: 'Q5 High-Fidelity Protocol', title: 'Q5 High-Fidelity Protocol', category: 'System',
        defaultReactionVolume: 25, allowedReactionVolumes: [20, 25, 50], isSystem: true,
        components: [
          component('5X Q5 Reaction Buffer', 'fixed_ratio', 1, { ratioDenominator: 5 }),
          component('10 mM dNTPs', 'fixed_volume', 2, { fixedVolume: 0.5 }),
          component('10 μM Forward Primer', 'primer_concentration', 3, { stockConcentration: 10, finalConcentration: 0.5 }),
          component('10 μM Reverse Primer', 'primer_concentration', 4, { stockConcentration: 10, finalConcentration: 0.5 }),
          component('Template DNA', 'fixed_volume', 5, { fixedVolume: 1, includeInMasterMix: false }),
          component('Q5 High-Fidelity DNA Polymerase', 'fixed_volume', 6, { fixedVolume: 0.25 }),
          component('5X Q5 High GC Enhancer (optional)', 'fixed_ratio', 7, { ratioDenominator: 5, isOptional: true }),
          component('Nuclease-Free Water', 'fill_to_reaction_volume', 8),
        ]
      }
    ];
    const now = new Date().toISOString();
    return [
      ...systemPresets,
      ...['Genotyping PCR', 'Colony PCR', 'qPCR Mix'].map((name, index) => ({
        ...systemPresets[0], id: `demo-pcr-${index}`, name: `Demo ${name}`, title: `Demo ${name}`, isSystem: false, category: 'Demo', created_at: now,
        components: systemPresets[0].components.map(component => ({ ...component }))
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
