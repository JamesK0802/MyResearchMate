from pathlib import Path
from database.models import StorageQuota, User
from storage.file_store import PERSONAL_ROOT, user_uid
PERSONAL_DEFAULT = 5 * 1024 ** 3
LAB_DEFAULT = 20 * 1024 ** 3
def directory_size(path: Path) -> int:
    return sum(p.stat().st_size for p in path.rglob('*') if p.is_file()) if path.exists() else 0
def personal_quota(db, user_id):
    row=db.query(StorageQuota).filter(StorageQuota.scope=='personal',StorageQuota.user_id==user_id).first()
    return row.quota_bytes if row else PERSONAL_DEFAULT
def personal_usage(db, user_id):
    user=db.query(User).filter(User.id==user_id).one()
    return directory_size(PERSONAL_ROOT / user_uid(user))
