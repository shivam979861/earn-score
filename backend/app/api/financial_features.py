from typing import Annotated
from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from app.core.database import get_db
from app.core.security import require_role
from app.models.entities import User
from app.api.reconciliation import reconciliation
from app.services_financial_features import calculate_features

router = APIRouter(prefix="/api/v1/worker", tags=["financial-features"])


@router.get("/financial-features")
def financial_features(worker: Annotated[User, Depends(require_role("worker"))],
                       db: Annotated[Session, Depends(get_db)]):
    return calculate_features(reconciliation(worker, db))
