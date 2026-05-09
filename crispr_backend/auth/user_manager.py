"""
User management operations using Supabase PostgreSQL.
Handles user creation, retrieval, and role assignment.
"""
from datetime import datetime, timezone
from typing import Optional
from auth.supabase_client import get_supabase_admin, get_owner_email, get_allowed_domain
from auth.models import UserRole


def validate_email_domain(email: str) -> bool:
    """Check if email belongs to the allowed domain."""
    allowed = get_allowed_domain()
    return email.lower().endswith(f"@{allowed}")


def get_user_by_auth_id(supabase_auth_id: str) -> Optional[dict]:
    """Fetch a user by their Supabase Auth ID."""
    sb = get_supabase_admin()
    result = sb.table("users").select("*").eq("supabase_auth_id", supabase_auth_id).execute()
    if result.data and len(result.data) > 0:
        return result.data[0]
    return None


def get_user_by_email(email: str) -> Optional[dict]:
    """Fetch a user by email address."""
    sb = get_supabase_admin()
    result = sb.table("users").select("*").eq("email", email.lower()).execute()
    if result.data and len(result.data) > 0:
        return result.data[0]
    return None


def create_user(supabase_auth_id: str, email: str, name: str, bio: Optional[str] = None) -> dict:
    """
    Create or update a user profile in the database.
    UID is derived from email server-side.
    Uses upsert to handle cases where a partial record might already exist.
    """
    owner_email = get_owner_email()
    role = UserRole.OWNER.value if email.lower() == owner_email.lower() and owner_email else UserRole.USER.value

    # Derive UID from email (e.g. u1234567)
    uid = email.split("@")[0]

    sb = get_supabase_admin()
    now = datetime.now(timezone.utc).isoformat()

    user_data = {
        "supabase_auth_id": supabase_auth_id,
        "email": email.lower(),
        "uid": uid,
        "name": name,
        "bio": bio,
        "role": role,
        "profile_completed": True,
        "created_at": now,
        "last_login": now,
    }

    # Use upsert (on supabase_auth_id)
    result = sb.table("users").upsert(
        user_data, 
        on_conflict="supabase_auth_id"
    ).execute()
    
    if result.data and len(result.data) > 0:
        new_user = result.data[0]
        # Sync with lab_members table
        sync_lab_membership(new_user)
        return new_user
    raise RuntimeError(f"Failed to create/update user: {email}")


def sync_lab_membership(user: dict) -> None:
    """
    Sync user's profile with lab_members table.
    Fills in user_id, name, and email for all labs they are already a part of (via uid).
    """
    uid = user.get("uid")
    if not uid:
        return
        
    sb = get_supabase_admin()
    print(f"[Sync] Attempting to sync lab membership for {uid} (ID: {user['id']})")
    
    # Update lab_members records that match this uid but have NULL user_id
    update_data = {
        "user_id": user["id"],
        "name": user["name"],
        "email": user["email"]
    }
    
    try:
        result = sb.table("lab_members").update(update_data).eq("uid", uid).execute()
        print(f"[Sync] Success: Updated {len(result.data)} membership records for {uid}")
    except Exception as e:
        print(f"[Sync] ERROR: Failed to update lab_members for {uid}")
        print(f"[Sync] Details: {str(e)}")


def update_last_login(supabase_auth_id: str) -> None:
    """Update the last_login timestamp for a user."""
    sb = get_supabase_admin()
    now = datetime.now(timezone.utc).isoformat()
    sb.table("users").update({"last_login": now}).eq("supabase_auth_id", supabase_auth_id).execute()


def get_current_user_profile(supabase_auth_id: str) -> Optional[dict]:
    """
    Retrieve existing user profile.
    Updates last_login if found.
    """
    user = get_user_by_auth_id(supabase_auth_id)
    if user:
        update_last_login(supabase_auth_id)
        return user
    return None


def update_user_name(supabase_auth_id: str, name: str) -> dict:
    """Update a user's display name."""
    sb = get_supabase_admin()
    result = sb.table("users").update({"name": name}).eq("supabase_auth_id", supabase_auth_id).execute()
    if result.data and len(result.data) > 0:
        user = result.data[0]
        sync_lab_membership(user)
        return user
    raise RuntimeError("Failed to update user name")


def update_user_bio(supabase_auth_id: str, bio: str) -> dict:
    """Update a user's bio."""
    sb = get_supabase_admin()
    result = sb.table("users").update({"bio": bio}).eq("supabase_auth_id", supabase_auth_id).execute()
    if result.data and len(result.data) > 0:
        return result.data[0]
    raise RuntimeError("Failed to update user bio")


def update_user_role(uid: str, new_role: str) -> dict:
    """Update a user's role by their uid (admin operation)."""
    sb = get_supabase_admin()
    print(f"[RoleUpdate] Updating uid={uid} to role={new_role}")
    
    result = sb.table("users").update({"role": new_role}).eq("uid", uid).execute()
    print(f"[RoleUpdate] Result: {result.data}")
    
    if result.data and len(result.data) > 0:
        return result.data[0]
    raise RuntimeError(f"Failed to update user role for uid: {uid}")
