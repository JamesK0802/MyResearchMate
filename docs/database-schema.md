# Facility Booking — Database Schema

> **Module:** Facility Booking System  
> **Last Updated:** 2026-05-16  
> **Status:** v1.0 — First Draft

---

## Overview

The facility booking system replaces the manual Excel-based allocation spreadsheet used for managing lab equipment and growth chamber reservations at ANU RSB. It uses two core tables: `facility_spots` for physical locations and `facility_bookings` for reservations.

---

## Tables

### 1. `facility_spots`

Represents a physical spot or location within a facility room (e.g., a single growth chamber position).

| Column | Type | Constraints | Description |
|---|---|---|---|
| `id` | `UUID` | PK, default `uuid4` | Unique spot identifier |
| `name` | `VARCHAR` | UNIQUE, INDEXED | Display name (e.g. "Acacia Room 18_01") |
| `room` | `VARCHAR` | INDEXED | Room grouping (e.g. "Acacia Room 18") |
| `category` | `VARCHAR` | default "General" | Type category (e.g. "Growth Chamber", "Storage") |
| `display_order` | `INTEGER` | default 0 | Controls visual ordering in the UI |
| `map_group` | `VARCHAR` | nullable | Sub-grouping for visual layout (e.g. "acacia_row1") |
| `is_active` | `BOOLEAN` | default true | Soft delete flag |
| `created_at` | `TIMESTAMPTZ` | server default NOW() | Record creation time |

**Purpose:** Defines the physical facility map. Each row is one bookable spot that appears as a card in the allocation view.

**Example Records:**

```
id: 550e8400-e29b-41d4-a716-446655440001
name: Acacia Room 18_01
room: Acacia Room 18
category: Growth Chamber
display_order: 1
map_group: acacia_row1
is_active: true
```

---

### 2. `facility_bookings`

Represents a reservation of a facility spot for a specific date range.

| Column | Type | Constraints | Description |
|---|---|---|---|
| `id` | `UUID` | PK, default `uuid4` | Unique booking identifier |
| `spot_id` | `UUID` | FK → `facility_spots.id`, ON DELETE CASCADE, INDEXED | Which spot is booked |
| `user_name` | `VARCHAR` | NOT NULL | Person who reserved the spot |
| `species` | `VARCHAR` | nullable | Species being studied (e.g. "Arabidopsis Col-0") |
| `start_date` | `DATE` | NOT NULL | First day of the booking period |
| `end_date` | `DATE` | NOT NULL | Last day of the booking period |
| `comment` | `TEXT` | nullable | Additional notes |
| `created_by_name` | `VARCHAR` | nullable | Who created this record in the system |
| `created_at` | `TIMESTAMPTZ` | server default NOW() | Record creation time |
| `updated_at` | `TIMESTAMPTZ` | on update NOW() | Last modification time |

**Purpose:** Tracks who has booked which spot and for how long. The system enforces no-overlap constraints at the API level.

**Example Records:**

```
id: 660e8400-e29b-41d4-a716-446655440001
spot_id: 550e8400-e29b-41d4-a716-446655440001
user_name: Nicole
species: Arabidopsis Col-0
start_date: 2026-03-01
end_date: 2026-08-31
comment: Long-term growth experiment
created_by_name: system
```

---

### 3. `booking_audit_logs` *(Planned — Not Yet Implemented)*

| Column | Type | Description |
|---|---|---|
| `id` | `UUID` | PK |
| `booking_id` | `UUID` | FK → `facility_bookings.id` |
| `action` | `VARCHAR` | "create", "update", "delete" |
| `changed_by` | `VARCHAR` | User who made the change |
| `changed_at` | `TIMESTAMPTZ` | When the change occurred |
| `previous_value` | `JSON` | Snapshot before change |
| `new_value` | `JSON` | Snapshot after change |

---

## Relationships

```
facility_spots  ──(1:N)──  facility_bookings
     id          ←FK──       spot_id
```

- One spot can have **many bookings** (across different time periods)
- Each booking belongs to **exactly one spot**
- Deleting a spot cascades to delete all its bookings

---

## Notes for Future Migrations

1. **User linking:** Currently `user_name` is a plain string. Future versions should add `user_id` (FK → `users.id`) for proper user linking.
2. **Audit logs:** The `booking_audit_logs` table should be created when edit/delete tracking is needed.
3. **Recurring bookings:** Consider adding `recurrence_type` and `recurrence_end` fields if recurring bookings are needed.
4. **Room management:** A `facility_rooms` table could be added for room-level metadata (capacity, location, manager).
5. **Approval workflow:** An `approval_status` field on bookings could enforce manager approval for certain rooms.
