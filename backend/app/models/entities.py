"""EarnScore relational schema.

Financial tables are protected by PostgreSQL RLS in migration 0002. The
SQLite fallback is suitable for tests only and does not enforce RLS.
"""
from datetime import datetime, timezone
from uuid import uuid4

from sqlalchemy import (
    Boolean, CheckConstraint, DateTime, ForeignKey, ForeignKeyConstraint,
    Index, Integer, JSON, Numeric, String, Text, UniqueConstraint,
)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column
from app.core.database import Base

JSON_DOCUMENT = JSON().with_variant(JSONB, "postgresql")


def uid() -> str:
    return str(uuid4())


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


class User(Base):
    __tablename__ = "users"
    __table_args__ = (CheckConstraint("role IN ('worker','lender','admin')", name="ck_users_role"),)
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=uid)
    email: Mapped[str] = mapped_column(String(255), unique=True, index=True)
    full_name: Mapped[str] = mapped_column(String(160))
    password_hash: Mapped[str] = mapped_column(Text)
    role: Mapped[str] = mapped_column(String(20), default="worker", index=True)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)


class AuthSession(Base):
    __tablename__ = "auth_sessions"
    __table_args__ = (CheckConstraint("expires_at > created_at", name="ck_sessions_expiry"),)
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=uid)
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id"), index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    revoked_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)


class WorkerProfile(Base):
    __tablename__ = "worker_profiles"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=uid)
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id"), unique=True, index=True)
    occupation: Mapped[str | None] = mapped_column(String(100), nullable=True)
    primary_platform: Mapped[str | None] = mapped_column(String(100), nullable=True)
    profile_status: Mapped[str] = mapped_column(String(30), default="incomplete")


class Consent(Base):
    __tablename__ = "consents"
    __table_args__ = (CheckConstraint("expires_at IS NULL OR expires_at > created_at", name="ck_consents_expiry"),)
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=uid)
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id"), index=True)
    purposes: Mapped[dict] = mapped_column(JSON_DOCUMENT, default=dict)
    scopes: Mapped[dict] = mapped_column(JSON_DOCUMENT, default=dict)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    expires_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    revoked_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)


class IncomeSource(Base):
    __tablename__ = "income_sources"
    __table_args__ = (
        UniqueConstraint("id", "user_id", name="uq_income_source_owner"),
        CheckConstraint("verification_status IN ('self_reported','pending','verified','rejected')", name="ck_source_verification"),
    )
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=uid)
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id"), index=True)
    provider: Mapped[str] = mapped_column(String(100))
    source_type: Mapped[str] = mapped_column(String(40))
    verification_status: Mapped[str] = mapped_column(String(30), default="self_reported")


class Upload(Base):
    __tablename__ = "uploads"
    __table_args__ = (UniqueConstraint("id", "user_id", name="uq_upload_owner"),
                      UniqueConstraint("user_id", "file_hash", name="uq_upload_user_hash"),)
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=uid)
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id"), index=True)
    file_hash: Mapped[str] = mapped_column(String(64))
    storage_key: Mapped[str] = mapped_column(Text)
    filename: Mapped[str] = mapped_column(String(160), default="statement.csv")
    row_count: Mapped[int] = mapped_column(Integer, default=0)
    valid_count: Mapped[int] = mapped_column(Integer, default=0)
    invalid_count: Mapped[int] = mapped_column(Integer, default=0)
    review_count: Mapped[int] = mapped_column(Integer, default=0)
    duplicate_count: Mapped[int] = mapped_column(Integer, default=0)
    column_mapping: Mapped[dict] = mapped_column(JSON_DOCUMENT, default=dict)
    invalid_rows: Mapped[list] = mapped_column(JSON_DOCUMENT, default=list)
    status: Mapped[str] = mapped_column(String(30), default="pending")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)


class Transaction(Base):
    __tablename__ = "transactions"
    __table_args__ = (
        ForeignKeyConstraint(["income_source_id", "user_id"], ["income_sources.id", "income_sources.user_id"], name="fk_transaction_source_same_owner"),
        ForeignKeyConstraint(["upload_id", "user_id"], ["uploads.id", "uploads.user_id"], name="fk_transaction_upload_same_owner"),
        Index("ix_transactions_owner_date", "user_id", "occurred_at"),
        Index("ix_transactions_owner_fingerprint", "user_id", "fingerprint"),
        Index("ix_transactions_owner_reference", "user_id", "reference_key"),
    )
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=uid)
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id"), index=True)
    income_source_id: Mapped[str | None] = mapped_column(String(36), nullable=True)
    upload_id: Mapped[str | None] = mapped_column(String(36), nullable=True)
    amount: Mapped[float] = mapped_column(Numeric(14, 2))
    occurred_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    classification: Mapped[str] = mapped_column(String(50), default="unclassified")
    evidence_ref: Mapped[str | None] = mapped_column(Text, nullable=True)
    description: Mapped[str] = mapped_column(String(250), default="")
    source_name: Mapped[str] = mapped_column(String(100), default="Unspecified")
    transaction_ref: Mapped[str] = mapped_column(String(100), default="")
    source_line: Mapped[int | None] = mapped_column(Integer, nullable=True)
    fingerprint: Mapped[str | None] = mapped_column(String(64), nullable=True)
    reference_key: Mapped[str | None] = mapped_column(String(64), nullable=True)
    review_reasons: Mapped[list] = mapped_column(JSON_DOCUMENT, default=list)
    potential_duplicate: Mapped[bool] = mapped_column(Boolean, default=False)
    verification_status: Mapped[str] = mapped_column(String(24), default="unverified")


class Assessment(Base):
    __tablename__ = "assessments"
    __table_args__ = (
        CheckConstraint("score IS NULL OR (score >= 0 AND score <= 1000)", name="ck_assessment_score_range"),
        CheckConstraint("status IN ('pending','incomplete','completed','superseded','failed')", name="ck_assessment_status"),
    )
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=uid)
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id"), index=True)
    model_version: Mapped[str] = mapped_column(String(30), default="not_implemented")
    status: Mapped[str] = mapped_column(String(30), default="pending")
    score: Mapped[int | None] = mapped_column(Integer, nullable=True)
    evidence_confidence: Mapped[str | None] = mapped_column(String(30), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)


class AssessmentFeature(Base):
    __tablename__ = "assessment_features"
    __table_args__ = (UniqueConstraint("assessment_id", "feature_name", name="uq_assessment_feature_name"),)
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=uid)
    assessment_id: Mapped[str] = mapped_column(ForeignKey("assessments.id"), index=True)
    feature_name: Mapped[str] = mapped_column(String(100))
    value: Mapped[dict] = mapped_column(JSON_DOCUMENT, default=dict)
    provenance: Mapped[dict] = mapped_column(JSON_DOCUMENT, default=dict)


class RiskFlag(Base):
    __tablename__ = "risk_flags"
    __table_args__ = (CheckConstraint("severity IN ('info','low','medium','high','critical')", name="ck_risk_severity"),)
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=uid)
    assessment_id: Mapped[str] = mapped_column(ForeignKey("assessments.id"), index=True)
    category: Mapped[str] = mapped_column(String(60))
    severity: Mapped[str] = mapped_column(String(25))
    explanation: Mapped[str] = mapped_column(Text)


class Report(Base):
    __tablename__ = "reports"
    __table_args__ = (
        UniqueConstraint("assessment_id", "version", name="uq_report_assessment_version"),
        CheckConstraint("status IN ('draft','ready','superseded','withdrawn')", name="ck_report_status"),
    )
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=uid)
    assessment_id: Mapped[str] = mapped_column(ForeignKey("assessments.id"), index=True)
    version: Mapped[int] = mapped_column(Integer, default=1)
    status: Mapped[str] = mapped_column(String(30), default="draft")


class LenderAccess(Base):
    __tablename__ = "lender_access"
    __table_args__ = (CheckConstraint("expires_at > created_at", name="ck_grant_expiry"),)
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=uid)
    lender_id: Mapped[str] = mapped_column(ForeignKey("users.id"), index=True)
    assessment_id: Mapped[str] = mapped_column(ForeignKey("assessments.id"), index=True)
    consent_id: Mapped[str] = mapped_column(ForeignKey("consents.id"), index=True)
    scopes: Mapped[dict] = mapped_column(JSON_DOCUMENT, default=dict)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    revoked_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)


class ReviewRequest(Base):
    __tablename__ = "review_requests"
    __table_args__ = (CheckConstraint("status IN ('open','fulfilled','cancelled')", name="ck_review_status"),)
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=uid)
    lender_id: Mapped[str] = mapped_column(ForeignKey("users.id"), index=True)
    assessment_id: Mapped[str] = mapped_column(ForeignKey("assessments.id"), index=True)
    request_details: Mapped[str] = mapped_column(Text)
    status: Mapped[str] = mapped_column(String(25), default="open")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)


class LenderDecision(Base):
    __tablename__ = "lender_decisions"
    __table_args__ = (CheckConstraint("outcome IN ('approved','declined','on_hold')", name="ck_decision_outcome"),)
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=uid)
    lender_id: Mapped[str] = mapped_column(ForeignKey("users.id"), index=True)
    assessment_id: Mapped[str] = mapped_column(ForeignKey("assessments.id"), index=True)
    outcome: Mapped[str] = mapped_column(String(30))
    reasons: Mapped[dict] = mapped_column(JSON_DOCUMENT, default=dict)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)


class AuditEvent(Base):
    __tablename__ = "audit_events"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=uid)
    actor_id: Mapped[str | None] = mapped_column(ForeignKey("users.id"), nullable=True)
    action: Mapped[str] = mapped_column(String(100))
    resource_id: Mapped[str | None] = mapped_column(String(36), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
