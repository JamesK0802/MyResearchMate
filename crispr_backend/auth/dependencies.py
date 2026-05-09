"""
FastAPI dependencies for authentication.
Inject these into route handlers to require authentication.
"""
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from auth.jwt_handler import verify_supabase_token
from auth.models import TokenPayload, UserRole
from auth.user_manager import get_user_by_auth_id

# Bearer token extractor
bearer_scheme = HTTPBearer(auto_error=False)


async def get_current_user_token(
    credentials: HTTPAuthorizationCredentials = Depends(bearer_scheme),
) -> TokenPayload:
    """
    Extract and validate JWT from Authorization header.
    Returns the decoded token payload.
    """
    if credentials is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Not authenticated",
            headers={"WWW-Authenticate": "Bearer"},
        )
    return verify_supabase_token(credentials.credentials)


async def get_current_user(
    token: TokenPayload = Depends(get_current_user_token),
) -> dict:
    """
    Get the full user record from the database.
    Does NOT create users automatically.
    """
    from auth.user_manager import get_current_user_profile
    user = get_current_user_profile(token.sub)
    if not user:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Profile registration required",
        )
    return user


async def require_admin(
    user: dict = Depends(get_current_user),
) -> dict:
    """Dependency that requires admin or owner role."""
    if user["role"] not in [UserRole.ADMIN.value, UserRole.OWNER.value]:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Admin privileges required",
        )
    return user


async def require_owner(
    user: dict = Depends(get_current_user),
) -> dict:
    """Dependency that requires owner role."""
    if user["role"] != UserRole.OWNER.value:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Owner privileges required",
        )
    return user
