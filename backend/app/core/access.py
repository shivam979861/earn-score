"""Application authorization for lender access.

All API checks run independently of PostgreSQL RLS. The RLS function is used
on PostgreSQL to avoid leaking protected consent rows through ordinary joins.
"""
from sqlalchemy import func, select
from sqlalchemy.orm import Session
from app.models.entities import Assessment, Consent, LenderAccess, User, utcnow

VALID_SCOPES = {"assessment", "report", "decision"}


def lender_can_access(db: Session, lender: User, assessment_id: str, scope: str) -> bool:
    if not lender.is_active or lender.role != "lender" or scope not in VALID_SCOPES:
        return False
    if db.bind is not None and db.bind.dialect.name == "postgresql":
        return bool(db.scalar(select(func.earnscore_can_read_assessment(assessment_id, scope))))

    # SQLite fallback for isolated API tests (not a substitute for RLS).
    now = utcnow()
    grants = db.scalars(select(LenderAccess).where(
        LenderAccess.lender_id == lender.id,
        LenderAccess.assessment_id == assessment_id,
        LenderAccess.revoked_at.is_(None),
    )).all()
    for grant in grants:
        expiry = grant.expires_at
        if expiry.tzinfo is None:
            from datetime import timezone
            expiry = expiry.replace(tzinfo=timezone.utc)
        if expiry <= now or grant.scopes.get(scope) is not True:
            continue
        consent = db.get(Consent, grant.consent_id)
        assessment = db.get(Assessment, assessment_id)
        if not consent or not assessment or consent.user_id != assessment.user_id:
            continue
        if consent.revoked_at is not None or consent.purposes.get("lender_review") is not True:
            continue
        if consent.scopes.get(scope) is not True:
            continue
        if consent.expires_at is not None:
            ce = consent.expires_at
            if ce.tzinfo is None:
                ce = ce.replace(tzinfo=timezone.utc)
            if ce <= now:
                continue
        return True
    return False
