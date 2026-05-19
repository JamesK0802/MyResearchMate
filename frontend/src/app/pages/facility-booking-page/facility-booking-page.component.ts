import { Component, OnInit, ChangeDetectorRef, HostListener } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { FacilityBookingService, AllocationItem, AllocationResponse, FacilityBooking, FacilitySpot, AvailabilityResult, YearlySummaryResponse } from '../../services/facility-booking.service';
import { AuthService } from '../../services/auth.service';

type TabType = 'table' | 'map' | 'yearly';

@Component({
  selector: 'app-facility-booking',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './facility-booking-page.component.html',
  styleUrl: './facility-booking-page.component.css'
})
export class FacilityBookingPageComponent implements OnInit {
  // Global State
  activeTab: TabType = 'table';
  allSpots: FacilitySpot[] = [];
  
  // Booking Form State (Top Section) - Using Year-Month string format ("YYYY-MM")
  form = { spot_id: '', user_name: '', species: '', start_month: '', end_month: '', comment: '' };
  formError = '';
  formSuccess = '';
  formLoading = false;
  availability: AvailabilityResult | null = null;
  
  // Edit/Delete Modal
  showEditModal = false;
  selectedBooking: FacilityBooking | null = null;
  // Modal also uses "YYYY-MM"
  editForm = { user_name: '', species: '', start_month: '', end_month: '', comment: '' };
  showDeleteConfirm = false;

  // Filter State
  selectedYear = new Date().getFullYear();
  selectedMonth = new Date().getMonth() + 1;
  selectedRoom = '';

  // Tab 1: Table State
  allBookings: FacilityBooking[] = [];
  showExpired = false;

  // Tab 2: Map State
  allocation: AllocationItem[] = [];
  mapSummary = { total_spots: 0, booked: 0, available: 0 };
  
  // Tab 3: Yearly State
  yearlySummary: YearlySummaryResponse | null = null;
  
  // Drag Selection State for Yearly Map
  isDragging = false;
  dragSpotId: string | null = null;
  dragStartMonth: number | null = null;
  dragCurrentMonth: number | null = null;

  // Options
  years: number[] = [];
  months = [
    { value: 1, label: 'January' }, { value: 2, label: 'February' },
    { value: 3, label: 'March' }, { value: 4, label: 'April' },
    { value: 5, label: 'May' }, { value: 6, label: 'June' },
    { value: 7, label: 'July' }, { value: 8, label: 'August' },
    { value: 9, label: 'September' }, { value: 10, label: 'October' },
    { value: 11, label: 'November' }, { value: 12, label: 'December' }
  ];
  rooms: string[] = [];
  
  loading = true;
  error = '';

  constructor(
    private bookingService: FacilityBookingService,
    public auth: AuthService,
    private cdr: ChangeDetectorRef
  ) {
    const now = new Date().getFullYear();
    this.years = Array.from({ length: 7 }, (_, i) => now - 1 + i);
  }

  ngOnInit() { 
    this.initFormDates();
    this.loadInitialData(); 
  }

  initFormDates() {
    const today = new Date();
    const y = today.getFullYear();
    const m = String(today.getMonth() + 1).padStart(2, '0');
    // Set to current month ("YYYY-MM")
    this.form.start_month = `${y}-${m}`;
    this.form.end_month = `${y}-${m}`;
  }

  async loadInitialData() {
    this.loading = true;
    try {
      this.allSpots = await this.bookingService.getSpots();
      const roomsSet = new Set(this.allSpots.map(s => s.room));
      this.rooms = Array.from(roomsSet).sort();
      if (this.allSpots.length > 0) {
        this.form.spot_id = this.allSpots[0].id;
      }
      // Populate user name if available
      const profile = this.auth.currentProfile;
      if (profile) {
        this.form.user_name = profile.name;
      }
      await this.refreshActiveTab();
    } catch (e: any) {
      this.error = 'Failed to load initial data.';
    } finally {
      this.loading = false;
      this.cdr.detectChanges();
    }
  }

  setTab(tab: TabType) {
    this.activeTab = tab;
    this.refreshActiveTab();
  }

  async refreshActiveTab() {
    this.loading = true;
    this.error = '';
    this.cdr.detectChanges();
    try {
      if (this.activeTab === 'table') {
        this.allBookings = await this.bookingService.getBookings();
      } else if (this.activeTab === 'map') {
        const res = await this.bookingService.getAllocation(Number(this.selectedYear), Number(this.selectedMonth), this.selectedRoom || undefined);
        this.allocation = res.allocation;
        this.mapSummary = res.summary;
      } else if (this.activeTab === 'yearly') {
        this.yearlySummary = await this.bookingService.getYearlySummary(Number(this.selectedYear), this.selectedRoom || undefined);
      }
    } catch (e: any) {
      this.error = e?.error?.detail || e?.message || 'Failed to load data.';
    } finally {
      this.loading = false;
      this.cdr.detectChanges();
    }
  }

  onFilterChange() {
    this.selectedYear = Number(this.selectedYear);
    this.selectedMonth = Number(this.selectedMonth);
    this.refreshActiveTab();
  }

  // ── Helpers to format "YYYY-MM" to full API date strings ──

  getStartDateFromMonthStr(monthStr: string): string {
    return `${monthStr}-01`;
  }

  getEndDateFromMonthStr(monthStr: string): string {
    const parts = monthStr.split('-');
    if (parts.length !== 2) return '';
    const y = Number(parts[0]);
    const m = Number(parts[1]);
    const lastDay = new Date(y, m, 0).getDate();
    return `${monthStr}-${String(lastDay).padStart(2, '0')}`;
  }

  // Helper to extract YYYY-MM from YYYY-MM-DD
  getMonthStrFromDate(dateStr: string): string {
    if (!dateStr || dateStr.length < 7) return '';
    return dateStr.substring(0, 7);
  }

  // ── Form Actions ──

  async checkAndBook() {
    if (!this.form.spot_id || !this.form.user_name || !this.form.start_month || !this.form.end_month) return;
    
    const start_date = this.getStartDateFromMonthStr(this.form.start_month);
    const end_date = this.getEndDateFromMonthStr(this.form.end_month);

    this.formLoading = true;
    this.formError = '';
    this.formSuccess = '';
    this.availability = null;
    
    try {
      this.availability = await this.bookingService.checkAvailability(this.form.spot_id, start_date, end_date);
      if (this.availability.available) {
        await this.submitNewBooking(start_date, end_date);
      }
    } catch (e: any) {
      this.formError = e?.error?.detail || e?.message || 'Check failed.';
    } finally {
      this.formLoading = false;
      this.cdr.detectChanges();
    }
  }

  pickAlternative(alt: { id: string; name: string }) {
    this.form.spot_id = alt.id;
    this.availability = null;
    this.formError = '';
    this.cdr.detectChanges();
  }

  async submitNewBooking(start_date: string, end_date: string) {
    try {
      await this.bookingService.createBooking({
        spot_id: this.form.spot_id, user_name: this.form.user_name,
        species: this.form.species, start_date, end_date, comment: this.form.comment,
      });
      this.formSuccess = 'Booking successfully created!';
      this.availability = null;
      this.form.comment = '';
      this.form.species = '';
      this.refreshActiveTab();
      
      setTimeout(() => { this.formSuccess = ''; this.cdr.detectChanges(); }, 3000);
    } catch (e: any) {
      this.formError = e?.error?.detail || e?.message || 'Failed to save booking.';
    }
  }

  // ── Edit/Delete Actions ──

  openEditModal(booking: FacilityBooking) {
    this.selectedBooking = booking;
    this.editForm = {
      user_name: booking.user_name, species: booking.species || '',
      start_month: this.getMonthStrFromDate(booking.start_date),
      end_month: this.getMonthStrFromDate(booking.end_date),
      comment: booking.comment || ''
    };
    this.showEditModal = true;
    this.showDeleteConfirm = false;
    this.formError = '';
    this.cdr.detectChanges();
  }

  closeEditModal() {
    this.showEditModal = false;
    this.selectedBooking = null;
    this.formError = '';
    this.cdr.detectChanges();
  }

  async saveEdit() {
    if (!this.selectedBooking) return;
    this.formLoading = true;
    this.formError = '';

    const start_date = this.getStartDateFromMonthStr(this.editForm.start_month);
    const end_date = this.getEndDateFromMonthStr(this.editForm.end_month);

    try {
      await this.bookingService.updateBooking(this.selectedBooking.id, {
        user_name: this.editForm.user_name,
        species: this.editForm.species,
        start_date,
        end_date,
        comment: this.editForm.comment
      });
      this.closeEditModal();
      this.refreshActiveTab();
    } catch (e: any) {
      this.formError = e?.error?.detail || e?.message || 'Failed to update.';
    } finally {
      this.formLoading = false;
      this.cdr.detectChanges();
    }
  }

  async confirmDelete() {
    if (!this.selectedBooking) return;
    this.formLoading = true;
    try {
      await this.bookingService.deleteBooking(this.selectedBooking.id);
      this.closeEditModal();
      this.refreshActiveTab();
    } catch (e: any) {
      this.formError = e?.error?.detail || 'Failed to delete.';
    } finally {
      this.formLoading = false;
      this.cdr.detectChanges();
    }
  }

  // ── Table View Helpers ──
  
  get filteredBookings() {
    const now = new Date();
    now.setHours(0,0,0,0);
    
    return this.allBookings.filter(b => {
      if (this.showExpired) return true;
      const end = new Date(b.end_date + 'T00:00:00');
      return end >= now;
    });
  }

  // ── Map View Helpers (Floor plan click actions) ──

  getSpotByName(name: string): AllocationItem | undefined {
    return this.allocation.find(a => a.spot.name === name);
  }

  get monthLabel(): string {
    return this.months.find(m => m.value === Number(this.selectedMonth))?.label || '';
  }

  prevMonth() {
    if (this.selectedMonth === 1) { this.selectedMonth = 12; this.selectedYear--; }
    else { this.selectedMonth--; }
    this.onFilterChange();
  }

  nextMonth() {
    if (this.selectedMonth === 12) { this.selectedMonth = 1; this.selectedYear++; }
    else { this.selectedMonth++; }
    this.onFilterChange();
  }

  isBooked(name: string): boolean {
    return !!this.getSpotByName(name)?.booking;
  }

  getBookingInfo(name: string): string {
    const b = this.getSpotByName(name)?.booking;
    return b ? `${b.user_name} · ${b.species || '—'}` : '';
  }

  onMonthlySpotClick(name: string) {
    const item = this.getSpotByName(name);
    if (!item) return;

    if (item.booking) {
      // Booked -> open booking detail modal
      this.openEditModal(item.booking);
    } else {
      // Available -> select in top form
      this.form.spot_id = item.spot.id;
      const mStr = String(this.selectedMonth).padStart(2, '0');
      this.form.start_month = `${this.selectedYear}-${mStr}`;
      this.form.end_month = `${this.selectedYear}-${mStr}`;
      this.cdr.detectChanges();
      
      // Smooth scroll to top form
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  }

  // ── Yearly Matrix Drag Selection & Interaction ──

  onYearlyCellMouseDown(spotId: string, monthVal: number, booked: boolean, userName: string | null) {
    if (booked) {
      // Cell is already booked -> Open modal displaying booking details!
      this.fetchAndOpenBooking(spotId, monthVal);
      return;
    }
    
    // Start drag selection
    this.isDragging = true;
    this.dragSpotId = spotId;
    this.dragStartMonth = monthVal;
    this.dragCurrentMonth = monthVal;
    this.cdr.detectChanges();
  }

  onYearlyCellMouseEnter(spotId: string, monthVal: number, booked: boolean) {
    if (!this.isDragging || spotId !== this.dragSpotId || booked) return;
    this.dragCurrentMonth = monthVal;
    this.cdr.detectChanges();
  }

  @HostListener('document:mouseup')
  onGlobalMouseUp() {
    if (!this.isDragging) return;
    
    if (this.dragSpotId && this.dragStartMonth !== null && this.dragCurrentMonth !== null) {
      const m1 = Math.min(this.dragStartMonth, this.dragCurrentMonth);
      const m2 = Math.max(this.dragStartMonth, this.dragCurrentMonth);
      
      // Populate Top Booking Form
      this.form.spot_id = this.dragSpotId;
      this.form.start_month = `${this.selectedYear}-${String(m1).padStart(2, '0')}`;
      this.form.end_month = `${this.selectedYear}-${String(m2).padStart(2, '0')}`;
      
      this.formSuccess = `Selected range: ${this.months[m1-1].label} — ${this.months[m2-1].label}`;
      setTimeout(() => { this.formSuccess = ''; this.cdr.detectChanges(); }, 4000);
      
      // Smooth scroll to top form
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }

    // Reset Drag state
    this.isDragging = false;
    this.dragSpotId = null;
    this.dragStartMonth = null;
    this.dragCurrentMonth = null;
    this.cdr.detectChanges();
  }

  isCellSelected(spotId: string, monthVal: number): boolean {
    if (!this.isDragging || spotId !== this.dragSpotId || this.dragStartMonth === null || this.dragCurrentMonth === null) {
      return false;
    }
    const m1 = Math.min(this.dragStartMonth, this.dragCurrentMonth);
    const m2 = Math.max(this.dragStartMonth, this.dragCurrentMonth);
    return monthVal >= m1 && monthVal <= m2;
  }

  async fetchAndOpenBooking(spotId: string, monthVal: number) {
    this.formLoading = true;
    try {
      const bookings = await this.bookingService.getBookings(Number(this.selectedYear), monthVal, spotId);
      if (bookings && bookings.length > 0) {
        this.openEditModal(bookings[0]);
      }
    } catch (e: any) {
      this.error = 'Failed to load booking details.';
    } finally {
      this.formLoading = false;
      this.cdr.detectChanges();
    }
  }

  // ── Common Helpers ──

  formatDate(d: string): string {
    if (!d) return '';
    return new Date(d + 'T00:00:00').toLocaleDateString('en-AU', { year: 'numeric', month: 'short', day: 'numeric' });
  }

  formatMonth(monthStr: string): string {
    if (!monthStr) return '';
    const parts = monthStr.split('-');
    if (parts.length !== 2) return monthStr;
    const mIdx = Number(parts[1]) - 1;
    return `${this.months[mIdx]?.label} ${parts[0]}`;
  }
}
