import { inject } from '@angular/core';
import { HttpEventType, HttpInterceptorFn, HttpRequest } from '@angular/common/http';
import { finalize, tap } from 'rxjs';
import { OperationProgressService } from '../services/operation-progress.service';

export function operationLabel(request: Pick<HttpRequest<unknown>, 'method' | 'url' | 'body' | 'responseType'>): string | null {
  const url = request.url.toLowerCase();
  // Chunked Sequence Viewer imports report one aggregate progress operation.
  if (url.includes('/sequence-workspace/uploads')) return null;
  const isServerAdminMutation = url.includes('/server-admin/') &&
    (request.method === 'POST' || request.method === 'DELETE') &&
    (url.includes('/restore') || url.includes('/cleanup') || url.includes('/backups'));
  // Owner server operations already have a persistent, stage-aware status card.
  // A request-scoped popup duplicates it and becomes stale after navigation.
  if (isServerAdminMutation) return null;
  if (url.includes('deployment-update')) return 'Updating application server';
  if (url.includes('/lab-archive/') && (request.body instanceof FormData || url.includes('/upload'))) return 'Uploading to Lab Archive';
  if (url.includes('/sequence-workspace/files') && request.method === 'POST') return 'Uploading to Sequence Viewer';
  if (request.body instanceof FormData || url.includes('/upload')) return 'Uploading file';
  if (request.responseType === 'blob' || url.includes('/download')) return 'Downloading file';
  if (/backup|restore|cleanup|export|import/.test(url)) return 'Processing data';
  return null;
}

export const operationProgressInterceptor: HttpInterceptorFn = (request, next) => {
  const label = operationLabel(request);
  if (!label) return next(request);
  const progress = inject(OperationProgressService);
  const operationId = progress.begin(label, 'Connecting to server…');
  let finished = false;
  const trackedRequest = request.clone({ reportProgress: true });

  return next(trackedRequest).pipe(
    tap({
      next: event => {
        if (event.type === HttpEventType.UploadProgress) {
          const complete = !!event.total && event.loaded >= event.total;
          progress.update(operationId, {
            detail: complete ? 'Upload complete · Processing on server…' : 'Uploading…',
            percent: complete ? null : event.total ? Math.min(99, (event.loaded / event.total) * 100) : null,
            transferred: event.loaded,
            total: event.total,
          });
        } else if (event.type === HttpEventType.DownloadProgress) {
          progress.update(operationId, {
            detail: 'Downloading…',
            percent: event.total ? Math.min(99, (event.loaded / event.total) * 100) : null,
            transferred: event.loaded,
            total: event.total,
          });
        } else if (event.type === HttpEventType.Response) {
          finished = true;
          progress.complete(operationId);
        }
      },
      error: () => {
        finished = true;
        progress.fail(operationId);
      },
    }),
    finalize(() => { if (!finished) progress.remove(operationId); })
  );
};
