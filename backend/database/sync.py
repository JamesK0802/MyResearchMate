from sqlalchemy.orm import Session
from .models import User
from uuid import UUID
import traceback

def sync_user_to_local(db: Session, supabase_auth_id: str, email: str, name: str, role: str = "user") -> User:
    try:
        print(f"[SYNC] Attempting to sync user: {email}")
        auth_uuid = UUID(supabase_auth_id)
        
        # 1. Lookup by auth_id
        local_user = db.query(User).filter(User.auth_id == auth_uuid).first()
        
        derived_uid = email.split("@")[0]
        
        # Automatic Owner promotion for the primary researcher
        final_role = role
        if email.lower() == "u6646386@anu.edu.au":
            final_role = "owner"
            print(f"[SYNC] System Owner detected: {email}")
        
        if not local_user:
            print(f"[SYNC] Creating new record for {email} as {final_role}")
            local_user = User(
                auth_id=auth_uuid,
                uid=derived_uid,
                email=email.lower(),
                name=name,
                role=final_role
            )
            db.add(local_user)
            db.commit()
            db.refresh(local_user)
        else:
            # Update existing user role if they should be owner
            if email.lower() == "u6646386@anu.edu.au" and local_user.role != "owner":
                local_user.role = "owner"
                db.commit()
                db.refresh(local_user)
                print(f"[SYNC] Updated {email} to Owner role.")
                
        return local_user
    except Exception as e:
        print(f"[SYNC] ERROR: Failed to sync user {email}")
        traceback.print_exc()
        db.rollback()
        raise e
