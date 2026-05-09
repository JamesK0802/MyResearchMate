-- Lab 정보를 확장하기 위한 마이그레이션
ALTER TABLE lab_registration_requests ADD COLUMN IF NOT EXISTS lab_tagline TEXT;
ALTER TABLE lab_registration_requests ADD COLUMN IF NOT EXISTS lab_description TEXT;

ALTER TABLE labs ADD COLUMN IF NOT EXISTS lab_tagline TEXT;
ALTER TABLE labs ADD COLUMN IF NOT EXISTS lab_description TEXT;
