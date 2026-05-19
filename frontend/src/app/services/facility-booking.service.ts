import { Injectable } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { AuthService } from './auth.service';
import { firstValueFrom } from 'rxjs';

export interface FacilitySpot {
  id: string;
  name: string;
  room: string;
  category: string;
  display_order: number;
  map_group: string;
  is_active: boolean;
}

export interface FacilityBooking {
  id: string;
  spot_id: string;
  spot_name?: string;
  spot_room?: string;
  spot_category?: string;
  user_name: string;
  species?: string;
  start_date: string;
  end_date: string;
  comment?: string;
  created_by_name?: string;
  created_at?: string;
  updated_at?: string;
}

export interface AllocationItem {
  spot: FacilitySpot;
  booking: FacilityBooking | null;
  booking_count: number;
}

export interface AllocationResponse {
  year: number;
  month: number;
  allocation: AllocationItem[];
  rooms: string[];
  summary: { total_spots: number; booked: number; available: number; };
}

export interface AvailabilityResult {
  available: boolean;
  spot_name: string;
  conflict?: { user_name: string; start_date: string; end_date: string; };
  alternatives: { id: string; name: string; room: string; category: string; }[];
}

export interface YearlySummaryResponse {
  year: number;
  summary: {
    spot: { id: string; name: string; room: string };
    months: { month: number; booked: boolean; user_name: string | null }[];
  }[];
  rooms: string[];
}

@Injectable({ providedIn: 'root' })
export class FacilityBookingService {
  private apiUrl = '/api/facility';

  constructor(private http: HttpClient, private auth: AuthService) {}

  private async getAuthHeaders(): Promise<HttpHeaders> {
    const session = await this.auth.getSession();
    return new HttpHeaders({ 'Authorization': `Bearer ${session?.access_token}` });
  }

  async getSpots(room?: string): Promise<FacilitySpot[]> {
    const headers = await this.getAuthHeaders();
    let url = `${this.apiUrl}/spots`;
    if (room) url += `?room=${encodeURIComponent(room)}`;
    return firstValueFrom(this.http.get<FacilitySpot[]>(url, { headers }));
  }

  async getAllocation(year: number, month: number, room?: string): Promise<AllocationResponse> {
    const headers = await this.getAuthHeaders();
    let url = `${this.apiUrl}/allocation?year=${year}&month=${month}`;
    if (room) url += `&room=${encodeURIComponent(room)}`;
    return firstValueFrom(this.http.get<AllocationResponse>(url, { headers }));
  }

  async getYearlySummary(year: number, room?: string): Promise<YearlySummaryResponse> {
    const headers = await this.getAuthHeaders();
    let url = `${this.apiUrl}/yearly-summary?year=${year}`;
    if (room) url += `&room=${encodeURIComponent(room)}`;
    return firstValueFrom(this.http.get<YearlySummaryResponse>(url, { headers }));
  }

  async getBookings(year?: number, month?: number, spotId?: string): Promise<FacilityBooking[]> {
    const headers = await this.getAuthHeaders();
    let url = `${this.apiUrl}/bookings?`;
    if (year) url += `year=${year}&`;
    if (month) url += `month=${month}&`;
    if (spotId) url += `spot_id=${spotId}&`;
    return firstValueFrom(this.http.get<FacilityBooking[]>(url, { headers }));
  }

  async checkAvailability(spotId: string, startDate: string, endDate: string): Promise<AvailabilityResult> {
    const headers = await this.getAuthHeaders();
    return firstValueFrom(
      this.http.post<AvailabilityResult>(`${this.apiUrl}/check-availability`,
        { spot_id: spotId, start_date: startDate, end_date: endDate }, { headers })
    );
  }

  async createBooking(data: any): Promise<FacilityBooking> {
    const headers = await this.getAuthHeaders();
    return firstValueFrom(this.http.post<FacilityBooking>(`${this.apiUrl}/bookings`, data, { headers }));
  }

  async updateBooking(bookingId: string, data: any): Promise<FacilityBooking> {
    const headers = await this.getAuthHeaders();
    return firstValueFrom(this.http.put<FacilityBooking>(`${this.apiUrl}/bookings/${bookingId}`, data, { headers }));
  }

  async deleteBooking(bookingId: string): Promise<any> {
    const headers = await this.getAuthHeaders();
    return firstValueFrom(this.http.delete(`${this.apiUrl}/bookings/${bookingId}`, { headers }));
  }

  async getSpotBookings(spotId: string): Promise<any> {
    const headers = await this.getAuthHeaders();
    return firstValueFrom(this.http.get(`${this.apiUrl}/spots/${spotId}/bookings`, { headers }));
  }
}
