from datetime import timedelta
from typing import Annotated
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select, func, update
from sqlalchemy.orm import Session
from app.core.config import get_settings
from app.core.database import get_db, set_actor_context
from app.core.security import (
    current_user, get_auth_context, hash_password, make_access_token,
    require_role, verify_password,
)
from app.models.entities import (
    Assessment, AuditEvent, AuthSession, User, WorkerProfile, utcnow,
)
from app.schemas.auth import (
    AdminCreateUserInput, ChangePasswordInput, LoginInput, RegisterInput,
    TokenOut, UserOut, UserStatusInput,
)

router = APIRouter(prefix="/api/v1")


def audit(db: Session, actor_id: str | None, action: str, resource_id: str | None = None):
    db.add(AuditEvent(actor_id=actor_id, action=action, resource_id=resource_id))


@router.get("/health", tags=["system"])
def health():
    return {"status": "ok", "service": "earnscore-api", "version": "0.2.0"}


@router.post("/auth/register", response_model=UserOut, status_code=201, tags=["auth"])
def register(data: RegisterInput, db: Annotated[Session, Depends(get_db)]):
    # Role intentionally absent from schema: public signup can ONLY create workers.
    email = str(data.email).strip().lower()
    if db.scalar(select(User).where(User.email == email)):
        raise HTTPException(status_code=409, detail="Email already registered")
    user = User(email=email, full_name=data.full_name.strip(),
                password_hash=hash_password(data.password), role="worker")
    db.add(user)
    db.flush()
    set_actor_context(db, user.id, "worker")
    db.add(WorkerProfile(user_id=user.id))
    audit(db, user.id, "auth.worker_registered", user.id)
    db.commit()
    db.refresh(user)
    return user


@router.post("/auth/login", response_model=TokenOut, tags=["auth"])
def login(data: LoginInput, db: Annotated[Session, Depends(get_db)]):
    user = db.scalar(select(User).where(User.email == str(data.email).lower()))
    if not user or not user.is_active or not verify_password(data.password, user.password_hash):
        raise HTTPException(status_code=401, detail="Invalid email or password")
    now = utcnow()
    ttl = get_settings().access_token_minutes
    session = AuthSession(user_id=user.id, created_at=now,
                          expires_at=now + timedelta(minutes=ttl))
    db.add(session)
    db.flush()
    audit(db, user.id, "auth.login", session.id)
    token = make_access_token(user, session.id)
    db.commit()
    return TokenOut(access_token=token, role=user.role, expires_in=ttl * 60)


@router.get("/auth/me", response_model=UserOut, tags=["auth"])
def me(user: Annotated[User, Depends(current_user)]):
    return user


@router.post("/auth/logout", tags=["auth"])
def logout(context: Annotated[tuple[User, AuthSession], Depends(get_auth_context)],
           db: Annotated[Session, Depends(get_db)]):
    user, session = context
    session.revoked_at = utcnow()
    audit(db, user.id, "auth.logout", session.id)
    db.commit()
    return {"ok": True}


@router.post("/auth/change-password", tags=["auth"])
def change_password(data: ChangePasswordInput,
                    user: Annotated[User, Depends(current_user)],
                    db: Annotated[Session, Depends(get_db)]):
    if not verify_password(data.current_password, user.password_hash):
        raise HTTPException(status_code=400, detail="Current password is incorrect")
    if data.current_password == data.new_password:
        raise HTTPException(status_code=400, detail="New password must be different")
    user.password_hash = hash_password(data.new_password)
    # Immediately revoke every active session. Re-login with the new password.
    db.execute(update(AuthSession).where(AuthSession.user_id == user.id,
                 AuthSession.revoked_at.is_(None)).values(revoked_at=utcnow()))
    audit(db, user.id, "auth.password_changed", user.id)
    db.commit()
    return {"ok": True, "message": "Password changed. Sign in again."}


@router.get("/worker/overview", tags=["worker"])
def worker_overview(user: Annotated[User, Depends(require_role("worker"))],
                    db: Annotated[Session, Depends(get_db)]):
    count = db.scalar(select(func.count()).select_from(Assessment).where(Assessment.user_id == user.id)) or 0
    return {"user_name": user.full_name, "assessment_count": count,
            "score": None, "income_sources": None, "onboarding_complete": False,
            "message": "Financial ingestion and scoring arrive in Phase 2/3."}


@router.get("/lender/overview", tags=["lender"])
def lender_overview(user: Annotated[User, Depends(require_role("lender"))]):
    return {"user_name": user.full_name, "assigned_cases": None, "pending_reviews": None, "decisions": None,
            "message": "No cases assigned. Access grants and lender reviews are upcoming modules."}


@router.get("/admin/overview", tags=["admin"])
def admin_overview(user: Annotated[User, Depends(require_role("admin"))],
                   db: Annotated[Session, Depends(get_db)]):
    users = db.scalar(select(func.count()).select_from(User)) or 0
    events = db.scalar(select(func.count()).select_from(AuditEvent)) or 0
    return {"user_name": user.full_name, "registered_users": users,
            "models": None, "events": events, "model_version": "not_implemented", "message": "User administration is live; scoring governance arrives in Phase 3."}


@router.get("/admin/users", response_model=list[UserOut], tags=["admin"])
def list_users(admin: Annotated[User, Depends(require_role("admin"))],
               db: Annotated[Session, Depends(get_db)],
               limit: int = Query(default=100, ge=1, le=200)):
    return db.scalars(select(User).order_by(User.created_at.desc()).limit(limit)).all()


@router.post("/admin/users", response_model=UserOut, status_code=201, tags=["admin"])
def provision_user(data: AdminCreateUserInput,
                   admin: Annotated[User, Depends(require_role("admin"))],
                   db: Annotated[Session, Depends(get_db)]):
    email = str(data.email).lower()
    if db.scalar(select(User).where(User.email == email)):
        raise HTTPException(status_code=409, detail="Email already registered")
    new_user = User(email=email, full_name=data.full_name.strip(),
                    password_hash=hash_password(data.password), role=data.role)
    db.add(new_user)
    db.flush()
    audit(db, admin.id, "admin.user_provisioned", new_user.id)
    db.commit()
    db.refresh(new_user)
    return new_user


@router.patch("/admin/users/{user_id}/status", response_model=UserOut, tags=["admin"])
def set_user_status(user_id: str, data: UserStatusInput,
                    admin: Annotated[User, Depends(require_role("admin"))],
                    db: Annotated[Session, Depends(get_db)]):
    target = db.get(User, user_id)
    if not target:
        raise HTTPException(status_code=404, detail="User not found")
    if user_id == admin.id and not data.is_active:
        raise HTTPException(status_code=400, detail="You cannot deactivate your own admin account")
    if target.is_active != data.is_active:
        target.is_active = data.is_active
        if not data.is_active:
            db.execute(update(AuthSession).where(
                AuthSession.user_id == target.id,
                AuthSession.revoked_at.is_(None)
            ).values(revoked_at=utcnow()))
        audit(db, admin.id, "admin.user_activated" if data.is_active else "admin.user_deactivated", target.id)
        db.commit()
        db.refresh(target)
    return target

# ---- Phase 1.5: persisted consents and limited lender-specific access ----
# These endpoints intentionally do NOT generate credit scores or access raw
# financial transactions. All decisions remain lender-owned and unautomated.

from app.models.entities import Consent, LenderAccess, Report  # noqa: E402
from app.schemas.access import ConsentCreate, GrantCreate  # noqa: E402
from app.core.access import lender_can_access  # noqa: E402
from datetime import timezone  # noqa: E402


def _aware(date):
    return date if date is None or date.tzinfo else date.replace(tzinfo=timezone.utc)


def _valid_consent(consent: Consent):
    return (consent.revoked_at is None and
            (consent.expires_at is None or _aware(consent.expires_at) > utcnow()) and
            consent.purposes.get("lender_review") is True)


def _consent_response(item: Consent):
    return {"id": item.id, "purposes": item.purposes, "scopes": item.scopes,
            "created_at": item.created_at, "expires_at": item.expires_at,
            "revoked_at": item.revoked_at, "active": _valid_consent(item)}


@router.post("/worker/consents", tags=["worker"], status_code=201)
def create_consent(data: ConsentCreate,
                   worker: Annotated[User, Depends(require_role("worker"))],
                   db: Annotated[Session, Depends(get_db)]):
    # Explicit, narrow purpose. Consent capture is *not* bank identity verification.
    item = Consent(user_id=worker.id, purposes={"lender_review": True},
                   scopes={scope: True for scope in set(data.scopes)},
                   expires_at=utcnow() + timedelta(days=data.expires_in_days))
    db.add(item)
    db.flush()
    audit(db, worker.id, "consent.created", item.id)
    db.commit()
    return _consent_response(item)


@router.get("/worker/consents", tags=["worker"])
def list_consents(worker: Annotated[User, Depends(require_role("worker"))],
                  db: Annotated[Session, Depends(get_db)]):
    items = db.scalars(select(Consent).where(Consent.user_id == worker.id)
                       .order_by(Consent.created_at.desc()).limit(100)).all()
    return [_consent_response(item) for item in items]


@router.post("/worker/consents/{consent_id}/revoke", tags=["worker"])
def revoke_consent(consent_id: str,
                   worker: Annotated[User, Depends(require_role("worker"))],
                   db: Annotated[Session, Depends(get_db)]):
    item = db.get(Consent, consent_id)
    if item is None or item.user_id != worker.id:
        raise HTTPException(status_code=404, detail="Consent not found")
    if item.revoked_at is None:
        item.revoked_at = utcnow()
        audit(db, worker.id, "consent.revoked", consent_id)
        db.commit()
    return _consent_response(item)


@router.post("/worker/access-grants", tags=["worker"], status_code=201)
def issue_access_grant(data: GrantCreate,
                       worker: Annotated[User, Depends(require_role("worker"))],
                       db: Annotated[Session, Depends(get_db)]):
    assessment = db.get(Assessment, data.assessment_id)
    consent = db.get(Consent, data.consent_id)
    lender = db.get(User, data.lender_id)
    if not assessment or assessment.user_id != worker.id:
        raise HTTPException(status_code=404, detail="Assessment not found")
    if not lender or not lender.is_active or lender.role != "lender":
        raise HTTPException(status_code=400, detail="A valid active lender is required")
    if not consent or consent.user_id != worker.id or not _valid_consent(consent):
        raise HTTPException(status_code=400, detail="Active worker consent required")
    desired = set(data.scopes)
    if not desired.issubset({k for k, v in consent.scopes.items() if v is True}):
        raise HTTPException(status_code=400, detail="Requested permissions exceed consent")
    expires = utcnow() + timedelta(days=data.expires_in_days)
    if consent.expires_at is not None and expires > _aware(consent.expires_at):
        raise HTTPException(status_code=400, detail="Grant cannot outlive consent")
    grant = LenderAccess(lender_id=lender.id, assessment_id=assessment.id,
                         consent_id=consent.id, scopes={scope: True for scope in desired},
                         expires_at=expires)
    db.add(grant)
    db.flush()
    audit(db, worker.id, "lender_access.granted", grant.id)
    db.commit()
    return {"id": grant.id, "lender_id": lender.id,
            "assessment_id": assessment.id, "scopes": grant.scopes,
            "expires_at": grant.expires_at, "revoked_at": None}


@router.post("/worker/access-grants/{grant_id}/revoke", tags=["worker"])
def revoke_access_grant(grant_id: str,
                        worker: Annotated[User, Depends(require_role("worker"))],
                        db: Annotated[Session, Depends(get_db)]):
    grant = db.get(LenderAccess, grant_id)
    assessment = db.get(Assessment, grant.assessment_id) if grant else None
    if grant is None or assessment is None or assessment.user_id != worker.id:
        raise HTTPException(status_code=404, detail="Access grant not found")
    if grant.revoked_at is None:
        grant.revoked_at = utcnow()
        audit(db, worker.id, "lender_access.revoked", grant_id)
        db.commit()
    return {"ok": True, "id": grant_id, "revoked_at": grant.revoked_at}


@router.get("/worker/assessments/{assessment_id}", tags=["worker"])
def worker_assessment(assessment_id: str,
                      worker: Annotated[User, Depends(require_role("worker"))],
                      db: Annotated[Session, Depends(get_db)]):
    record = db.get(Assessment, assessment_id)
    if not record or record.user_id != worker.id:
        raise HTTPException(status_code=404, detail="Assessment not found")
    return {"id": record.id, "score": record.score,
            "status": record.status, "model_version": record.model_version,
            "evidence_confidence": record.evidence_confidence}


@router.get("/lender/assessments/{assessment_id}", tags=["lender"])
def lender_assessment(assessment_id: str,
                      lender: Annotated[User, Depends(require_role("lender"))],
                      db: Annotated[Session, Depends(get_db)]):
    if not lender_can_access(db, lender, assessment_id, "assessment"):
        raise HTTPException(status_code=404, detail="Assessment not available")
    record = db.get(Assessment, assessment_id)
    if record is None:
        raise HTTPException(status_code=404, detail="Assessment not available")
    return {"id": record.id, "score": record.score, "status": record.status,
            "model_version": record.model_version,
            "evidence_confidence": record.evidence_confidence}


@router.get("/lender/reports/{report_id}", tags=["lender"])
def lender_report(report_id: str,
                  lender: Annotated[User, Depends(require_role("lender"))],
                  db: Annotated[Session, Depends(get_db)]):
    # On PostgreSQL the query itself is RLS-filtered; even guessed report IDs
    # never reveal private data without an active report scope.
    report = db.get(Report, report_id)
    if report is None or not lender_can_access(db, lender, report.assessment_id, "report"):
        raise HTTPException(status_code=404, detail="Report not available")
    return {"id": report.id, "assessment_id": report.assessment_id,
            "version": report.version, "status": report.status}
