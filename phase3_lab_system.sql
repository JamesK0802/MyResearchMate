-- 1. Lab Registration Requests Table
CREATE TABLE IF NOT EXISTS lab_registration_requests (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    lab_name TEXT NOT NULL,
    lab_leader_name TEXT,
    lab_leader_email TEXT NOT NULL,
    lab_leader_uid TEXT NOT NULL,
    members_json JSONB DEFAULT '[]'::jsonb,
    status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
    requested_by INTEGER REFERENCES users(id),
    approved_by INTEGER REFERENCES users(id),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 2. Labs Table
CREATE TABLE IF NOT EXISTS labs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    lab_name TEXT NOT NULL,
    lab_leader_user_id INTEGER REFERENCES users(id),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 3. Lab Members Table
CREATE TABLE IF NOT EXISTS lab_members (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    lab_id UUID REFERENCES labs(id) ON DELETE CASCADE,
    user_id INTEGER REFERENCES users(id),
    uid TEXT,
    name TEXT,
    email TEXT,
    role_in_lab TEXT DEFAULT 'member' CHECK (role_in_lab IN ('leader', 'member')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE lab_registration_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE labs ENABLE ROW LEVEL SECURITY;
ALTER TABLE lab_members ENABLE ROW LEVEL SECURITY;

-- Policies for lab_registration_requests
DROP POLICY IF EXISTS "Users can view own requests" ON lab_registration_requests;
CREATE POLICY "Users can view own requests" ON lab_registration_requests
    FOR SELECT USING (auth.uid() IN (SELECT supabase_auth_id FROM users WHERE id = requested_by));

DROP POLICY IF EXISTS "Users can insert own requests" ON lab_registration_requests;
CREATE POLICY "Users can insert own requests" ON lab_registration_requests
    FOR INSERT WITH CHECK (auth.uid() IN (SELECT supabase_auth_id FROM users WHERE id = requested_by));

DROP POLICY IF EXISTS "Admins can view all requests" ON lab_registration_requests;
CREATE POLICY "Admins can view all requests" ON lab_registration_requests
    FOR ALL USING (EXISTS (SELECT 1 FROM users WHERE supabase_auth_id = auth.uid() AND role IN ('admin', 'owner')));

-- Policies for labs and members
DROP POLICY IF EXISTS "Members can view their labs" ON labs;
CREATE POLICY "Members can view their labs" ON labs
    FOR SELECT USING (id IN (SELECT lab_id FROM lab_members WHERE user_id IN (SELECT id FROM users WHERE supabase_auth_id = auth.uid())));

DROP POLICY IF EXISTS "Admins have full access to labs" ON labs;
CREATE POLICY "Admins have full access to labs" ON labs FOR ALL USING (EXISTS (SELECT 1 FROM users WHERE supabase_auth_id = auth.uid() AND role IN ('admin', 'owner')));

DROP POLICY IF EXISTS "Lab access for members" ON lab_members;
CREATE POLICY "Lab access for members" ON lab_members FOR SELECT USING (user_id IN (SELECT id FROM users WHERE supabase_auth_id = auth.uid()));

-- Grant permissions to roles
GRANT ALL ON lab_registration_requests TO authenticated;
GRANT ALL ON lab_registration_requests TO service_role;
GRANT ALL ON lab_registration_requests TO postgres;

GRANT ALL ON labs TO authenticated;
GRANT ALL ON labs TO service_role;
GRANT ALL ON labs TO postgres;

GRANT ALL ON lab_members TO authenticated;
GRANT ALL ON lab_members TO service_role;
GRANT ALL ON lab_members TO postgres;
