-- MyResearchMate Database Schema
-- Standard PostgreSQL Schema for CRISPR Analysis Platform

-- 1. Users Table (Core Identity)
CREATE TABLE IF NOT EXISTS users (
    id BIGSERIAL PRIMARY KEY,
    uid UUID UNIQUE NOT NULL, -- Links to Supabase Auth UID
    email TEXT UNIQUE NOT NULL,
    name TEXT,
    role TEXT DEFAULT 'user', -- 'user', 'admin', 'owner'
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Labs Table (Research Groups)
CREATE TABLE IF NOT EXISTS labs (
    id BIGSERIAL PRIMARY KEY,
    lab_name TEXT UNIQUE NOT NULL,
    description TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. Lab Members Table (Relationship)
CREATE TABLE IF NOT EXISTS lab_members (
    id BIGSERIAL PRIMARY KEY,
    lab_id BIGINT REFERENCES labs(id) ON DELETE CASCADE,
    uid UUID REFERENCES users(uid) ON DELETE CASCADE,
    role TEXT DEFAULT 'member', -- 'member', 'admin'
    joined_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(lab_id, uid)
);

-- 4. CRISPR Results Table (Core Data)
CREATE TABLE IF NOT EXISTS crispr_results (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    owner_user_id BIGINT REFERENCES users(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    metadata_json JSONB DEFAULT '{}'::jsonb,
    result_json JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 5. Result Shares Table (Collaboration)
CREATE TABLE IF NOT EXISTS crispr_result_shares (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    result_id UUID REFERENCES crispr_results(id) ON DELETE CASCADE,
    lab_id BIGINT REFERENCES labs(id) ON DELETE CASCADE,
    shared_by_user_id BIGINT REFERENCES users(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(result_id, lab_id)
);

-- 6. PCR Presets Table (Utility)
CREATE TABLE IF NOT EXISTS pcr_presets (
    id BIGSERIAL PRIMARY KEY,
    owner_user_id BIGINT REFERENCES users(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    primer_f TEXT NOT NULL,
    primer_r TEXT NOT NULL,
    product_size INTEGER,
    is_public BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indices for performance
CREATE INDEX IF NOT EXISTS idx_crispr_results_owner ON crispr_results(owner_user_id);
CREATE INDEX IF NOT EXISTS idx_lab_members_uid ON lab_members(uid);
CREATE INDEX IF NOT EXISTS idx_result_shares_result ON crispr_result_shares(result_id);
CREATE INDEX IF NOT EXISTS idx_result_shares_lab ON crispr_result_shares(lab_id);
