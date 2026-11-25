from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.core.config import get_settings
from app.core.database import Base, engine
import app.models  # noqa: F401 - register SQLAlchemy models
from app.api.routes import router
from app.api.ingestion import router as ingestion_router
from app.api.reconciliation import router as reconciliation_router
from app.api.financial_features import router as financial_features_router


@asynccontextmanager
async def lifespan(app: FastAPI):
    secret = get_settings().jwt_secret
    if len(secret) < 32 or secret.startswith("CHANGE_ME"):
        raise RuntimeError("Set a strong, random JWT_SECRET (32+ characters) in backend/.env")
    # SQLite is retained for isolated tests. PostgreSQL ALWAYS requires Alembic.
    if engine.dialect.name == "sqlite":
        Base.metadata.create_all(bind=engine)
    else:
        from sqlalchemy import text
        from sqlalchemy.exc import SQLAlchemyError
        try:
            with engine.connect() as connection:
                version = connection.execute(text("SELECT version_num FROM public.alembic_version")).scalar_one_or_none()
            if version != "0004":
                raise RuntimeError(f"Expected EarnScore PostgreSQL migration 0004, found {version!r}. Run: alembic upgrade head as owner")
        except SQLAlchemyError as exc:
            raise RuntimeError("EarnScore PostgreSQL migrations missing or not readable. Run: alembic upgrade head as owner") from exc
    yield


app = FastAPI(title="EarnScore API", version="0.1.0", lifespan=lifespan)
origins = [entry.strip() for entry in get_settings().cors_origins.split(",") if entry.strip()]
app.add_middleware(CORSMiddleware, allow_origins=origins, allow_credentials=True,
                   allow_methods=["GET", "POST"], allow_headers=["Authorization", "Content-Type"])
app.include_router(router)
app.include_router(ingestion_router)

app.include_router(reconciliation_router)

app.include_router(financial_features_router)
