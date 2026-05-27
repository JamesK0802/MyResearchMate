import uuid
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import Column, String, Boolean, DateTime, text
from sqlalchemy.sql import func
from sqlalchemy.orm import Session
from database.db import Base, engine, get_db
from auth.dependencies import get_current_user

import multiprocessing

# ── Dynamic Reset for Gimmick schema updates ──
if multiprocessing.current_process().name == 'MainProcess':
    try:
        with engine.begin() as conn:
            conn.execute(text("DROP TABLE IF EXISTS nicole_gimmick_bookings CASCADE"))
    except Exception as e:
        print(f"[NICOLE] Old table drop failed or not needed: {e}")

# ── Isolated Gimmick DB Tables ──
class NicoleAccess(Base):
    __tablename__ = "nicole_access"
    uid = Column(String, primary_key=True, index=True)
    has_access = Column(Boolean, default=True)
    granted_at = Column(DateTime(timezone=True), server_default=func.now())

class NicoleGimmickBooking(Base):
    __tablename__ = "nicole_gimmick_bookings"
    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    booked_by = Column(String, nullable=False)
    session_type = Column(String, nullable=False) # Custom Task name entered by user
    date_str = Column(String, nullable=False)     # YYYY-MM-DD
    start_time = Column(String, nullable=False)   # HH:MM (e.g. 09:15)
    end_time = Column(String, nullable=False)     # HH:MM (e.g. 09:45)
    comment = Column(String, nullable=True)
    reaction = Column(String, nullable=True)

if multiprocessing.current_process().name == 'MainProcess':
    # Re-create table structures
    Base.metadata.create_all(bind=engine)

router = APIRouter(prefix="/nicole-gimmick", tags=["nicole-gimmick"])

@router.get("/check-access")
async def check_access(current_user: dict = Depends(get_current_user), db: Session = Depends(get_db)):
    uid = current_user.get("uid")
    if not uid:
        return {"has_access": False}
    if uid == "u6646386":
        return {"has_access": True}
    access = db.query(NicoleAccess).filter(NicoleAccess.uid == uid).first()
    return {"has_access": access is not None and access.has_access}

@router.get("/list-access")
async def list_access(current_user: dict = Depends(get_current_user), db: Session = Depends(get_db)):
    if current_user.get("role") not in ["owner", "admin"]:
        raise HTTPException(status_code=403, detail="Owner privileges required")
    access_list = db.query(NicoleAccess).all()
    return {a.uid: a.has_access for a in access_list}

@router.post("/grant/{uid}")
async def grant_access(uid: str, current_user: dict = Depends(get_current_user), db: Session = Depends(get_db)):
    if current_user.get("role") not in ["owner", "admin"]:
        raise HTTPException(status_code=403, detail="Owner privileges required")
    access = db.query(NicoleAccess).filter(NicoleAccess.uid == uid).first()
    if not access:
        access = NicoleAccess(uid=uid, has_access=True)
        db.add(access)
    else:
        access.has_access = True
    db.commit()
    return {"status": "success", "uid": uid, "has_access": True}

@router.post("/revoke/{uid}")
async def revoke_access(uid: str, current_user: dict = Depends(get_current_user), db: Session = Depends(get_db)):
    if current_user.get("role") not in ["owner", "admin"]:
        raise HTTPException(status_code=403, detail="Owner privileges required")
    access = db.query(NicoleAccess).filter(NicoleAccess.uid == uid).first()
    if access:
        db.delete(access)
        db.commit()
    return {"status": "success", "uid": uid, "has_access": False}

@router.get("/bookings")
async def get_bookings(date: str = None, current_user: dict = Depends(get_current_user), db: Session = Depends(get_db)):
    # Verify access
    uid = current_user.get("uid")
    has_access = uid == "u6646386"
    if not has_access:
        access = db.query(NicoleAccess).filter(NicoleAccess.uid == uid).first()
        has_access = access is not None and access.has_access
    if not has_access:
        raise HTTPException(status_code=403, detail="Access denied")
        
    query = db.query(NicoleGimmickBooking)
    if date:
        query = query.filter(NicoleGimmickBooking.date_str == date)
    bookings = query.all()
    
    # Seed default joke bookings if database is empty
    if not bookings and not date:
        today_str = func.current_date().cast(String) # fallback
        import datetime
        t_str = datetime.date.today().isoformat()
        
        default_bookings = [
            NicoleGimmickBooking(
                booked_by="Nicole's Coffee Maker",
                session_type="Espresso Fuel Injecting ☕",
                date_str=t_str,
                start_time="09:00",
                end_time="09:30",
                comment="Automated routine espresso filter cleaning",
                reaction="Nicole accepted immediately. Status: HIGHLY FUELLED."
            ),
            NicoleGimmickBooking(
                booked_by="u6646386",
                session_type="CRISPR Multiplex Argument 🧬",
                date_str=t_str,
                start_time="11:30",
                end_time="12:30",
                comment="Debating Phred quality scores and guide rescues",
                reaction="Nicole approved: 'Bring actual cluster charts or don't bother.'"
            ),
            NicoleGimmickBooking(
                booked_by="James",
                session_type="Union Court Lunch Curry Run 🍛",
                date_str=t_str,
                start_time="13:00",
                end_time="14:00",
                comment="Spicy Indian curry discussion",
                reaction="Nicole said: 'Only if we go to the extra hot place!'"
            )
        ]
        for b in default_bookings:
            db.add(b)
        db.commit()
        
        if date:
            bookings = db.query(NicoleGimmickBooking).filter(NicoleGimmickBooking.date_str == date).all()
        else:
            bookings = db.query(NicoleGimmickBooking).all()
        
    return bookings

@router.post("/bookings")
async def create_booking(payload: dict, current_user: dict = Depends(get_current_user), db: Session = Depends(get_db)):
    uid = current_user.get("uid")
    has_access = uid == "u6646386"
    if not has_access:
        access = db.query(NicoleAccess).filter(NicoleAccess.uid == uid).first()
        has_access = access is not None and access.has_access
    if not has_access:
        raise HTTPException(status_code=403, detail="Access denied")
        
    st = payload.get("session_type", "Lab Sync")
    date_str = payload.get("date_str")
    start = payload.get("start_time")
    end = payload.get("end_time")
    
    if not date_str or not start or not end:
        raise HTTPException(status_code=400, detail="Missing date or time boundaries")
        
    # Check for overlap in the 15-minute slot for this date
    overlap = db.query(NicoleGimmickBooking).filter(
        NicoleGimmickBooking.date_str == date_str,
        NicoleGimmickBooking.start_time < end,
        NicoleGimmickBooking.end_time > start
    ).first()
    
    if overlap:
        raise HTTPException(status_code=400, detail=f"Overlap conflict: Nicole is already booked by {overlap.booked_by} for '{overlap.session_type}' ({overlap.start_time} - {overlap.end_time})")
        
    # Cute random science responses generator
    import random
    jokes = [
        "Nicole approved: 'Ensure your samples are on ice before you arrive.'",
        "Nicole accepted: 'Only if I can play my synth-wave playlist on the lab speakers.'",
        "Nicole says: 'Fine, but you better buy the extra large coffee.'",
        "Nicole agreed: 'Let's review the gel electrophoresis charts together.'",
        "Nicole says: 'Approved. Double espresso or don't talk to me!'"
    ]
    rx = random.choice(jokes)
    
    new_b = NicoleGimmickBooking(
        booked_by=current_user.get("name", "Researcher"),
        session_type=st,
        date_str=date_str,
        start_time=start,
        end_time=end,
        comment=payload.get("comment", ""),
        reaction=rx
    )
    db.add(new_b)
    db.commit()
    return new_b
