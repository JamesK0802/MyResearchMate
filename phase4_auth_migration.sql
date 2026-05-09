-- Phase 4: Registration-Required Auth Flow Migration

-- 1. Update users table structure
ALTER TABLE users ADD COLUMN IF NOT EXISTS uid TEXT UNIQUE;
ALTER TABLE users ADD COLUMN IF NOT EXISTS bio TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS profile_completed BOOLEAN DEFAULT FALSE;

-- 2. Add constraints (if not already present)
-- We need to ensure email is unique for auth purposes
DO $$ 
BEGIN 
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'users_email_key') THEN
        ALTER TABLE users ADD CONSTRAINT users_email_key UNIQUE (email);
    END IF;
END $$;

-- 3. Update existing users to mark profile_completed = true
-- Assuming existing users are already "registered"
UPDATE users SET profile_completed = TRUE WHERE profile_completed IS FALSE;

-- 4. Set UID for existing users if missing (derive from email)
UPDATE users 
SET uid = split_part(email, '@', 1) 
WHERE uid IS NULL;

-- 5. Make UID and Name mandatory for completed profiles
-- (We'll enforce this via app logic, but let's ensure UID is not null for future inserts)
ALTER TABLE users ALTER COLUMN uid SET NOT NULL;

-- 6. Enable RLS and add policies
ALTER TABLE users ENABLE ROW LEVEL SECURITY;

-- Policy: Allow users to view their own profile
DROP POLICY IF EXISTS "Users can view own profile" ON users;
CREATE POLICY "Users can view own profile" ON users 
    FOR SELECT 
    USING (auth.uid() = supabase_auth_id);

-- Policy: Allow users to update their own profile
DROP POLICY IF EXISTS "Users can update own profile" ON users;
CREATE POLICY "Users can update own profile" ON users 
    FOR UPDATE 
    USING (auth.uid() = supabase_auth_id);

-- 7. Grant access to service_role and authenticated role
GRANT ALL ON users TO service_role;
GRANT SELECT, UPDATE ON users TO authenticated;
GRANT ALL ON users TO postgres;
