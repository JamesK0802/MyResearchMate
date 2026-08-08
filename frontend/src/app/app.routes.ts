import { Routes } from '@angular/router';
import { MainPageComponent } from './pages/main-page/main-page.component';
import { CrisprLayoutComponent } from './layouts/crispr-layout/crispr-layout.component';
import { authGuard } from './guards/auth.guard';

export const routes: Routes = [
  { path: '', component: MainPageComponent },
  { 
    path: 'login', 
    loadComponent: () => import('./pages/login-page/login-page.component').then(m => m.LoginPageComponent) 
  },
  {
    path: 'register',
    loadComponent: () => import('./pages/register-page/register-page.component').then(m => m.RegisterPageComponent)
  },
  {
    path: 'crispr',
    component: CrisprLayoutComponent,
    children: [
      { path: '', redirectTo: 'analysis', pathMatch: 'full' },
      { 
        path: 'analysis', 
        loadComponent: () => import('./pages/analysis-page/analysis-page.component').then(m => m.AnalysisPageComponent) 
      },
      { 
        path: 'benchmark', 
        loadComponent: () => import('./pages/benchmark-page/benchmark-page.component').then(m => m.BenchmarkPageComponent) 
      },
      { 
        path: 'result-viewer', 
        loadComponent: () => import('./pages/result-viewer-page/result-viewer-page.component').then(m => m.ResultViewerPageComponent) 
      },
      {
        path: 'my-data',
        loadComponent: () => import('./pages/my-data/my-data.component').then(m => m.MyDataComponent),
        canActivate: [authGuard],
        data: { resource: 'crispr' }
      }
    ]
  },
  {
    path: 'my-data',
    redirectTo: 'data/crispr-results',
    pathMatch: 'full'
  },
  {
    path: 'data/crispr-results',
    redirectTo: 'crispr/my-data',
    pathMatch: 'full'
  },
  {
    path: 'data/protocol-trees',
    loadComponent: () => import('./pages/my-data/my-data.component').then(m => m.MyDataComponent),
    canActivate: [authGuard],
    data: { resource: 'protocol' }
  },
  {
    path: 'data/pcr-protocols',
    loadComponent: () => import('./pages/my-data/my-data.component').then(m => m.MyDataComponent),
    canActivate: [authGuard],
    data: { resource: 'pcr' }
  },
  { path: 'labs/register', loadComponent: () => import('./pages/lab-registration-page/lab-registration-page.component').then(m => m.LabRegistrationPageComponent), canActivate: [authGuard] },
  { path: 'labs/find', loadComponent: () => import('./pages/find-lab/find-lab.component').then(m => m.FindLabComponent), canActivate: [authGuard] },
  { path: 'labs/my', loadComponent: () => import('./pages/my-labs/my-labs.component').then(m => m.MyLabsComponent), canActivate: [authGuard] },
  { path: 'labs/:labId/archive', loadComponent: () => import('./pages/lab-group-archive-page/lab-group-archive-page.component').then(m => m.LabGroupArchivePageComponent), canActivate: [authGuard] },
  {
    path: 'admin/labs',
    loadComponent: () => import('./pages/admin-panel/admin-panel.component').then(m => m.AdminPanelComponent),
    canActivate: [authGuard]
  },
  {
    path: 'admin/managers',
    loadComponent: () => import('./pages/manager-management/manager-management.component').then(m => m.ManagerManagementComponent),
    canActivate: [authGuard]
  },
  { 
    path: 'tools/pcr', 
    loadComponent: () => import('./tools/pcr-calculator/pcr-calculator').then(m => m.PcrCalculator) 
  },
  {
    path: 'tools/sequence-viewer',
    loadComponent: () => import('./pages/sequence-workspace-page/sequence-workspace-page.component').then(m => m.SequenceWorkspacePageComponent)
  },
  {
    path: 'tools/protocol-builder',
    loadComponent: () => import('./pages/protocol-builder-page/protocol-builder-page.component').then(m => m.NamuPageComponent)
  },
  {
    path: 'auth/callback',
    loadComponent: () => import('./pages/login-callback/login-callback.component').then(m => m.LoginCallbackComponent)
  },
  {
    path: 'profile',
    loadComponent: () => import('./pages/profile-page/profile-page.component').then(m => m.ProfilePageComponent),
    canActivate: [authGuard]
  },
  {
    path: 'lab',
    canActivate: [authGuard],
    children: [
      { path: '', redirectTo: 'experiments', pathMatch: 'full' },
      {
        path: 'notes',
        loadComponent: () => import('./pages/lab-notes-page/lab-notes-page.component').then(m => m.LabNotesPageComponent)
      },
      {
        path: 'experiments',
        loadComponent: () => import('./pages/lab-experiments-page/lab-experiments-page.component').then(m => m.LabExperimentsPageComponent)
      },
      {
        path: 'archive',
        loadComponent: () => import('./pages/lab-archive-page/lab-archive-page.component').then(m => m.LabArchivePageComponent)
      }
    ]
  },
  {
    path: 'booking',
    loadComponent: () => import('./pages/facility-booking-page/facility-booking-page.component').then(m => m.FacilityBookingPageComponent),
    canActivate: [authGuard]
  },
  { path: 'tools/directory', loadComponent: () => import('./pages/tool-directory-page/tool-directory-page.component').then(m => m.ToolDirectoryPageComponent), canActivate: [authGuard] },
  { 
    path: 'contact',
    loadComponent: () => import('./pages/contact-page/contact-page.component').then(m => m.ContactPageComponent)
  },
  { path: '**', redirectTo: '' }
];
