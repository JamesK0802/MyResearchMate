# CRISPR Analysis Tool: Database & Feature Integration Guide

이 가이드는 새로운 기능을 추가하고 Supabase 데이터베이스와 연결할 때 따라야 할 표준 절차와 주의사항을 정리한 문서입니다.

---

## 1. 데이터베이스 설계 (SQL)

### 1.1 ID 데이터 타입 표준
- **일반 테이블**: `UUID PRIMARY KEY DEFAULT gen_random_uuid()` 사용을 권장합니다.
- **사용자(users) 테이블**: 고유 ID는 `BIGINT` (Identity) 타입입니다.
- **외래 키(FK) 참조**:
  - `users.id`를 참조할 때는 **`BIGINT`**를 사용합니다.
  - `labs.id`나 `crispr_results.id`를 참조할 때는 **`UUID`**를 사용합니다.

### 1.2 마이그레이션 작성 요령
SQL 파일을 작성할 때는 항상 **멱등성(Idempotency)**을 고려해야 합니다.
- `CREATE TABLE IF NOT EXISTS ...` 사용
- 정책 생성 전 반드시 `DROP POLICY IF EXISTS ...` 선언
- 컬럼 타입 변경 시, 해당 컬럼을 참조하는 모든 RLS 정책을 먼저 `DROP` 한 뒤 변경하고 다시 `CREATE` 해야 함 (Postgres 제약 사항)

---

## 2. 보안 및 권한 (RLS & Permissions)

### 2.1 Row Level Security (RLS)
모든 테이블은 RLS를 활성화해야 합니다 (`ALTER TABLE ... ENABLE ROW LEVEL SECURITY;`).

#### 주요 정책 패턴:
- **소유자 전용**: `USING (owner_user_id = (SELECT id FROM users WHERE supabase_auth_id = auth.uid()))`
- **랩 멤버십 기반**: `EXISTS (SELECT 1 FROM lab_members WHERE lab_id = ... AND user_id = (SELECT id FROM users WHERE supabase_auth_id = auth.uid()))`

#### 주의사항:
- `auth.uid()`는 Supabase 인증 시스템의 UUID를 반환합니다.
- 우리 시스템의 내부 정수 ID(`users.id`)와 비교하려면 반드시 `(SELECT id FROM users WHERE supabase_auth_id = auth.uid())` 서브쿼리를 사용하세요.

### 2.2 권한 부여 (Grants)
테이블 생성 후 다음 권한을 반드시 부여해야 백엔드 및 프론트엔드에서 접근 가능합니다.
```sql
GRANT ALL ON [TABLE_NAME] TO service_role; -- 백엔드 관리자 권한
GRANT SELECT, INSERT, UPDATE, DELETE ON [TABLE_NAME] TO authenticated; -- 로그인한 사용자 권한
GRANT ALL ON [TABLE_NAME] TO postgres; -- 시스템 관리 권한
```

---

## 3. 백엔드 통합 (FastAPI)

### 3.1 Pydantic 모델 (`models/`)
- 데이터베이스의 UUID는 `str` 또는 `uuid.UUID`로 매핑합니다.
- 프론트엔드와 주고받는 JSON 구조를 명확히 정의합니다.

### 3.2 라우터 (`routers/`)
- `get_current_user` 디펜던시를 사용하여 현재 로그인한 사용자의 정보를 가져옵니다.
- `supabase.table(...).select(...)` 등을 사용하여 쿼리합니다.
- **Join 쿼리**: `select("*, table_b(*)")` 형식을 사용하여 연관 데이터를 한 번에 가져올 수 있습니다.

---

## 4. 프론트엔드 통합 (Angular)

### 4.1 서비스 레이어 (`services/`)
- 백엔드 응답의 인터페이스(Interface)를 정의합니다.
- `getAuthHeaders()`를 호출하여 모든 요청에 Bearer 토큰을 포함시킵니다.
- ID 타입(UUID vs Number)이 백엔드와 일치하는지 항상 확인합니다.

### 4.2 컴포넌트 (`pages/`)
- 비동기 데이터 로딩 후 `ChangeDetectorRef.detectChanges()`를 호출하여 UI 업데이트를 보장합니다.
- 중첩된 객체(예: `lab.labs.lab_name`) 접근 시 옵셔널 체이닝(`?.`)을 사용하여 런타임 에러를 방지합니다.

---

## 5. 체크리스트 (새 기능 추가 시)
1. [ ] SQL 마이그레이션 파일 작성 및 실행 (Table, RLS, Grant)
2. [ ] 백엔드 Pydantic 모델 정의
3. [ ] 백엔드 API 엔드포인트 구현 및 테스트
4. [ ] 프론트엔드 서비스 메서드 추가
5. [ ] UI 컴포넌트 연동 및 타입 검증
6. [ ] RLS 정책이 실제 권한을 잘 제한하는지 테스트 (다른 계정으로 테스트)
