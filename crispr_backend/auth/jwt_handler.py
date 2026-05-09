"""
JWT token verification for Supabase Auth tokens.
Validates the access_token sent from the Angular frontend.
"""
import jwt
from jwt.exceptions import ExpiredSignatureError, InvalidTokenError
from fastapi import HTTPException, status
from auth.supabase_client import get_supabase_jwt_secret
from auth.models import TokenPayload


def verify_supabase_token(token: str) -> TokenPayload:
    """
    Validate a Supabase JWT access token using the Supabase Auth server.
    This handles all signing algorithms (HS256, ES256, etc.) automatically.

    Args:
        token: The raw JWT string from the Authorization header.

    Returns:
        TokenPayload with sub (user id) and email.

    Raises:
        HTTPException 401 on any validation failure.
    """
    try:
        from auth.supabase_client import get_supabase_admin
        sb = get_supabase_admin()
        
        # Verify token with Supabase Auth server
        response = sb.auth.get_user(token)
        
        if response.user is None:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid or expired token",
            )
            
        user = response.user
        return TokenPayload(
            sub=user.id,
            email=user.email or "",
            exp=0, # We don't need exp if the server verified it
            aud=user.aud,
        )
    except Exception as e:
        print(f"[DEBUG] Token verification failed: {e}")
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=f"Token verification failed: {str(e)}",
        )
