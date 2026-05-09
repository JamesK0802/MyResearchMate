"""
Supabase client initialization for the FastAPI backend.
Uses the service_role key for admin-level database operations.
"""
import os
from functools import lru_cache
from dotenv import load_dotenv
from supabase import create_client, Client

load_dotenv()


def get_supabase_url() -> str:
    url = os.getenv("SUPABASE_URL")
    if not url:
        raise RuntimeError("SUPABASE_URL is not set in environment variables")
    return url


def get_supabase_service_key() -> str:
    key = os.getenv("SUPABASE_SERVICE_ROLE_KEY")
    if not key:
        raise RuntimeError("SUPABASE_SERVICE_ROLE_KEY is not set in environment variables")
    return key


def get_supabase_jwt_secret() -> str:
    secret = os.getenv("SUPABASE_JWT_SECRET")
    if not secret:
        raise RuntimeError("SUPABASE_JWT_SECRET is not set in environment variables")
    return secret


@lru_cache()
def get_supabase_admin() -> Client:
    """
    Returns a Supabase client with service_role privileges.
    Used for admin operations like creating/updating users in the DB.
    Cached so only one instance is created per process.
    """
    return create_client(get_supabase_url(), get_supabase_service_key())


def get_allowed_domain() -> str:
    return os.getenv("ALLOWED_EMAIL_DOMAIN", "anu.edu.au")


def get_owner_email() -> str:
    return os.getenv("OWNER_EMAIL", "")
