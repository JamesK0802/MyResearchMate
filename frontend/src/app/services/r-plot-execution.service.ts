import { Injectable } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { environment } from '../../environments/environment';
import { AuthService } from './auth.service';
import { RPlotSyncService } from './r-plot-sync.service';

@Injectable({ providedIn: 'root' })
export class RPlotExecutionService {
  private readonly endpoint = `${environment.apiBaseUrl}/r-plot-render/run`;

  constructor(private http: HttpClient, private auth: AuthService, private sync: RPlotSyncService) {}

  private async headers() {
    const session = await this.auth.getSession();
    return new HttpHeaders({ Authorization: `Bearer ${session?.access_token || ''}` });
  }

  async runSourceCode(): Promise<{ images: Array<{ name: string; data_url: string }>; svg?: string; stdout: string }> {
    const code = this.sync.rCode.trim();
    if (!code) throw new Error('Import or paste an R script first');
    const form = new FormData();
    form.append('script', new Blob([code], { type: 'text/x-rsrc' }), 'figure.R');
    form.append('script_name', 'figure.R');
    const workbook = await this.sync.sourceWorkbookFile();
    if (workbook) {
      form.append('workbook', workbook, workbook.name);
      form.append('input_name', this.sync.expectedInputFileName() || workbook.name);
    }
    const result = await firstValueFrom(this.http.post<{ images: Array<{ name: string; data_url: string }>; svg?: string; stdout: string }>(this.endpoint, form, { headers: await this.headers() }));
    this.sync.setNativeRender(result.images || []);
    this.sync.setRenderedSvg(result.svg || null);
    return result;
  }
}
