-- Phase 5: Lab-based CRISPR Result Sharing Migration

-- 0. Clean up ALL potentially dependent policies first
-- Across both tables that reference each other in their RLS logic
DROP POLICY IF EXISTS "Owners can manage result shares" ON crispr_result_shares;
DROP POLICY IF EXISTS "Lab members can view shares" ON crispr_result_shares;
DROP POLICY IF EXISTS "Users can view shared results" ON crispr_results;
DROP POLICY IF EXISTS "Users can view their own results" ON crispr_results;
DROP POLICY IF EXISTS "Users can insert their own results" ON crispr_results;
DROP POLICY IF EXISTS "Users can update their own results" ON crispr_results;
DROP POLICY IF EXISTS "Users can delete their own results" ON crispr_results;
DROP POLICY IF EXISTS "Users can manage their own results" ON crispr_results;

-- 0.1 Update existing results table to use BIGINT for owner_user_id
-- Now that policies are gone, this should succeed
ALTER TABLE crispr_results 
  ALTER COLUMN owner_user_id TYPE BIGINT USING owner_user_id::text::bigint;

-- 1. Create result shares table (if not exists)
CREATE TABLE IF NOT EXISTS crispr_result_shares (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    result_id UUID NOT NULL REFERENCES crispr_results(id) ON DELETE CASCADE,
    lab_id UUID NOT NULL REFERENCES labs(id) ON DELETE CASCADE,
    shared_by_user_id BIGINT NOT NULL REFERENCES users(id),
    created_at TIMESTAMPTZ DEFAULT now(),
    UNIQUE(result_id, lab_id)
);

-- 2. Enable RLS
ALTER TABLE crispr_result_shares ENABLE ROW LEVEL SECURITY;
ALTER TABLE crispr_results ENABLE ROW LEVEL SECURITY;

-- 3. Recreate Policies for crispr_results
CREATE POLICY "Users can manage their own results" ON crispr_results
    FOR ALL
    USING (
        owner_user_id = (SELECT id FROM users WHERE supabase_auth_id = auth.uid())
    );

CREATE POLICY "Users can view shared results" ON crispr_results
    FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM crispr_result_shares
            JOIN lab_members ON crispr_result_shares.lab_id = lab_members.lab_id
            WHERE crispr_result_shares.result_id = crispr_results.id
            AND lab_members.user_id = (SELECT id FROM users WHERE supabase_auth_id = auth.uid())
        )
    );

-- 4. Recreate Policies for crispr_result_shares
CREATE POLICY "Owners can manage result shares" ON crispr_result_shares
    FOR ALL
    USING (
        EXISTS (
            SELECT 1 FROM crispr_results
            WHERE crispr_results.id = crispr_result_shares.result_id
            AND crispr_results.owner_user_id = (SELECT id FROM users WHERE supabase_auth_id = auth.uid())
        )
    );

CREATE POLICY "Lab members can view shares" ON crispr_result_shares
    FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM lab_members
            WHERE lab_members.lab_id = crispr_result_shares.lab_id
            AND lab_members.user_id = (SELECT id FROM users WHERE supabase_auth_id = auth.uid())
        )
    );

-- 5. Grant permissions
GRANT ALL ON crispr_result_shares TO service_role;
GRANT SELECT, INSERT, DELETE ON crispr_result_shares TO authenticated;
GRANT ALL ON crispr_result_shares TO postgres;

GRANT SELECT, INSERT, UPDATE, DELETE ON crispr_results TO authenticated;
GRANT ALL ON crispr_results TO service_role;
