# Facility Booking — Developer Guide

> **Module:** Facility Booking System  
> **Last Updated:** 2026-05-16  
> **Status:** v1.0 — First Working Draft

---

## Architecture Overview

The Facility Booking module follows the same architecture as the rest of the application:

- **Backend:** FastAPI router (`routers/facility_booking.py`) with SQLAlchemy ORM models
- **Database:** PostgreSQL with UUID primary keys (same as Labs, PCR, etc.)
- **Frontend:** Angular standalone component with dedicated service

---

## Data Model

See [database-schema.md](./database-schema.md) for full table definitions.

**Key tables:**
- `facility_spots` — Physical locations (growth chambers, storage, etc.)
- `facility_bookings` — Reservations linking a user to a spot for a date range

---

## API Routes

All routes are prefixed with `/api/facility` and require authentication.

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/facility/spots` | List all active spots (optional `?room=` filter) |
| `GET` | `/facility/allocation?year=&month=` | Monthly allocation map (main view) |
| `GET` | `/facility/bookings` | List bookings (optional `?spot_id=`, `?year=`, `?month=`) |
| `GET` | `/facility/bookings/{id}` | Get single booking |
| `POST` | `/facility/bookings` | Create booking (with overlap check) |
| `PUT` | `/facility/bookings/{id}` | Update booking (with overlap check) |
| `DELETE` | `/facility/bookings/{id}` | Delete booking |
| `GET` | `/facility/spots/{id}/bookings` | All bookings for a specific spot |

### Key: `/facility/allocation`

This is the primary endpoint that powers the monthly facility map view.

**Query Parameters:**
- `year` (required): e.g. `2026`
- `month` (required): e.g. `5`
- `room` (optional): Filter by room name

**Response:**
```json
{
  "year": 2026,
  "month": 5,
  "allocation": [
    {
      "spot": { "id": "...", "name": "Acacia Room 18_01", "room": "Acacia Room 18", ... },
      "booking": { "id": "...", "user_name": "Nicole", "species": "Arabidopsis Col-0", ... } | null,
      "booking_count": 1
    }
  ],
  "rooms": ["Acacia Room 18", "Speed Breeding Room", "Storage Place"],
  "summary": { "total_spots": 19, "booked": 16, "available": 3 }
}
```

---

## Monthly Availability Calculation

A spot is considered **booked** for a given month if any booking's date range overlaps with that month:

```
booking.start_date <= last_day_of_month  AND  booking.end_date >= first_day_of_month
```

This matches the Excel "Data" sheet logic where a helper formula checks if a booking's From/Till range includes the selected year-month.

---

## Overlap Conflict Prevention

Before creating or updating a booking, the API checks for date range overlaps:

```python
# Two ranges [A_start, A_end] and [B_start, B_end] overlap if:
A_start <= B_end AND A_end >= B_start
```

If an overlap is found, the API returns HTTP `409 Conflict` with a message identifying the conflicting booking. When updating, the booking being edited is excluded from the overlap check.

---

## Frontend Components

### `FacilityBookingPageComponent`

**Location:** `frontend/src/app/pages/facility-booking-page/`

**Files:**
- `facility-booking-page.component.ts` — Component logic
- `facility-booking-page.component.html` — Template
- `facility-booking-page.component.css` — Styles

**Key Features:**
- Month navigation (◀ ▶ buttons + year/month selectors)
- Room filter dropdown
- Search by name/species/spot
- Summary stats (total, booked, available)
- Spot cards grouped by room
- Click-to-view/create booking modal
- Edit and delete with confirmation

### `FacilityBookingService`

**Location:** `frontend/src/app/services/facility-booking.service.ts`

Provides typed API methods matching all backend endpoints.

---

## How to Add New Spots/Facilities

### Option 1: Add to Seed Data (for fresh databases)

Edit `SEED_SPOTS` in `backend/routers/facility_booking.py`:

```python
{"name": "New Room_01", "room": "New Room", "category": "Equipment", "map_group": "new_room", "display_order": 40}
```

### Option 2: Direct Database Insert

```sql
INSERT INTO facility_spots (id, name, room, category, display_order, map_group, is_active)
VALUES (gen_random_uuid(), 'New Room_01', 'New Room', 'Equipment', 40, 'new_room', true);
```

### Option 3: Future Admin UI

A planned admin page will allow adding/editing spots through the web interface.

---

## Seed Data

On first access, if the `facility_spots` table is empty, the system automatically seeds:
- **19 spots** across 3 rooms (Acacia Room 18, Storage Place, Speed Breeding Room)
- **16 sample bookings** matching the Excel data pattern

This ensures the system works immediately on a fresh database.

---

## Future Enhancements

1. **Admin spot management** — CRUD for spots via the web UI
2. **User account linking** — Replace `user_name` string with FK to `users` table
3. **Audit logging** — Track all booking changes
4. **Email notifications** — Alert when bookings are created/modified
5. **Calendar view** — Timeline/Gantt view alongside the monthly allocation grid
6. **Bulk import** — Import from the existing Excel file
7. **Approval workflow** — Manager approval for certain rooms
