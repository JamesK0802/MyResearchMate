/**
 * AuthGuard — Protects routes that require authentication.
 * Redirects to the main page if the user is not logged in.
 */
import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService } from '../services/auth.service';
import { filter, map, take } from 'rxjs';

export const authGuard: CanActivateFn = () => {
  const auth = inject(AuthService);
  const router = inject(Router);

  return auth.loading$.pipe(
    // Wait until loading is complete
    filter(loading => !loading),
    take(1),
    map(() => {
      if (auth.isLoggedIn) {
        return true;
      }
      // Redirect to home page with a query param for login prompt
      return router.createUrlTree(['/'], { queryParams: { login: 'required' } });
    }),
  );
};
