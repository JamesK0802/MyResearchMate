import { Component, ViewEncapsulation } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterOutlet, RouterLink, RouterLinkActive } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { AuthService } from './services/auth.service';
import { environment } from '../environments/environment';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [CommonModule, RouterOutlet, RouterLink, RouterLinkActive, FormsModule],
  templateUrl: './app.html',
  styleUrl: './app.css',
  encapsulation: ViewEncapsulation.None
})
export class App {
  appVersion = environment.version;
  hasNicoleAccess = false;

  constructor(public auth: AuthService, private http: HttpClient) {
    this.auth.session$.subscribe(session => {
      if (session) {
        this.checkNicoleAccess();
      } else {
        this.hasNicoleAccess = false;
      }
    });
  }

  async checkNicoleAccess() {
    try {
      const session = await this.auth.getSession();
      const headers = new HttpHeaders({ 'Authorization': `Bearer ${session?.access_token}` });
      const res = await firstValueFrom(this.http.get<any>('/api/nicole-gimmick/check-access', { headers }));
      this.hasNicoleAccess = res.has_access;
    } catch (e) {
      this.hasNicoleAccess = false;
    }
  }

  async logout() {
    await this.auth.signOut();
  }
}
