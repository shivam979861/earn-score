"""Authenticated worker CSV ingestion; no automatic creditworthiness claims."""
from datetime import datetime, time, timezone
from decimal import Decimal
from hashlib import sha256
from typing import Annotated

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.security import require_role
from app.models.entities import AuditEvent, Transaction, Upload, User
from app.services_ingestion import MAX_BYTES, ImportValidationError, parse_statement

router = APIRouter(prefix="/api/v1/worker", tags=["worker-ingestion"])


def serialize_upload(upload: Upload):
    return {
        "id": upload.id, "filename": upload.filename, "created_at": upload.created_at,
        "status": upload.status, "row_count": upload.row_count,
        "valid_count": upload.valid_count, "invalid_count": upload.invalid_count,
        "review_count": upload.review_count, "duplicate_count": upload.duplicate_count,
        "verification_status": "unverified", "raw_file_stored": False,
        "invalid_rows": upload.invalid_rows[:50],
    }


def serialize_transaction(transaction: Transaction):
    return {
        "id": transaction.id, "line": transaction.source_line,
        "date": transaction.occurred_at.date().isoformat(),
        "description": transaction.description,
        "amount": str(transaction.amount), "source": transaction.source_name,
        "transaction_id": transaction.transaction_ref,
        "classification": transaction.classification,
        "potential_duplicate": transaction.potential_duplicate,
        "review_reasons": transaction.review_reasons,
        "verification_status": transaction.verification_status,
    }


@router.post("/uploads", status_code=201)
async def ingest_csv(
    worker: Annotated[User, Depends(require_role("worker"))],
    db: Annotated[Session, Depends(get_db)],
    file: Annotated[UploadFile, File(description="CSV statement, max 2MB")],
    mapping: Annotated[str | None, Form()] = None,
):
    filename = (file.filename or "").rsplit("/", 1)[-1].rsplit("\\", 1)[-1]
    if not filename.lower().endswith(".csv") or not filename or len(filename) > 160:
        raise HTTPException(status_code=400, detail="Select a CSV file with a valid filename.")
    payload = await file.read(MAX_BYTES + 1)
    if len(payload) > MAX_BYTES or not payload:
        raise HTTPException(status_code=413, detail="CSV must be nonempty and at most 2 MB.")
    file_hash = sha256(payload).hexdigest()
    existing_file = db.scalar(select(Upload).where(Upload.user_id == worker.id, Upload.file_hash == file_hash))
    if existing_file is not None:
        raise HTTPException(status_code=409, detail="This exact CSV was already imported. View your previous upload instead.")
    try:
        parsed = parse_statement(payload, mapping)
    except ImportValidationError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc

    # Compare only this worker's rows. Date-range query avoids loading unrelated
    # users' financial records; DB indices support the narrow fetch.
    first = min(r.date for r in parsed.rows)
    last = max(r.date for r in parsed.rows)
    previous = db.scalars(select(Transaction).where(
        Transaction.user_id == worker.id,
        Transaction.occurred_at >= datetime.combine(first, time.min, tzinfo=timezone.utc),
        Transaction.occurred_at <= datetime.combine(last, time.max, tzinfo=timezone.utc),
    )).all()
    # References can match even if a platform changes the posting date.
    # Query only the current worker and batch IN clauses to avoid DB parameter limits.
    all_refs = list({r.reference_key for r in parsed.rows if r.reference_key})
    previous_by_id = {p.id: p for p in previous}
    for start in range(0, len(all_refs), 400):
        refs = all_refs[start:start + 400]
        for existing in db.scalars(select(Transaction).where(
            Transaction.user_id == worker.id, Transaction.reference_key.in_(refs)
        )).all():
            previous_by_id[existing.id] = existing
    previous = list(previous_by_id.values())
    known_fingerprints = {}
    known_refs = {}
    for old in previous:
        if old.fingerprint:
            known_fingerprints.setdefault(old.fingerprint, []).append(old)
        if old.reference_key:
            known_refs.setdefault(old.reference_key, []).append(old)
    # Mark old and new records for review when a later import matches.
    affected_upload_ids: set[str] = set()
    for row in parsed.rows:
        found = {}
        for record in known_fingerprints.get(row.fingerprint, []):
            found[record.id] = (record, "Matching date, amount, description and source in another upload — possible duplicate")
        if row.reference_key:
            for record in known_refs.get(row.reference_key, []):
                found[record.id] = (record, "Repeated transaction reference across uploads — possible duplicate")
        for old, reason in found.values():
            row.flag(reason)
            old_reasons = list(old.review_reasons or [])
            if reason not in old_reasons:
                old.review_reasons = old_reasons + [reason]
            old.potential_duplicate = True
            if old.upload_id:
                affected_upload_ids.add(old.upload_id)

    item = Upload(
        user_id=worker.id, file_hash=file_hash, storage_key="not-stored",
        filename=filename, row_count=parsed.count, valid_count=len(parsed.rows),
        invalid_count=len(parsed.invalid),
        review_count=sum(bool(r.issues) for r in parsed.rows),
        duplicate_count=sum(r.duplicate for r in parsed.rows),
        column_mapping=parsed.mapping, invalid_rows=parsed.invalid[:100], status="processed",
    )
    db.add(item)
    db.flush()
    for row in parsed.rows:
        db.add(Transaction(
            user_id=worker.id, upload_id=item.id, amount=row.amount,
            occurred_at=datetime.combine(row.date, time.min, tzinfo=timezone.utc),
            classification=row.classification, description=row.description,
            source_name=row.source, transaction_ref=row.reference,
            source_line=row.line, fingerprint=row.fingerprint,
            reference_key=row.reference_key, review_reasons=row.issues,
            potential_duplicate=row.duplicate, verification_status="unverified",
        ))
    for older_id in affected_upload_ids:
        older = db.get(Upload, older_id)
        if older is not None and older.user_id == worker.id:
            txns = db.scalars(select(Transaction).where(Transaction.user_id == worker.id, Transaction.upload_id == older_id)).all()
            older.review_count = sum(bool(t.review_reasons) for t in txns)
            older.duplicate_count = sum(bool(t.potential_duplicate) for t in txns)
    db.add(AuditEvent(actor_id=worker.id, action="financial.csv_imported", resource_id=item.id))
    try:
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        raise HTTPException(status_code=409, detail="This CSV has already been imported or the import conflicted. Retry after refreshing.") from exc
    return {
        **serialize_upload(item),
        "summary": {
            "possible_income": str(sum((r.amount for r in parsed.rows if r.classification == "income" and not r.issues), Decimal(0))),
            "total_outflows": str(sum((abs(r.amount) for r in parsed.rows if r.amount < 0), Decimal(0))),
            "note": "All imported records remain unverified. No credit score was calculated.",
        },
        "review_samples": [
            {"line": r.line, "description": r.description, "reasons": r.issues}
            for r in parsed.rows if r.issues
        ][:20],
    }


@router.get("/uploads")
def list_imports(
    worker: Annotated[User, Depends(require_role("worker"))],
    db: Annotated[Session, Depends(get_db)],
):
    imports = db.scalars(select(Upload).where(Upload.user_id == worker.id)
                         .order_by(Upload.created_at.desc()).limit(30)).all()
    return [serialize_upload(item) for item in imports]


@router.get("/uploads/{upload_id}/transactions")
def list_import_transactions(
    upload_id: str,
    worker: Annotated[User, Depends(require_role("worker"))],
    db: Annotated[Session, Depends(get_db)],
    limit: int = 100, offset: int = 0,
):
    upload = db.get(Upload, upload_id)
    if upload is None or upload.user_id != worker.id:
        raise HTTPException(status_code=404, detail="Upload not found")
    if not (1 <= limit <= 200 and 0 <= offset <= 10_000):
        raise HTTPException(status_code=422, detail="Invalid pagination range")
    rows = db.scalars(select(Transaction).where(
        Transaction.user_id == worker.id, Transaction.upload_id == upload_id,
    ).order_by(Transaction.source_line).offset(offset).limit(limit)).all()
    return {"upload": serialize_upload(upload), "transactions": [serialize_transaction(row) for row in rows]}
