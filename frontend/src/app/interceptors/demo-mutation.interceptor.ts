import { inject } from '@angular/core';
import { HttpInterceptorFn } from '@angular/common/http';
import { throwError } from 'rxjs';
import { AuthService } from '../services/auth.service';

/**
 * Demo sessions never write to the API. This catches any mutation that a page
 * has not handled locally and gives the visitor a useful explanation instead
 * of a silent failure or a misleading server error.
 */
export const demoMutationInterceptor: HttpInterceptorFn = (request, next) => {
  const auth = inject(AuthService);
  const writesData = ['POST', 'PUT', 'PATCH', 'DELETE'].includes(request.method);
  if (auth.isDemo && writesData && request.url.startsWith('/api/')) {
    auth.notifyDemoUnavailable('Saving, sharing, deleting, and approval actions');
    return throwError(() => new Error('Demo mode does not allow API mutations.'));
  }
  return next(request);
};
