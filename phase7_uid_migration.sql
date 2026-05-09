-- Phase 7: UID-Based Lab Membership Migration
-- 
-- Problem: lab_members currently links via user_id (internal auto-increment).
-- If a team member hasn't registered yet, user_id is NULL and they can't be found.
-- 
-- Solution: Use uid (university ID like u6646386) as the primary link.
-- The uid is always known at registration time, even before the user signs up.
--
-- Run this in Supabase SQL Editor.

-- Step 1: Ensure uid column exists and has an index on lab_members
-- (uid column already exists from lab creation, but let's ensure index)
CREATE INDEX IF NOT EXISTS idx_lab_members_uid ON lab_members(uid);

-- Step 2: Add lab_leader_uid column to labs table (if not exists)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                 WHERE table_name='labs' AND column_name='lab_leader_uid') THEN
    ALTER TABLE labs ADD COLUMN lab_leader_uid TEXT;
  END IF;
END $$;

-- Step 3: Backfill lab_leader_uid from lab_members where role = 'leader'
UPDATE labs l
SET lab_leader_uid = lm.uid
FROM lab_members lm
WHERE lm.lab_id = l.id 
  AND lm.role_in_lab = 'leader'
  AND l.lab_leader_uid IS NULL
  AND lm.uid IS NOT NULL;

-- Step 4: Make user_id nullable on lab_members (if not already)
ALTER TABLE lab_members ALTER COLUMN user_id DROP NOT NULL;

-- Step 5: Index on labs.lab_leader_uid
CREATE INDEX IF NOT EXISTS idx_labs_leader_uid ON labs(lab_leader_uid);

-- Step 6: Also update lab_join_requests to use uid  
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                 WHERE table_name='lab_join_requests' AND column_name='uid') THEN
    ALTER TABLE lab_join_requests ADD COLUMN uid TEXT;
  END IF;
END $$;

-- Backfill uid in lab_join_requests from users table
UPDATE lab_join_requests ljr
SET uid = u.uid
FROM users u
WHERE ljr.user_id = u.id
  AND ljr.uid IS NULL;
