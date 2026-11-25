from typing import Annotated
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session
from app.core.database import get_db
from app.core.security import require_role
from app.models.entities import Transaction, Upload, User
from app.services_reconciliation import analyze

router = APIRouter(prefix="/api/v1/worker", tags=["reconciliation"])


@router.get("/reconciliation")
def reconciliation(worker: Annotated[User, Depends(require_role("worker"))],
                   db: Annotated[Session, Depends(get_db)]):
    records = db.execute(select(Transaction, Upload.source_kind).join(Upload,
        (Transaction.upload_id == Upload.id) & (Transaction.user_id == Upload.user_id))
        .where(Transaction.user_id == worker.id).order_by(Transaction.occurred_at.desc(), Transaction.id)
        .limit(20001)).all()
    if len(records) > 20000:
        raise HTTPException(422, "Reconciliation supports up to 20,000 saved rows; no partial result is shown.")
    return analyze(records)
