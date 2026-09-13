"""
Facility Booking API Router
─────────────────────────────────────────────────────────────────────────────
Provides endpoints for managing facility spots and bookings.
Replaces the manual Excel-based allocation system.
"""

from fastapi import APIRouter, Depends, HTTPException, status, Query
from typing import List, Optional
from sqlalchemy.orm import Session
from sqlalchemy import and_, or_
from auth.dependencies import get_current_user, require_admin
from database.db import get_db
from database.models import FacilityArea, FacilitySpot, FacilityBooking
from pydantic import BaseModel, Field
from datetime import date, datetime, timedelta
import uuid

router = APIRouter(prefix="/facility", tags=["facility-booking"])


# ─── Pydantic Schemas ────────────────────────────────────────────────────────

class BookingCreate(BaseModel):
    spot_id: str
    user_name: str
    species: Optional[str] = ""
    start_date: str
    end_date: str
    comment: Optional[str] = ""

class BookingUpdate(BaseModel):
    user_name: Optional[str] = None
    species: Optional[str] = None
    start_date: Optional[str] = None
    end_date: Optional[str] = None
    comment: Optional[str] = None

class AvailabilityCheck(BaseModel):
    spot_id: str
    start_date: str
    end_date: str

class FacilityCreate(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    location: str = Field(default="", max_length=200)
    description: str = Field(default="", max_length=1000)
    grid_columns: int = Field(default=4, ge=1, le=12)

class FacilityUpdate(FacilityCreate):
    display_order: int = Field(default=0, ge=0)

class SpotCreate(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    category: str = Field(default="General", max_length=120)
    grid_x: int = Field(default=1, ge=1, le=12)
    grid_y: int = Field(default=1, ge=1, le=100)
    grid_width: int = Field(default=1, ge=1, le=12)
    grid_height: int = Field(default=1, ge=1, le=12)

class SpotUpdate(SpotCreate):
    display_order: int = Field(default=0, ge=0)


# ─── Seed Data (matches Excel layout exactly) ────────────────────────────────

SEED_SPOTS = [
    # Acacia Room 18 — Left section (3x3 grid + center column spot)
    {"name": "Acacia Room 18_01", "room": "Acacia Room 18", "category": "Growth Chamber", "map_group": "acacia_row1", "display_order": 1},
    {"name": "Acacia Room 18_02", "room": "Acacia Room 18", "category": "Growth Chamber", "map_group": "acacia_row1", "display_order": 2},
    {"name": "Acacia Room 18_03", "room": "Acacia Room 18", "category": "Growth Chamber", "map_group": "acacia_row1", "display_order": 3},
    {"name": "Acacia Room 18_04", "room": "Acacia Room 18", "category": "Growth Chamber", "map_group": "acacia_row2", "display_order": 4},
    {"name": "Acacia Room 18_05", "room": "Acacia Room 18", "category": "Growth Chamber", "map_group": "acacia_row2", "display_order": 5},
    {"name": "Acacia Room 18_06", "room": "Acacia Room 18", "category": "Growth Chamber", "map_group": "acacia_row2", "display_order": 6},
    {"name": "Acacia Room 18_07", "room": "Acacia Room 18", "category": "Growth Chamber", "map_group": "acacia_row3", "display_order": 7},
    {"name": "Acacia Room 18_08", "room": "Acacia Room 18", "category": "Growth Chamber", "map_group": "acacia_row3", "display_order": 8},
    {"name": "Acacia Room 18_09", "room": "Acacia Room 18", "category": "Growth Chamber", "map_group": "acacia_row3", "display_order": 9},
    {"name": "Acacia Room 18_10", "room": "Acacia Room 18", "category": "Growth Chamber", "map_group": "acacia_center", "display_order": 10},

    # Speed Breeding Station (right section)
    {"name": "Speed Breeding Station_01", "room": "Speed Breeding Room", "category": "Speed Breeding", "map_group": "sb_bottom", "display_order": 11},
    {"name": "Speed Breeding Station_02", "room": "Speed Breeding Room", "category": "Speed Breeding", "map_group": "sb_top", "display_order": 12},
    {"name": "Speed Breeding Station_03", "room": "Speed Breeding Room", "category": "Speed Breeding", "map_group": "sb_top", "display_order": 13},

    # Overflow (middle-right)
    {"name": "Overflow_01", "room": "Speed Breeding Room", "category": "Overflow", "map_group": "overflow", "display_order": 14},
    {"name": "Overflow_02", "room": "Speed Breeding Room", "category": "Overflow", "map_group": "overflow", "display_order": 15},

    # Speed Drying (far right)
    {"name": "Speed Drying Station_01", "room": "Speed Breeding Room", "category": "Drying", "map_group": "drying", "display_order": 16},
]

SEED_BOOKINGS = [
    # Just a few sample bookings to show how it works
    {"spot_name": "Acacia Room 18_01", "user_name": "Nicole", "species": "Arabidopsis Col-0", "start_date": "2026-03-01", "end_date": "2026-08-31", "comment": "Long-term growth experiment"},
    {"spot_name": "Acacia Room 18_05", "user_name": "Nicole", "species": "Arabidopsis Col-0", "start_date": "2026-05-01", "end_date": "2026-07-31", "comment": ""},
    {"spot_name": "Speed Breeding Station_01", "user_name": "James", "species": "Wheat", "start_date": "2026-04-01", "end_date": "2026-06-30", "comment": "Speed breeding trial"},
]

def serialize_facility(facility: FacilityArea, spot_count: int = 0) -> dict:
    return {
        "id": str(facility.id), "name": facility.name, "location": facility.location or "",
        "description": facility.description or "", "grid_columns": facility.grid_columns or 4,
        "display_order": facility.display_order or 0, "is_active": facility.is_active,
        "spot_count": spot_count,
    }

def serialize_spot(spot: FacilitySpot) -> dict:
    return {
        "id": str(spot.id), "facility_id": str(spot.facility_id) if spot.facility_id else None,
        "name": spot.name, "room": spot.room, "category": spot.category or "",
        "display_order": spot.display_order, "map_group": spot.map_group or "", "is_active": spot.is_active,
        "grid_x": spot.grid_x or 1, "grid_y": spot.grid_y or 1,
        "grid_width": spot.grid_width or 1, "grid_height": spot.grid_height or 1,
    }

def ensure_facility_areas(db: Session):
    """Migrate the original room-based spots into editable facility tabs."""
    rooms = [row[0] for row in db.query(FacilitySpot.room).distinct().all() if row[0]]
    changed = False
    for order, room in enumerate(sorted(rooms), start=1):
        facility = db.query(FacilityArea).filter(FacilityArea.name == room).first()
        if not facility:
            facility = FacilityArea(name=room, location="", description="", grid_columns=4, display_order=order, is_active=True)
            db.add(facility)
            db.flush()
            changed = True
        spots = db.query(FacilitySpot).filter(FacilitySpot.room == room).order_by(FacilitySpot.display_order).all()
        for index, spot in enumerate(spots):
            if not spot.facility_id:
                spot.facility_id = facility.id
                spot.grid_x = (index % facility.grid_columns) + 1
                spot.grid_y = (index // facility.grid_columns) + 1
                spot.grid_width = 1
                spot.grid_height = 1
                changed = True
    if changed:
        db.commit()


def seed_facility_data(db: Session):
    """Seed facility spots and sample bookings if tables are empty."""
    existing = db.query(FacilitySpot).first()
    if existing:
        ensure_facility_areas(db)
        return

    print("[SEED] Seeding facility spots...")
    spot_map = {}
    for s in SEED_SPOTS:
        spot = FacilitySpot(
            name=s["name"], room=s["room"],
            category=s.get("category", "General"),
            map_group=s.get("map_group"),
            display_order=s.get("display_order", 0),
            is_active=True
        )
        db.add(spot)
        db.flush()
        spot_map[s["name"]] = spot

    print("[SEED] Seeding sample bookings...")
    for b in SEED_BOOKINGS:
        spot = spot_map.get(b["spot_name"])
        if not spot:
            continue
        booking = FacilityBooking(
            spot_id=spot.id, user_name=b["user_name"],
            species=b.get("species", ""),
            start_date=date.fromisoformat(b["start_date"]),
            end_date=date.fromisoformat(b["end_date"]),
            comment=b.get("comment", ""),
            created_by_name="system"
        )
        db.add(booking)

    db.commit()
    ensure_facility_areas(db)
    print("[SEED] Facility data seeded successfully.")


# ─── Helpers ──────────────────────────────────────────────────────────────────

def check_booking_overlap(db: Session, spot_id, start_date: date, end_date: date, exclude_booking_id=None):
    query = db.query(FacilityBooking).filter(
        FacilityBooking.spot_id == spot_id,
        FacilityBooking.start_date <= end_date,
        FacilityBooking.end_date >= start_date
    )
    if exclude_booking_id:
        query = query.filter(FacilityBooking.id != exclude_booking_id)
    return query.first()


def serialize_booking(b: FacilityBooking, spot: FacilitySpot = None) -> dict:
    return {
        "id": str(b.id),
        "spot_id": str(b.spot_id),
        "spot_name": spot.name if spot else None,
        "spot_room": spot.room if spot else None,
        "spot_category": spot.category if spot else None,
        "user_name": b.user_name,
        "species": b.species or "",
        "start_date": b.start_date.isoformat(),
        "end_date": b.end_date.isoformat(),
        "comment": b.comment or "",
        "created_by_name": b.created_by_name or "",
        "created_at": b.created_at.isoformat() if b.created_at else None,
        "updated_at": b.updated_at.isoformat() if b.updated_at else None,
    }


def find_available_alternatives(db: Session, spot_id, category: str, start: date, end: date, facility_id=None):
    """Find available spots in the same facility and category."""
    same_category = db.query(FacilitySpot).filter(
        FacilitySpot.category == category,
        FacilitySpot.is_active == True,
        FacilitySpot.id != spot_id
    )
    if facility_id:
        same_category = same_category.filter(FacilitySpot.facility_id == facility_id)
    same_category = same_category.order_by(FacilitySpot.display_order).all()

    available = []
    for s in same_category:
        conflict = check_booking_overlap(db, s.id, start, end)
        if not conflict:
            available.append({
                "id": str(s.id),
                "name": s.name,
                "room": s.room,
                "category": s.category or "",
            })
    return available


# ═════════════════════════════════════════════════════════════════════════════
# API ENDPOINTS
# ═════════════════════════════════════════════════════════════════════════════

@router.get("/spots")
async def get_spots(
    room: Optional[str] = None,
    facility_id: Optional[str] = None,
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user)
):
    seed_facility_data(db)
    query = db.query(FacilitySpot).filter(FacilitySpot.is_active == True)
    if room:
        query = query.filter(FacilitySpot.room == room)
    if facility_id:
        query = query.filter(FacilitySpot.facility_id == facility_id)
    spots = query.order_by(FacilitySpot.display_order).all()
    return [serialize_spot(s) for s in spots]

@router.get("/facilities")
async def get_facilities(db: Session = Depends(get_db), current_user: dict = Depends(get_current_user)):
    seed_facility_data(db)
    facilities = db.query(FacilityArea).filter(FacilityArea.is_active == True).order_by(FacilityArea.display_order, FacilityArea.name).all()
    return [serialize_facility(item, db.query(FacilitySpot).filter(FacilitySpot.facility_id == item.id, FacilitySpot.is_active == True).count()) for item in facilities]

@router.post("/facilities")
async def create_facility(payload: FacilityCreate, db: Session = Depends(get_db), current_user: dict = Depends(require_admin)):
    if db.query(FacilityArea).filter(FacilityArea.name.ilike(payload.name.strip())).first():
        raise HTTPException(status_code=409, detail="A facility with this name already exists")
    next_order = (db.query(FacilityArea).count() or 0) + 1
    facility = FacilityArea(name=payload.name.strip(), location=payload.location.strip(), description=payload.description.strip(), grid_columns=payload.grid_columns, display_order=next_order, is_active=True)
    db.add(facility); db.commit(); db.refresh(facility)
    return serialize_facility(facility)

@router.put("/facilities/{facility_id}")
async def update_facility(facility_id: str, payload: FacilityUpdate, db: Session = Depends(get_db), current_user: dict = Depends(require_admin)):
    facility = db.query(FacilityArea).filter(FacilityArea.id == facility_id, FacilityArea.is_active == True).first()
    if not facility: raise HTTPException(status_code=404, detail="Facility not found")
    duplicate = db.query(FacilityArea).filter(FacilityArea.name.ilike(payload.name.strip()), FacilityArea.id != facility.id).first()
    if duplicate: raise HTTPException(status_code=409, detail="A facility with this name already exists")
    old_name = facility.name
    facility.name = payload.name.strip(); facility.location = payload.location.strip(); facility.description = payload.description.strip()
    facility.grid_columns = payload.grid_columns; facility.display_order = payload.display_order
    if old_name != facility.name:
        db.query(FacilitySpot).filter(FacilitySpot.facility_id == facility.id).update({"room": facility.name})
    db.commit(); db.refresh(facility)
    return serialize_facility(facility, db.query(FacilitySpot).filter(FacilitySpot.facility_id == facility.id, FacilitySpot.is_active == True).count())

@router.post("/facilities/{facility_id}/spots")
async def create_spot(facility_id: str, payload: SpotCreate, db: Session = Depends(get_db), current_user: dict = Depends(require_admin)):
    facility = db.query(FacilityArea).filter(FacilityArea.id == facility_id, FacilityArea.is_active == True).first()
    if not facility: raise HTTPException(status_code=404, detail="Facility not found")
    if db.query(FacilitySpot).filter(FacilitySpot.name.ilike(payload.name.strip())).first():
        raise HTTPException(status_code=409, detail="A booking spot with this name already exists")
    next_order = (db.query(FacilitySpot).filter(FacilitySpot.facility_id == facility.id).count() or 0) + 1
    spot = FacilitySpot(facility_id=facility.id, name=payload.name.strip(), room=facility.name, category=payload.category.strip() or "General", display_order=next_order, map_group="custom", is_active=True, grid_x=payload.grid_x, grid_y=payload.grid_y, grid_width=min(payload.grid_width, facility.grid_columns), grid_height=payload.grid_height)
    db.add(spot); db.commit(); db.refresh(spot)
    return serialize_spot(spot)

@router.put("/spots/{spot_id}")
async def update_spot(spot_id: str, payload: SpotUpdate, db: Session = Depends(get_db), current_user: dict = Depends(require_admin)):
    spot = db.query(FacilitySpot).filter(FacilitySpot.id == spot_id, FacilitySpot.is_active == True).first()
    if not spot: raise HTTPException(status_code=404, detail="Booking spot not found")
    duplicate = db.query(FacilitySpot).filter(FacilitySpot.name.ilike(payload.name.strip()), FacilitySpot.id != spot.id).first()
    if duplicate: raise HTTPException(status_code=409, detail="A booking spot with this name already exists")
    spot.name = payload.name.strip(); spot.category = payload.category.strip() or "General"; spot.display_order = payload.display_order
    spot.grid_x = payload.grid_x; spot.grid_y = payload.grid_y; spot.grid_width = payload.grid_width; spot.grid_height = payload.grid_height
    db.commit(); db.refresh(spot)
    return serialize_spot(spot)

@router.delete("/spots/{spot_id}")
async def deactivate_spot(spot_id: str, db: Session = Depends(get_db), current_user: dict = Depends(require_admin)):
    spot = db.query(FacilitySpot).filter(FacilitySpot.id == spot_id, FacilitySpot.is_active == True).first()
    if not spot: raise HTTPException(status_code=404, detail="Booking spot not found")
    spot.is_active = False; db.commit()
    return {"status": "success"}


@router.get("/allocation")
async def get_monthly_allocation(
    year: int = Query(...), month: int = Query(..., ge=1, le=12),
    room: Optional[str] = None,
    facility_id: Optional[str] = None,
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user)
):
    seed_facility_data(db)

    month_start = date(year, month, 1)
    if month == 12:
        last_day = date(year, 12, 31)
    else:
        last_day = date(year, month + 1, 1) - timedelta(days=1)

    spots_query = db.query(FacilitySpot).filter(FacilitySpot.is_active == True)
    if room:
        spots_query = spots_query.filter(FacilitySpot.room == room)
    if facility_id:
        spots_query = spots_query.filter(FacilitySpot.facility_id == facility_id)
    spots = spots_query.order_by(FacilitySpot.display_order).all()

    bookings = db.query(FacilityBooking).filter(
        FacilityBooking.start_date <= last_day,
        FacilityBooking.end_date >= month_start
    ).all()

    booking_map = {}
    for b in bookings:
        sid = str(b.spot_id)
        if sid not in booking_map:
            booking_map[sid] = []
        booking_map[sid].append(b)

    allocation = []
    for s in spots:
        sid = str(s.id)
        spot_bookings = booking_map.get(sid, [])
        active = spot_bookings[0] if spot_bookings else None
        allocation.append({
            "spot": serialize_spot(s),
            "booking": serialize_booking(active, s) if active else None,
            "booking_count": len(spot_bookings),
        })

    all_rooms = db.query(FacilitySpot.room).filter(FacilitySpot.is_active == True).distinct().all()
    rooms = sorted([r[0] for r in all_rooms])

    return {
        "year": year, "month": month, "allocation": allocation, "rooms": rooms,
        "summary": {
            "total_spots": len(spots),
            "booked": sum(1 for a in allocation if a["booking"]),
            "available": sum(1 for a in allocation if not a["booking"]),
        }
    }

@router.get("/yearly-summary")
async def get_yearly_summary(
    year: int = Query(...),
    room: Optional[str] = None,
    facility_id: Optional[str] = None,
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user)
):
    """Get a summary of all spots and their booking status for all 12 months of a given year."""
    seed_facility_data(db)

    # Get spots
    spots_query = db.query(FacilitySpot).filter(FacilitySpot.is_active == True)
    if room:
        spots_query = spots_query.filter(FacilitySpot.room == room)
    if facility_id:
        spots_query = spots_query.filter(FacilitySpot.facility_id == facility_id)
    spots = spots_query.order_by(FacilitySpot.display_order).all()

    # Get bookings overlapping with the year
    year_start = date(year, 1, 1)
    year_end = date(year, 12, 31)

    bookings = db.query(FacilityBooking).filter(
        FacilityBooking.start_date <= year_end,
        FacilityBooking.end_date >= year_start
    ).all()

    booking_map = {}
    for b in bookings:
        sid = str(b.spot_id)
        if sid not in booking_map:
            booking_map[sid] = []
        booking_map[sid].append(b)

    summary = []
    for s in spots:
        sid = str(s.id)
        spot_bookings = booking_map.get(sid, [])
        
        months_data = []
        for m in range(1, 13):
            month_start = date(year, m, 1)
            if m == 12:
                last_day = date(year, 12, 31)
            else:
                last_day = date(year, m + 1, 1) - timedelta(days=1)
                
            # Check if any booking overlaps with this month
            active_b = None
            for b in spot_bookings:
                if b.start_date <= last_day and b.end_date >= month_start:
                    active_b = b
                    break
                    
            if active_b:
                months_data.append({"month": m, "booked": True, "user_name": active_b.user_name})
            else:
                months_data.append({"month": m, "booked": False, "user_name": None})
                
        summary.append({
            "spot": {"id": sid, "name": s.name, "room": s.room},
            "months": months_data
        })

    all_rooms = db.query(FacilitySpot.room).filter(FacilitySpot.is_active == True).distinct().all()
    rooms = sorted([r[0] for r in all_rooms])

    return {
        "year": year,
        "summary": summary,
        "rooms": rooms
    }

@router.get("/bookings")
async def get_bookings(
    spot_id: Optional[str] = None, facility_id: Optional[str] = None, year: Optional[int] = None, month: Optional[int] = None,
    db: Session = Depends(get_db), current_user: dict = Depends(get_current_user)
):
    seed_facility_data(db)
    query = db.query(FacilityBooking, FacilitySpot).join(FacilitySpot, FacilityBooking.spot_id == FacilitySpot.id)
    if spot_id:
        query = query.filter(FacilityBooking.spot_id == spot_id)
    if facility_id:
        query = query.filter(FacilitySpot.facility_id == facility_id)
    if year and month:
        month_start = date(year, month, 1)
        last_day = date(year, 12, 31) if month == 12 else date(year, month + 1, 1) - timedelta(days=1)
        query = query.filter(FacilityBooking.start_date <= last_day, FacilityBooking.end_date >= month_start)
    results = query.order_by(FacilityBooking.start_date).all()
    return [serialize_booking(b, s) for b, s in results]


# ── Check availability + suggest alternatives ────────────────────────────────

@router.post("/check-availability")
async def check_availability(
    payload: AvailabilityCheck,
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user)
):
    """Check if a spot is available and suggest alternatives if not."""
    spot = db.query(FacilitySpot).filter(FacilitySpot.id == payload.spot_id).first()
    if not spot:
        raise HTTPException(status_code=404, detail="Spot not found")

    try:
        start = date.fromisoformat(payload.start_date)
        end = date.fromisoformat(payload.end_date)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid date format.")

    overlap = check_booking_overlap(db, spot.id, start, end)

    if not overlap:
        return {"available": True, "spot_name": spot.name, "alternatives": []}

    # Not available — find alternatives in same category
    alternatives = find_available_alternatives(db, spot.id, spot.category, start, end, spot.facility_id)
    return {
        "available": False,
        "spot_name": spot.name,
        "conflict": {
            "user_name": overlap.user_name,
            "start_date": overlap.start_date.isoformat(),
            "end_date": overlap.end_date.isoformat(),
        },
        "alternatives": alternatives,
    }


@router.post("/bookings")
async def create_booking(
    payload: BookingCreate, db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user)
):
    spot = db.query(FacilitySpot).filter(FacilitySpot.id == payload.spot_id).first()
    if not spot:
        raise HTTPException(status_code=404, detail="Spot not found")
    try:
        start = date.fromisoformat(payload.start_date)
        end = date.fromisoformat(payload.end_date)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid date format. Use YYYY-MM-DD.")
    if end < start:
        raise HTTPException(status_code=400, detail="End date must be after start date.")

    overlap = check_booking_overlap(db, spot.id, start, end)
    if overlap:
        # Find alternatives
        alternatives = find_available_alternatives(db, spot.id, spot.category, start, end, spot.facility_id)
        alt_names = ", ".join([a["name"] for a in alternatives[:5]]) if alternatives else "None"
        raise HTTPException(
            status_code=409,
            detail=f"Booking conflict: {spot.name} is booked by {overlap.user_name} ({overlap.start_date} to {overlap.end_date}). Available alternatives: {alt_names}"
        )

    booking = FacilityBooking(
        spot_id=spot.id, user_name=payload.user_name, species=payload.species or "",
        start_date=start, end_date=end, comment=payload.comment or "",
        created_by_name=current_user.get("name", current_user.get("email", "unknown"))
    )
    db.add(booking)
    db.commit()
    db.refresh(booking)
    return serialize_booking(booking, spot)


@router.put("/bookings/{booking_id}")
async def update_booking(
    booking_id: str, payload: BookingUpdate,
    db: Session = Depends(get_db), current_user: dict = Depends(get_current_user)
):
    booking = db.query(FacilityBooking).filter(FacilityBooking.id == booking_id).first()
    if not booking:
        raise HTTPException(status_code=404, detail="Booking not found")

    if payload.user_name is not None: booking.user_name = payload.user_name
    if payload.species is not None: booking.species = payload.species
    if payload.comment is not None: booking.comment = payload.comment

    new_start, new_end = booking.start_date, booking.end_date
    if payload.start_date is not None:
        new_start = date.fromisoformat(payload.start_date)
    if payload.end_date is not None:
        new_end = date.fromisoformat(payload.end_date)
    if new_end < new_start:
        raise HTTPException(status_code=400, detail="End date must be after start date.")

    if new_start != booking.start_date or new_end != booking.end_date:
        overlap = check_booking_overlap(db, booking.spot_id, new_start, new_end, exclude_booking_id=booking.id)
        if overlap:
            raise HTTPException(status_code=409, detail=f"Conflict: booked by {overlap.user_name} ({overlap.start_date} to {overlap.end_date}).")
        booking.start_date = new_start
        booking.end_date = new_end

    db.commit()
    db.refresh(booking)
    spot = db.query(FacilitySpot).filter(FacilitySpot.id == booking.spot_id).first()
    return serialize_booking(booking, spot)


@router.delete("/bookings/{booking_id}")
async def delete_booking(
    booking_id: str, db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user)
):
    booking = db.query(FacilityBooking).filter(FacilityBooking.id == booking_id).first()
    if not booking:
        raise HTTPException(status_code=404, detail="Booking not found")
    db.delete(booking)
    db.commit()
    return {"message": "Booking deleted successfully"}


@router.get("/bookings/{booking_id}")
async def get_booking(
    booking_id: str, db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user)
):
    result = db.query(FacilityBooking, FacilitySpot).join(
        FacilitySpot, FacilityBooking.spot_id == FacilitySpot.id
    ).filter(FacilityBooking.id == booking_id).first()
    if not result:
        raise HTTPException(status_code=404, detail="Booking not found")
    booking, spot = result
    return serialize_booking(booking, spot)


@router.get("/spots/{spot_id}/bookings")
async def get_spot_bookings(
    spot_id: str, db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user)
):
    spot = db.query(FacilitySpot).filter(FacilitySpot.id == spot_id).first()
    if not spot:
        raise HTTPException(status_code=404, detail="Spot not found")
    bookings = db.query(FacilityBooking).filter(
        FacilityBooking.spot_id == spot_id
    ).order_by(FacilityBooking.start_date).all()
    return {"spot": {"id": str(spot.id), "name": spot.name, "room": spot.room},
            "bookings": [serialize_booking(b, spot) for b in bookings]}
