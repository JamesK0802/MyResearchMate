import { Injectable } from '@angular/core';
import { FastqCachedAlignment } from '../models/sequence.model';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { AuthService } from './auth.service';
import { environment } from '../../environments/environment';
import { safeSequenceFilename } from '../utils/sequence-filename';

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

export interface FastqReadPage {
  reads: Array<{ id: string; seq: string; qualString: string; alignment?: FastqCachedAlignment }>;
  offset: number;
  next_offset: number;
  has_more: boolean;
  total?: number;
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

  private async uploadChunk(url: string, chunk: Blob, headers: HttpHeaders): Promise<void> {
    let lastError: unknown;
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        await firstValueFrom(this.http.put(url, chunk, {
          headers: headers.set('Content-Type', 'application/octet-stream'),
        }));
        return;
      } catch (error: any) {
        lastError = error;
        const retryable = !error?.status || [408, 429, 502, 503, 504].includes(error.status);
        if (!retryable || attempt === 2) throw error;
        await new Promise(resolve => setTimeout(resolve, 300 * (attempt + 1)));
      }
    }
    throw lastError;
  }

  async getUsage(): Promise<SequenceStorageUsage> {
    return firstValueFrom(this.http.get<SequenceStorageUsage>(`${this.apiUrl}/usage`, { headers: await this.headers() }));
  }

  async list(): Promise<StoredSequenceFile[]> {
    return firstValueFrom(this.http.get<StoredSequenceFile[]>(`${this.apiUrl}/files`, { headers: await this.headers() }));
  }

  async upload(file: File, metadata: Record<string, unknown>, onProgress?: (fraction: number) => void): Promise<StoredSequenceFile> {
    const headers = await this.headers();
    const filename = safeSequenceFilename(file.name);
    const session = await firstValueFrom(this.http.post<SequenceUploadSession>(`${this.apiUrl}/uploads`, {
      filename,
      size_bytes: file.size,
      metadata_json: metadata,
    }, { headers }));

    let offset = 0;
    try {
      while (offset < file.size) {
        const chunk = file.slice(offset, Math.min(file.size, offset + session.chunk_size));
        await this.uploadChunk(`${this.apiUrl}/uploads/${session.upload_id}?offset=${offset}`, chunk, headers);
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

  async getFastqReads(fileId: string, offset: number, limit = 100, alignmentId?: string): Promise<FastqReadPage> {
    return firstValueFrom(this.http.get<FastqReadPage>(`${this.apiUrl}/files/${fileId}/reads`, {
      headers: await this.headers(),
      params: { offset, limit, ...(alignmentId ? { alignment_id: alignmentId } : {}) },
    }));
  }

  async streamFastqReads(
    fileId: string,
    onBatch: (reads: FastqReadPage['reads']) => Promise<void>,
    batchSize = 5000,
    startOffset = 0,
    maxReads = 500000
  ): Promise<number> {
    const headers = await this.headers();
    const response = await fetch(`${this.apiUrl}/files/${fileId}/reads-stream?offset=${startOffset}&limit=${maxReads}`, {
      headers: { Authorization: headers.get('Authorization') || '' },
      cache: 'no-store',
    });
    if (!response.ok || !response.body) {
      let detail = `Server request failed (HTTP ${response.status}).`;
      try {
        const payload = await response.json();
        if (typeof payload?.detail === 'string') detail = payload.detail;
      } catch {}
      throw new Error(detail);
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let pending = '';
    let batch: FastqReadPage['reads'] = [];
    let delivered = 0;
    const consumeLines = async (text: string, flush = false) => {
      pending += text;
      const lines = pending.split('\n');
      const tail = lines.pop() || '';
      pending = flush ? '' : tail;
      for (const line of lines) {
        if (!line.trim()) continue;
        batch.push(JSON.parse(line));
        if (batch.length >= batchSize) {
          const ready = batch;
          batch = [];
          await onBatch(ready);
          delivered += ready.length;
        }
      }
      if (flush && tail.trim()) batch.push(JSON.parse(tail));
    };

    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      await consumeLines(decoder.decode(value, { stream: true }));
    }
    await consumeLines(decoder.decode(), true);
    if (batch.length) {
      await onBatch(batch);
      delivered += batch.length;
    }
    return delivered;
  }

  async saveAlignmentPage(
    fileId: string,
    alignmentId: string,
    offset: number,
    reads: Array<{ id: string; seq: string }>,
    results: FastqCachedAlignment[]
  ): Promise<void> {
    await firstValueFrom(this.http.put(`${this.apiUrl}/files/${fileId}/alignment-pages`, {
      alignment_id: alignmentId,
      offset,
      reads,
      results,
    }, { headers: await this.headers() }));
  }

  async getAlignedFastqReads(
    fileId: string,
    alignmentId: string,
    order: 'aligned' | 'unaligned',
    offset: number,
    limit = 100
  ): Promise<FastqReadPage> {
    return firstValueFrom(this.http.get<FastqReadPage>(`${this.apiUrl}/files/${fileId}/alignments/${alignmentId}/reads`, {
      headers: await this.headers(),
      params: { order, offset, limit },
    }));
  }

  async deleteAlignment(fileId: string, alignmentId: string): Promise<void> {
    await firstValueFrom(this.http.delete(`${this.apiUrl}/files/${fileId}/alignments/${alignmentId}`, { headers: await this.headers() }));
  }

  async delete(fileId: string): Promise<void> {
    await firstValueFrom(this.http.delete(`${this.apiUrl}/files/${fileId}`, { headers: await this.headers() }));
  }
}
