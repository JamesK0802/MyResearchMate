from sqlalchemy import or_
from sqlalchemy.orm import Session


def shared_entities_query(
    db: Session,
    entity_model,
    share_model,
    share_entity_id,
    user_id: int,
    lab_ids,
):
    """Return entities shared with a user without DISTINCT over JSON columns.

    The persisted document models use PostgreSQL ``json`` columns. A joined
    ``SELECT DISTINCT entity.*`` cannot be evaluated for those columns. A
    correlated EXISTS predicate expresses the same access rule, prevents
    duplicates from multiple shares, and works for every My Data resource.
    """
    access_conditions = [share_model.shared_with_user_id == user_id]
    if lab_ids:
        access_conditions.append(share_model.lab_id.in_(lab_ids))

    matching_share = db.query(share_model.id).filter(
        share_entity_id == entity_model.id,
        or_(*access_conditions),
    ).exists()

    return db.query(entity_model).filter(
        entity_model.owner_user_id != user_id,
        matching_share,
    )
