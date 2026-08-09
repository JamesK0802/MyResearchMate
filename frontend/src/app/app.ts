import { Component, OnInit, ViewEncapsulation } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, RouterOutlet, RouterLink, RouterLinkActive } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { AuthService } from './services/auth.service';
import { environment } from '../environments/environment';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { LabService } from './services/lab.service';
import { AppStateService } from './services/app-state.service';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [CommonModule, RouterOutlet, RouterLink, RouterLinkActive, FormsModule],
  templateUrl: './app.html',
  styleUrl: './app.css',
  encapsulation: ViewEncapsulation.None
})
export class App implements OnInit {
  appVersion = environment.version;
  isMobileMenuOpen = false;
  myLabs: any[] = [];

  constructor(
    public auth: AuthService,
    public analysisState: AppStateService,
    private http: HttpClient,
    private labService: LabService,
    private router: Router
  ) {}

  ngOnInit() {
    this.auth.session$.subscribe(async session => {
      if (session) {
        try {
          this.myLabs = await this.labService.getMyLabs();
        } catch (e) {
          console.error("Failed to load user labs in navbar:", e);
        }
      } else {
        this.myLabs = [];
      }
    });
  }

  toggleMobileMenu() {
    this.isMobileMenuOpen = !this.isMobileMenuOpen;
  }

  async logout() {
    this.isMobileMenuOpen = false;
    await this.auth.signOut();
    await this.router.navigateByUrl('/');
  }
}
