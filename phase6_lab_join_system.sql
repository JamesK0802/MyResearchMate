-- Lab 참여 신청을 위한 테이블
CREATE TABLE IF NOT EXISTS lab_join_requests (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    lab_id UUID REFERENCES labs(id) ON DELETE CASCADE,
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    status TEXT DEFAULT 'pending', -- pending, approved, rejected
    message TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(lab_id, user_id) -- 중복 신청 방지
);

-- RLS 정책 설정 (간단하게)
ALTER TABLE lab_join_requests ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can see their own join requests" ON lab_join_requests FOR SELECT USING (auth.uid()::text = (SELECT uid FROM users WHERE id = user_id));
CREATE POLICY "Users can create join requests" ON lab_join_requests FOR INSERT WITH CHECK (true);
