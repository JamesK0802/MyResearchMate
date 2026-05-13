/**
 * AuthService — Manages Supabase authentication state for the Angular app.
 *
 * Responsibilities:
 * - Google OAuth login via Supabase
 * - Session persistence and auto-refresh
 * - Email domain validation (@anu.edu.au)
 * - User profile retrieval from FastAPI backend
 * - Login/logout state as Observable for reactive UI updates
 */
import { Injectable, NgZone } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { BehaviorSubject, Observable, firstValueFrom } from 'rxjs';
import { createClient, SupabaseClient, Session, User } from '@supabase/supabase-js';
import { environment } from '../../environments/environment';

export interface UserProfile {
  id: number;
  uid?: string; // ANU UID (e.g. u1234567)
  supabase_auth_id: string;
  email: string;
  name: string;
  bio?: string;
  role: 'owner' | 'admin' | 'manager' | 'user';
  profile_completed: boolean;
  created_at: string;
  last_login: string | null;
}

@Injectable({ providedIn: 'root' })
export class AuthService {
  private supabase: SupabaseClient;

  /** Current Supabase session (null when logged out) */
  private sessionSubject = new BehaviorSubject<Session | null>(null);
  public session$ = this.sessionSubject.asObservable();

  /** User profile from our backend (null when logged out) */
  private profileSubject = new BehaviorSubject<UserProfile | null>(null);
  public profile$ = this.profileSubject.asObservable();

  /** Loading state for auth operations */
  private loadingSubject = new BehaviorSubject<boolean>(true);
  public loading$ = this.loadingSubject.asObservable();

  /** Quick boolean check */
  get isLoggedIn(): boolean {
    return this.sessionSubject.value !== null;
  }

  get currentProfile(): UserProfile | null {
    return this.profileSubject.value;
  }

  get accessToken(): string | null {
    return this.sessionSubject.value?.access_token ?? null;
  }

  constructor(
    private http: HttpClient,
    private ngZone: NgZone,
  ) {
    this.supabase = createClient(
      environment.supabaseUrl,
      environment.supabaseAnonKey,
    );

    // Listen for auth state changes (login, logout, token refresh)
    this.supabase.auth.onAuthStateChange((event, session) => {
      this.ngZone.run(() => {
        this.sessionSubject.next(session);

        if (session) {
          this.fetchProfile();
        } else {
          this.profileSubject.next(null);
        }

        this.loadingSubject.next(false);
      });
    });

    // Initial session check
    this.initSession();
  }

  /**
   * Check for an existing session on app startup.
   */
  private async initSession(): Promise<void> {
    try {
      const { data } = await this.supabase.auth.getSession();
      this.sessionSubject.next(data.session);
      if (data.session) {
        await this.fetchProfile();
      }
    } catch (err) {
      console.error('[AuthService] Failed to restore session:', err);
    } finally {
      this.loadingSubject.next(false);
    }
  }

  /**
   * Check if a user with this email exists in the database.
   * Public check.
   */
  async checkUserExists(email: string): Promise<boolean> {
    try {
      const res = await firstValueFrom(
        this.http.post<{exists: boolean}>(`${environment.apiBaseUrl}/auth/check-user`, { email })
      );
      return res?.exists || false;
    } catch (err) {
      console.error('Failed to check user existence:', err);
      return false;
    }
  }

  /**
   * Register a new user profile after Supabase OTP verification.
   * Requires a valid session token in headers.
   */
  async registerProfile(data: { name: string, email: string, bio?: string }): Promise<UserProfile> {
    const session = await this.getSession();
    const headers = new HttpHeaders({
      'Authorization': `Bearer ${session?.access_token}`
    });

    const profile = await firstValueFrom(
      this.http.post<UserProfile>(`${environment.apiBaseUrl}/auth/register-profile`, data, { headers })
    );

    // CRITICAL: Update the profile state immediately after successful registration
    this.profileSubject.next(profile);
    
    return profile;
  }

  /**
   * Update the current user's profile information.
   */
  async updateProfile(data: { name?: string, bio?: string }): Promise<UserProfile> {
    const session = await this.getSession();
    const headers = new HttpHeaders({
      'Authorization': `Bearer ${session?.access_token}`
    });

    const updated = await firstValueFrom(
      this.http.patch<UserProfile>(`${environment.apiBaseUrl}/auth/me`, data, { headers })
    );

    this.profileSubject.next(updated);
    return updated;
  }

  /**
   * Fetch a user's public profile by their UID.
   */
  async getPublicProfile(uid: string): Promise<UserProfile> {
    return firstValueFrom(
      this.http.get<UserProfile>(`${environment.apiBaseUrl}/auth/profile/${uid}`)
    );
  }

  /**
   * Fetch full user profile from FastAPI.
   */
  async getUserProfile(): Promise<UserProfile | null> {
    const session = await this.getSession();
    if (!session) {
      this.profileSubject.next(null);
      return null;
    }

    try {
      const headers = new HttpHeaders({
        'Authorization': `Bearer ${session.access_token}`
      });
      
      const profile = await firstValueFrom(
        this.http.get<UserProfile>(`${environment.apiBaseUrl}/auth/me`, { headers })
      );
      
      this.profileSubject.next(profile);
      return profile;
    } catch (error: any) {
      console.error('Profile fetch failed:', error);
      
      // If 403, it means authenticated but no profile record
      if (error.status === 403) {
        console.warn('Profile not completed.');
        return null;
      }
      
      this.profileSubject.next(null);
      return null;
    }
  }

  /**
   * Fetch the user profile from our FastAPI backend.
   * This also triggers user creation on first login.
   */
  private async fetchProfile(): Promise<void> {
    const token = this.accessToken;
    if (!token) return;

    try {
      const headers = new HttpHeaders({
        'Authorization': `Bearer ${token}`,
      });
      const profile = await firstValueFrom(
        this.http.get<UserProfile>(`${environment.apiBaseUrl}/auth/me`, { headers })
      );
      this.profileSubject.next(profile);
    } catch (err: any) {
      console.error('[AuthService] Failed to fetch profile:', err);
      // If 403, it means authenticated but no profile record
      if (err?.status === 403) {
        console.warn('Profile not completed.');
        // Do NOT sign out here anymore, as we need the session for registration
      }
    }
  }

  /**
   * Validate email domain before login.
   */
  validateEmailDomain(email: string): boolean {
    return email.toLowerCase().endsWith(`@${environment.allowedEmailDomain}`);
  }

  /**
   * Request a 6-digit OTP code to be sent to the user's email.
   * This is used for a passwordless, code-based login flow.
   */
  async sendOtpCode(email: string): Promise<void> {
    if (!this.validateEmailDomain(email)) {
      throw new Error(`Only @${environment.allowedEmailDomain} emails are allowed.`);
    }

    const cleanEmail = email.trim().toLowerCase();
    const { error } = await this.supabase.auth.signInWithOtp({
      email: cleanEmail,
      options: {
        // By NOT providing emailRedirectTo, Supabase prioritizes sending a 6-digit token
        // if the template is configured to use {{ .Token }} or {{ .OTP }}.
        shouldCreateUser: true,
      },
    });

    if (error) {
      console.error('[AuthService] OTP Send error:', error);
      throw error;
    }
  }

  /**
   * Verify the 6-digit OTP code entered by the user.
   * Now attempts both 'email' and 'signup' types to be more resilient.
   */
  async verifyOtp(email: string, token: string): Promise<void> {
    const cleanEmail = email.trim().toLowerCase();
    const cleanToken = token.trim();

    console.log(`[AuthService] Verifying OTP for ${cleanEmail}...`);

    // 1. Try 'email' type (standard for signInWithOtp)
    const { error: errorEmail } = await this.supabase.auth.verifyOtp({
      email: cleanEmail,
      token: cleanToken,
      type: 'email',
    });

    if (!errorEmail) {
      console.log('[AuthService] OTP verified with type: email');
      return;
    }

    console.warn('[AuthService] email-type verification failed, trying signup-type...', errorEmail.message);

    // 2. Try 'signup' type (sometimes required for new users)
    const { error: errorSignup } = await this.supabase.auth.verifyOtp({
      email: cleanEmail,
      token: cleanToken,
      type: 'signup',
    });

    if (!errorSignup) {
      console.log('[AuthService] OTP verified with type: signup');
      return;
    }

    // Both failed
    console.error('[AuthService] All OTP verification types failed.');
    throw errorSignup || errorEmail;
  }

  /**
   * Initiate Google OAuth login via Supabase (Optional).
   */
  async signInWithGoogle(): Promise<void> {
    const { error } = await this.supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: window.location.origin + '/auth/callback',
        queryParams: {
          hd: environment.allowedEmailDomain,
        },
      },
    });

    if (error) {
      console.error('[AuthService] Google sign-in error:', error);
      throw error;
    }
  }

  /**
   * Handle the OAuth callback — exchange code for session.
   * Called from the callback route component.
   */
  async handleCallback(): Promise<boolean> {
    try {
      const { data, error } = await this.supabase.auth.getSession();
      if (error) throw error;

      if (data.session) {
        const email = data.session.user?.email ?? '';

        // Enforce domain restriction
        if (!this.validateEmailDomain(email)) {
          await this.signOut();
          throw new Error(`Only @${environment.allowedEmailDomain} emails are allowed.`);
        }

        this.sessionSubject.next(data.session);
        await this.fetchProfile();
        return true;
      }
      return false;
    } catch (err) {
      console.error('[AuthService] Callback error:', err);
      throw err;
    }
  }

  /**
   * Sign out and clear all state.
   */
  async signOut(): Promise<void> {
    await this.supabase.auth.signOut();
    this.sessionSubject.next(null);
    this.profileSubject.next(null);
  }

  /**
   * Get the current active session.
   */
  async getSession() {
    const { data: { session }, error } = await this.supabase.auth.getSession();
    if (error) {
      console.error('[AuthService] Error getting session:', error);
      return null;
    }
    return session;
  }

  /**
   * Register a new user in our internal database.
   */
  async updateName(name: string): Promise<UserProfile> {
    const token = this.accessToken;
    if (!token) throw new Error('Not authenticated');

    const headers = new HttpHeaders({
      'Authorization': `Bearer ${token}`,
    });
    const updated = await firstValueFrom(
      this.http.patch<UserProfile>(`${environment.apiBaseUrl}/auth/me`, { name }, { headers })
    );
    this.profileSubject.next(updated);
    return updated;
  }

  /**
   * Get authorization headers for API calls.
   */
  getAuthHeaders(): HttpHeaders {
    const token = this.accessToken;
    if (!token) return new HttpHeaders();
    return new HttpHeaders({
      'Authorization': `Bearer ${token}`,
    });
  }
}
