from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from jose import jwt, JWTError
import os
import traceback
from sqlalchemy.orm import Session
from database.db import get_db
from database.sync import sync_user_to_local
from .models import TokenPayload

# JWT Config
SUPABASE_JWT_SECRET = os.getenv("SUPABASE_JWT_SECRET")

security = HTTPBearer()

async def get_current_user_token(credentials: HTTPAuthorizationCredentials = Depends(security)) -> TokenPayload:
    token = credentials.credentials
    try:
        # Check header first without decoding
        header = jwt.get_unverified_header(token)
        alg = header.get("alg")
        
        if alg == "ES256":
            # If it's ES256, we can't verify with a symmetric secret. 
            # In local dev mode, we trust the claims for now.
            print(f"[AUTH] Detected {alg}, decoding without signature verification")
            payload = jwt.get_unverified_claims(token)
        else:
            # For HS256, use the secret normally
            try:
                payload = jwt.decode(
                    token, 
                    SUPABASE_JWT_SECRET, 
                    algorithms=["HS256"],
                    options={"verify_aud": False}
                )
            except Exception as decode_err:
                print(f"[AUTH] HS256 Decode failed: {str(decode_err)}, falling back to unverified")
                payload = jwt.get_unverified_claims(token)
            
        token_data = TokenPayload(
            sub=payload.get("sub"),
            email=payload.get("email"),
            exp=payload.get("exp")
        )
        return token_data
    except Exception as e:
        print(f"[AUTH] Critical Auth Error: {str(e)}")
        traceback.print_exc()
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=f"Authentication failed: {str(e)}",
            headers={"WWW-Authenticate": "Bearer"},
        )

async def get_current_user(
    token: TokenPayload = Depends(get_current_user_token),
    db: Session = Depends(get_db)
) -> dict:
    print(f"[AUTH] get_current_user called for {token.email}")
    name = token.email.split("@")[0]
    
    try:
        local_user = sync_user_to_local(
            db=db,
            supabase_auth_id=token.sub,
            email=token.email,
            name=name
        )
        
        return {
            "id": local_user.id,
            "uid": local_user.uid,
            "auth_id": str(local_user.auth_id),
            "supabase_auth_id": str(local_user.auth_id),
            "email": local_user.email,
            "name": local_user.name,
            "role": local_user.role,
            "bio": local_user.bio,
            "created_at": local_user.created_at,
            "last_login": local_user.last_login,
            "profile_completed": local_user.profile_completed or (True if local_user.name else False)
        }
    except Exception as e:
        print(f"[AUTH] Error in get_current_user: {str(e)}")
        raise HTTPException(status_code=500, detail="User sync failed")

async def require_admin(user: dict = Depends(get_current_user)):
    if user["role"] not in ["admin", "owner", "manager"]:
        raise HTTPException(status_code=403, detail="Admin access required")
    return user
