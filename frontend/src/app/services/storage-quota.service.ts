import { Injectable } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { firstValueFrom, Subject } from 'rxjs';
import { AuthService } from './auth.service';
export interface StorageUsage { used_bytes:number; quota_bytes:number; scope:string; lab_id?:string; can_request?:boolean; latest_request?:{id:string;status:'pending'|'approved'|'rejected';review_reason:string;requested_bytes:number}; }
@Injectable({providedIn:'root'}) export class StorageQuotaService {
  private usageChanges = new Subject<{scope:'personal'|'lab';labId?:string}>();
  readonly usageChanges$ = this.usageChanges.asObservable();
  constructor(private http:HttpClient, private auth:AuthService) {}
  notifyUsageChanged(scope:'personal'|'lab',labId?:string){this.usageChanges.next({scope,labId});}
  private async headers(){ const s=await this.auth.getSession(); return new HttpHeaders({Authorization:`Bearer ${s?.access_token||''}`}); }
  async getPersonal(){ return firstValueFrom(this.http.get<StorageUsage>('/api/storage/personal',{headers:await this.headers()})); }
  async getLab(id:string){ return firstValueFrom(this.http.get<StorageUsage>(`/api/storage/labs/${id}`,{headers:await this.headers()})); }
  async request(scope:'personal'|'lab', bytes:number, reason:string, labId?:string){ const url=scope==='personal'?'/api/storage/personal/request':`/api/storage/labs/${labId}/request`; return firstValueFrom(this.http.post(url,{requested_bytes:bytes,reason},{headers:await this.headers()})); }
  async adminOverview(){return firstValueFrom(this.http.get('/api/storage/admin/overview',{headers:await this.headers()}));}
  async adminApprove(id:string,approved_bytes:number,reason:string){return firstValueFrom(this.http.post(`/api/storage/admin/requests/${id}/approve`,{approved_bytes,reason},{headers:await this.headers()}));}
  async adminReject(id:string,reason:string){return firstValueFrom(this.http.post(`/api/storage/admin/requests/${id}/reject`,{reason},{headers:await this.headers()}));}
  async adminSet(scope:string,id:string,quota_bytes:number){return firstValueFrom(this.http.put(`/api/storage/admin/${scope}/${id}`,{quota_bytes},{headers:await this.headers()}));}
}
