import { Component, OnInit, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { AuthService } from '../../services/auth.service';
import { firstValueFrom } from 'rxjs';

export interface NicoleBooking {
  id: string;
  booked_by: string;
  session_type: string; // Used as the custom Task name
  date_str: string;
  start_time: string;
  end_time: string;
  comment?: string;
  reaction?: string;
}

@Component({
  selector: 'app-nicole-booking',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './nicole-booking.component.html',
  styleUrl: './nicole-booking.component.css'
})
export class NicoleBookingPageComponent implements OnInit {
  selectedDateStr = '';
  bookings: NicoleBooking[] = [];
  slots: string[] = []; // List of 15-minute slot times: ["09:00", "09:15", ...]
  
  form = {
    session_type: '', // Custom task name
    start_time: '09:00',
    duration_mins: 30,
    comment: ''
  };

  loading = true;
  formLoading = false;
  error = '';
  successReaction = '';
  showBookingModal = false;
  selectedBookingDetails: NicoleBooking | null = null;
  
  constructor(
    private http: HttpClient,
    private auth: AuthService,
    private cdr: ChangeDetectorRef
  ) {}

  async ngOnInit() {
    // Set date to today
    const today = new Date();
    this.selectedDateStr = today.toISOString().substring(0, 10);
    
    // Generate 15-minute slots from 09:00 to 17:00
    this.generateSlots();
    await this.loadBookings();
  }

  generateSlots() {
    const times: string[] = [];
    let hour = 9;
    let min = 0;
    while (hour < 17 || (hour === 17 && min === 0)) {
      const hStr = hour.toString().padStart(2, '0');
      const mStr = min.toString().padStart(2, '0');
      times.push(`${hStr}:${mStr}`);
      min += 15;
      if (min === 60) {
        min = 0;
        hour += 1;
      }
    }
    this.slots = times;
  }

  private async getAuthHeaders(): Promise<HttpHeaders> {
    const session = await this.auth.getSession();
    return new HttpHeaders({ 'Authorization': `Bearer ${session?.access_token}` });
  }

  async loadBookings() {
    this.loading = true;
    this.error = '';
    this.cdr.detectChanges();
    try {
      const headers = await this.getAuthHeaders();
      this.bookings = await firstValueFrom(
        this.http.get<NicoleBooking[]>(`/api/nicole-gimmick/bookings?date=${this.selectedDateStr}`, { headers })
      );
    } catch (e: any) {
      this.error = e?.error?.detail || e?.message || 'Access denied. Please check Owner Panel settings.';
    } finally {
      this.loading = false;
      this.cdr.detectChanges();
    }
  }

  // Navigate Days
  async prevDay() {
    const d = new Date(this.selectedDateStr + 'T00:00:00');
    d.setDate(d.getDate() - 1);
    this.selectedDateStr = d.toISOString().substring(0, 10);
    this.selectedBookingDetails = null;
    await this.loadBookings();
  }

  async nextDay() {
    const d = new Date(this.selectedDateStr + 'T00:00:00');
    d.setDate(d.getDate() + 1);
    this.selectedDateStr = d.toISOString().substring(0, 10);
    this.selectedBookingDetails = null;
    await this.loadBookings();
  }

  async onDateChange() {
    this.selectedBookingDetails = null;
    await this.loadBookings();
  }

  // Helper to check if a slot is booked and return details
  getBookingForSlot(slot: string): NicoleBooking | null {
    for (const b of this.bookings) {
      if (b.start_time <= slot && b.end_time > slot) {
        return b;
      }
    }
    return null;
  }

  // Check if a slot is the exact start time of a booking
  isSlotStart(slot: string): boolean {
    return this.bookings.some(b => b.start_time === slot);
  }

  // Calculate grid row-span/height based on duration of a booking starting at slot
  getBookingDurationSlots(booking: NicoleBooking): number {
    const startMins = this.timeToMins(booking.start_time);
    const endMins = this.timeToMins(booking.end_time);
    return Math.max(1, Math.round((endMins - startMins) / 15));
  }

  timeToMins(t: string): number {
    const [h, m] = t.split(':').map(Number);
    return h * 60 + m;
  }

  minsToTime(mins: number): string {
    const h = Math.floor(mins / 60).toString().padStart(2, '0');
    const m = (mins % 60).toString().padStart(2, '0');
    return `${h}:${m}`;
  }

  // Open booking modal for a specific slot
  openBooking(slot: string) {
    this.form.start_time = slot;
    this.form.session_type = '';
    this.form.comment = '';
    this.form.duration_mins = 30;
    this.successReaction = '';
    this.showBookingModal = true;
  }

  closeBookingModal() {
    this.showBookingModal = false;
  }

  selectBooking(booking: NicoleBooking) {
    this.selectedBookingDetails = booking;
  }

  async submitBooking() {
    if (!this.form.session_type.trim()) {
      alert('Please enter a task name.');
      return;
    }

    this.formLoading = true;
    this.error = '';
    this.successReaction = '';
    this.cdr.detectChanges();

    // Calculate end time
    const startMins = this.timeToMins(this.form.start_time);
    const endMins = startMins + Number(this.form.duration_mins);
    const endTimeStr = this.minsToTime(endMins);

    const payload = {
      session_type: this.form.session_type,
      date_str: this.selectedDateStr,
      start_time: this.form.start_time,
      end_time: endTimeStr,
      comment: this.form.comment
    };

    try {
      const headers = await this.getAuthHeaders();
      const res = await firstValueFrom(
        this.http.post<NicoleBooking>('/api/nicole-gimmick/bookings', payload, { headers })
      );
      this.successReaction = res.reaction || 'Nicole has accepted your meeting!';
      
      // Auto-reload and close modal after brief delay or keep it visible to show reaction
      setTimeout(async () => {
        this.showBookingModal = false;
        await this.loadBookings();
      }, 3500);

    } catch (e: any) {
      alert(e?.error?.detail || 'Failed to request booking.');
    } finally {
      this.formLoading = false;
      this.cdr.detectChanges();
    }
  }

  formatDate(d: string): string {
    if (!d) return '';
    return new Date(d + 'T00:00:00').toLocaleDateString('en-AU', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
  }
}
