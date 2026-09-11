import { HttpRequest } from '@angular/common/http';
import { describe, expect, it } from 'vitest';
import { operationLabel } from './operation-progress.interceptor';

describe('operationLabel', () => {
  it('leaves chunked Sequence Viewer upload progress to the aggregate importer', () => {
    expect(operationLabel({
      method: 'PUT',
      url: '/api/sequence-workspace/uploads/upload-id?offset=0',
      body: new Blob(['chunk']),
      responseType: 'json',
    })).toBeNull();
  });

  it('leaves server mutations to the persistent Admin status card', () => {
    expect(operationLabel(new HttpRequest('POST', '/api/server-admin/backups', {}))).toBeNull();
    expect(operationLabel(new HttpRequest('DELETE', '/api/server-admin/backups/my-lab-mate-backup-test.tar.gz'))).toBeNull();
    expect(operationLabel(new HttpRequest('POST', '/api/server-admin/restore', new FormData()))).toBeNull();
    expect(operationLabel(new HttpRequest('POST', '/api/server-admin/cleanup', {}))).toBeNull();
  });

  it('identifies archive and sequence uploads', () => {
    expect(operationLabel(new HttpRequest('POST', '/api/lab-archive/lab-1/fs/upload', new FormData()))).toBe('Uploading to Lab Archive');
    expect(operationLabel(new HttpRequest('POST', '/api/sequence-workspace/files', new FormData()))).toBe('Uploading to Sequence Viewer');
  });

  it('does not display progress for routine fast requests', () => {
    expect(operationLabel(new HttpRequest('GET', '/api/labs'))).toBeNull();
  });
});
