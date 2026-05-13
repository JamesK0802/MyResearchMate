-- ============================================================
-- Supabase SQL Migration: Users Table
-- Run this in the Supabase SQL Editor (Dashboard → SQL Editor)
-- ============================================================

-- 1. Create the users table
CREATE TABLE IF NOT EXISTS public.users (
    id BIGSERIAL PRIMARY KEY,
    supabase_auth_id UUID NOT NULL UNIQUE,
    email TEXT NOT NULL UNIQUE,
    name TEXT,
    role TEXT NOT NULL DEFAULT 'user' CHECK (role IN ('owner', 'admin', 'user')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_login TIMESTAMPTZ
);

-- 2. Create indexes for fast lookups
CREATE INDEX IF NOT EXISTS idx_users_supabase_auth_id ON public.users (supabase_auth_id);
CREATE INDEX IF NOT EXISTS idx_users_email ON public.users (email);
CREATE INDEX IF NOT EXISTS idx_users_role ON public.users (role);

-- 3. Enable Row Level Security (RLS)
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;

-- 4. RLS Policies
-- Service role can do everything (bypasses RLS by default)
-- Authenticated users can read their own record
CREATE POLICY "Users can view own profile"
    ON public.users
    FOR SELECT
    USING (auth.uid() = supabase_auth_id);

-- Authenticated users can update their own name
CREATE POLICY "Users can update own name"
    ON public.users
    FOR UPDATE
    USING (auth.uid() = supabase_auth_id)
    WITH CHECK (auth.uid() = supabase_auth_id);

-- 5. Grant access to authenticated role
GRANT SELECT, UPDATE ON public.users TO authenticated;
GRANT USAGE, SELECT ON SEQUENCE users_id_seq TO authenticated;

-- 6. Grant full access to service_role (used by FastAPI backend)
GRANT ALL ON public.users TO service_role;
GRANT USAGE, SELECT ON SEQUENCE users_id_seq TO service_role;

-- ============================================================
-- NOTE: After running this migration, configure Google OAuth
-- in the Supabase Dashboard:
--   Authentication → Providers → Google → Enable
--   Set your Google OAuth Client ID and Secret
-- ============================================================
