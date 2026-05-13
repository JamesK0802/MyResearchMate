import os
import json
from datetime import datetime
from sqlalchemy.orm import Session
import sys

sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from database.db import SessionLocal
from database.models import User, Lab, LabMember, CrisprResult, PcrPreset
from auth.supabase_client import get_supabase_admin
from uuid import UUID

def migrate():
    sb = get_supabase_admin()
    db = SessionLocal()
    
    print("🚀 데이터 이전을 시작합니다 (Supabase -> Local DB)...")

    try:
        # 1. Users 이전
        print("👤 Users 이전 중...")
        sb_users = sb.table("users").select("*").execute()
        for u in sb_users.data:
            try:
                auth_id = u.get("supabase_auth_id") or u.get("uid")
                auth_uuid = UUID(auth_id) if auth_id else None
                
                exists = db.query(User).filter((User.id == u["id"]) | (User.uid == auth_uuid)).first()
                if not exists:
                    db.add(User(
                        id=u["id"],
                        uid=auth_uuid,
                        email=u["email"],
                        name=u["name"],
                        role=u.get("role", "user"),
                        created_at=u.get("created_at"),
                        updated_at=u.get("updated_at")
                    ))
            except Exception as e:
                print(f"⚠️ User {u.get('email')} 건너뜀: {str(e)}")
        db.commit()

        # 2. Labs 이전
        print("🧪 Labs 이전 중...")
        sb_labs = sb.table("labs").select("*").execute()
        for l in sb_labs.data:
            try:
                # ID가 숫자인 경우만 처리 (로컬 DB가 BIGINT이므로)
                lab_id = l["id"]
                if not isinstance(lab_id, int):
                    # 만약 문자열인데 숫자라면 변환 시도
                    try: lab_id = int(lab_id)
                    except: 
                        print(f"⚠️ Lab {l.get('lab_name')} 건너뜀 (ID가 숫자가 아님: {lab_id})")
                        continue

                exists = db.query(Lab).filter(Lab.id == lab_id).first()
                if not exists:
                    db.add(Lab(
                        id=lab_id,
                        lab_name=l["lab_name"],
                        description=l.get("description"),
                        created_at=l.get("created_at")
                    ))
            except Exception as e:
                print(f"⚠️ Lab {l.get('lab_name')} 건너뜀: {str(e)}")
        db.commit()

        # 3. Lab Members 이전
        print("👥 Lab Members 이전 중...")
        sb_members = sb.table("lab_members").select("*").execute()
        for m in sb_members.data:
            try:
                member_id = m["id"]
                if not isinstance(member_id, int):
                    try: member_id = int(member_id)
                    except: continue

                exists = db.query(LabMember).filter(LabMember.id == member_id).first()
                if not exists:
                    uid_val = m.get("uid")
                    if isinstance(uid_val, str):
                        uid_val = UUID(uid_val)
                    
                    # Lab ID도 숫자인지 확인
                    l_id = m["lab_id"]
                    if not isinstance(l_id, int):
                        try: l_id = int(l_id)
                        except: continue

                    db.add(LabMember(
                        id=member_id,
                        lab_id=l_id,
                        uid=uid_val,
                        role=m.get("role", "member"),
                        joined_at=m.get("joined_at")
                    ))
            except Exception as e:
                pass
        db.commit()

        # 4. CRISPR Results 이전
        print("📊 CRISPR Results 이전 중...")
        sb_results = sb.table("crispr_results").select("*").execute()
        for r in sb_results.data:
            try:
                res_id = UUID(r["id"])
                exists = db.query(CrisprResult).filter(CrisprResult.id == res_id).first()
                if not exists:
                    db.add(CrisprResult(
                        id=res_id,
                        owner_user_id=r["owner_user_id"],
                        title=r["title"],
                        metadata_json=r.get("metadata_json", {}),
                        result_json=r.get("result_json", {}),
                        created_at=r.get("created_at")
                    ))
            except Exception as e:
                print(f"⚠️ Result {r.get('title')} 건너뜀: {str(e)}")
        db.commit()

        # 5. PCR Presets 이전
        print("🧬 PCR Presets 이전 중...")
        sb_presets = sb.table("pcr_presets").select("*").execute()
        for p in sb_presets.data:
            try:
                p_id = p["id"]
                if not isinstance(p_id, int):
                    try: p_id = int(p_id)
                    except: continue
                    
                exists = db.query(PcrPreset).filter(PcrPreset.id == p_id).first()
                if not exists:
                    db.add(PcrPreset(
                        id=p_id,
                        owner_user_id=p["owner_user_id"],
                        name=p["name"],
                        primer_f=p["primer_f"],
                        primer_r=p["primer_r"],
                        product_size=p.get("product_size"),
                        is_public=p.get("is_public", False),
                        created_at=p.get("created_at")
                    ))
            except Exception as e:
                pass
        db.commit()

        print("✅ 데이터 이전이 성공적으로 완료되었습니다!")

    except Exception as e:
        db.rollback()
        print(f"❌ 전체 프로세스 에러 발생: {str(e)}")
    finally:
        db.close()

if __name__ == "__main__":
    migrate()
