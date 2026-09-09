import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { AuthService } from '../services/auth.service';
import { StorageUsageComponent } from './storage-usage.component';
@Component({selector:'app-my-data-header',standalone:true,imports:[CommonModule,StorageUsageComponent],template:`<header class="my-data-header"><h1>{{title}}</h1><app-storage-usage *ngIf="(auth.session$ | async) && !auth.isDemo" scope="personal" label="Personal storage"></app-storage-usage></header>`,styles:[`.my-data-header{margin-bottom:var(--space-3);display:flex;justify-content:space-between;align-items:center;gap:16px}.my-data-header h1{font-size:var(--text-3xl);font-weight:var(--fw-black);color:var(--color-text-primary);margin:0;letter-spacing:-.025em}@media(max-width:600px){.my-data-header{align-items:stretch;flex-direction:column;gap:6px;margin-bottom:10px}.my-data-header h1{font-size:1.55rem;line-height:1.15}}`]})
export class MyDataHeaderComponent { @Input() title='My Data'; constructor(public auth:AuthService){} }
