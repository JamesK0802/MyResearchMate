import { ApplicationConfig, provideBrowserGlobalErrorListeners } from '@angular/core';
import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { provideRouter, withComponentInputBinding, withHashLocation } from '@angular/router';
import { routes } from './app.routes';
import { demoMutationInterceptor } from './interceptors/demo-mutation.interceptor';
import { operationProgressInterceptor } from './interceptors/operation-progress.interceptor';

export const appConfig: ApplicationConfig = {
  providers: [
    provideRouter(routes, withComponentInputBinding(), withHashLocation()),
    provideBrowserGlobalErrorListeners(),
    provideHttpClient(withInterceptors([demoMutationInterceptor, operationProgressInterceptor]))
  ]
};
