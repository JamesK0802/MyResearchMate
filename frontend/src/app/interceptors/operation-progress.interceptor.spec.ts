import { HttpRequest } from '@angular/common/http';
import { describe, expect, it } from 'vitest';
import { operationLabel } from './operation-progress.interceptor';

describe('operationLabel', () => {
  it('identifies server backup and restore work', () => {
    expect(operationLabel(new HttpRequest('POST', '/api/server-admin/backups', {}))).toBe('Creating full server backup');
    expect(operationLabel(new HttpRequest('POST', '/api/server-admin/restore', new FormData()))).toBe('Restoring server backup');
    expect(operationLabel(new HttpRequest('POST', '/api/server-admin/cleanup', {}))).toBe('Backing up and cleaning server data');
  });

  it('identifies archive and sequence uploads', () => {
    expect(operationLabel(new HttpRequest('POST', '/api/lab-archive/lab-1/fs/upload', new FormData()))).toBe('Uploading to Lab Archive');
    expect(operationLabel(new HttpRequest('POST', '/api/sequence-workspace/files', new FormData()))).toBe('Uploading to Sequence Viewer');
  });

  it('does not display progress for routine fast requests', () => {
    expect(operationLabel(new HttpRequest('GET', '/api/labs'))).toBeNull();
  });
});
