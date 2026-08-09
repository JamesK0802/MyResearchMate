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
  private readonly demoSpots: FacilitySpot[] = [
    ...['01', '02', '03', '04', '05', '06', '07', '08', '09', '10'].map((number, index) => ({ id: `acacia-${index + 1}`, name: `Acacia Room 18_${number}`, room: 'Acacia Room 18', category: 'Growth Space', display_order: index + 1, map_group: 'Acacia', is_active: true })),
    ...['Speed Breeding Station_01', 'Speed Breeding Station_02', 'Speed Breeding Station_03', 'Speed Drying Station_01', 'Overflow_01', 'Overflow_02'].map((name, index) => ({ id: `speed-${index + 1}`, name, room: 'Speed Breeding & Drying Room', category: 'Growth Space', display_order: index + 11, map_group: 'Speed', is_active: true })),
  ];
  private demoBookings: FacilityBooking[] = this.makeDemoBookings();

  constructor(private http: HttpClient, private auth: AuthService) {}

  private async getAuthHeaders(): Promise<HttpHeaders> {
    const session = await this.auth.getSession();
    return new HttpHeaders({ 'Authorization': `Bearer ${session?.access_token}` });
  }

  private makeDemoBookings(): FacilityBooking[] {
    const year = new Date().getFullYear();
    return [
      ['demo-booking-1', 'acacia-1', 'Demo User 1', 2, 5, 'This is a demo booking for Sample 1-1'],
      ['demo-booking-2', 'acacia-4', 'Demo User 2', 4, 7, 'This is a demo booking for Sample 2-1'],
      ['demo-booking-3', 'speed-1', 'Demo User 3', 1, 3, 'This is a demo booking for Sample 3-1'],
      ['demo-booking-4', 'speed-3', 'Demo User 1', 8, 10, 'This is a demo booking for Demo Experiment 2'],
      ['demo-booking-5', 'acacia-10', 'Demo User 3', 11, 12, 'This is a demo booking for Demo Experiment 3'],
    ].map(([id, spot_id, user_name, start, end, comment]) => ({
      id: id as string, spot_id: spot_id as string, user_name: user_name as string,
      start_date: `${year}-${String(start).padStart(2, '0')}-01`,
      end_date: `${year}-${String(end).padStart(2, '0')}-28`, comment: comment as string,
      created_by_name: user_name as string,
    }));
  }

  private isDemo() { return this.auth.isDemo; }

  async getSpots(room?: string): Promise<FacilitySpot[]> {
    if (this.isDemo()) return this.demoSpots.filter(s => !room || s.room === room);
    const headers = await this.getAuthHeaders();
    let url = `${this.apiUrl}/spots`;
    if (room) url += `?room=${encodeURIComponent(room)}`;
    return firstValueFrom(this.http.get<FacilitySpot[]>(url, { headers }));
  }

  async getAllocation(year: number, month: number, room?: string): Promise<AllocationResponse> {
    if (this.isDemo()) {
      const spots = this.demoSpots.filter(s => !room || s.room === room);
      const allocation = spots.map(spot => ({ spot, booking: this.demoBookings.find(b => b.spot_id === spot.id && b.start_date <= `${year}-${String(month).padStart(2, '0')}-31` && b.end_date >= `${year}-${String(month).padStart(2, '0')}-01`) || null, booking_count: this.demoBookings.filter(b => b.spot_id === spot.id).length }));
      return { year, month, allocation, rooms: [...new Set(this.demoSpots.map(s => s.room))], summary: { total_spots: spots.length, booked: allocation.filter(a => a.booking).length, available: allocation.filter(a => !a.booking).length } };
    }
    const headers = await this.getAuthHeaders();
    let url = `${this.apiUrl}/allocation?year=${year}&month=${month}`;
    if (room) url += `&room=${encodeURIComponent(room)}`;
    return firstValueFrom(this.http.get<AllocationResponse>(url, { headers }));
  }

  async getYearlySummary(year: number, room?: string): Promise<YearlySummaryResponse> {
    if (this.isDemo()) {
      const spots = this.demoSpots.filter(s => !room || s.room === room);
      return { year, rooms: [...new Set(this.demoSpots.map(s => s.room))], summary: spots.map(spot => ({ spot: { id: spot.id, name: spot.name, room: spot.room }, months: Array.from({ length: 12 }, (_, i) => { const b = this.demoBookings.find(x => x.spot_id === spot.id && x.start_date <= `${year}-${String(i + 1).padStart(2, '0')}-31` && x.end_date >= `${year}-${String(i + 1).padStart(2, '0')}-01`); return { month: i + 1, booked: !!b, user_name: b?.user_name || null }; }) })) };
    }
    const headers = await this.getAuthHeaders();
    let url = `${this.apiUrl}/yearly-summary?year=${year}`;
    if (room) url += `&room=${encodeURIComponent(room)}`;
    return firstValueFrom(this.http.get<YearlySummaryResponse>(url, { headers }));
  }

  async getBookings(year?: number, month?: number, spotId?: string): Promise<FacilityBooking[]> {
    if (this.isDemo()) return this.demoBookings.filter(b => (!spotId || b.spot_id === spotId) && (!year || b.start_date.startsWith(String(year)) || b.end_date.startsWith(String(year))) && (!month || (b.start_date <= `${year}-${String(month).padStart(2, '0')}-31` && b.end_date >= `${year}-${String(month).padStart(2, '0')}-01`))).map(b => ({ ...b, spot_name: this.demoSpots.find(s => s.id === b.spot_id)?.name, spot_room: this.demoSpots.find(s => s.id === b.spot_id)?.room }));
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
