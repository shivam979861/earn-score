from collections.abc import Generator
from sqlalchemy import create_engine
from sqlalchemy.orm import DeclarativeBase, Session, sessionmaker
from app.core.config import get_settings


class Base(DeclarativeBase):
    pass


def make_engine():
    url = get_settings().database_url
    options = {"check_same_thread": False} if url.startswith("sqlite") else {}
    return create_engine(url, connect_args=options, pool_pre_ping=True)


engine = make_engine()
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


def get_db() -> Generator[Session, None, None]:
    with SessionLocal() as db:
        yield db


def set_actor_context(db: Session, user_id: str, role: str) -> None:
    """Bind a verified actor to the current PostgreSQL transaction for RLS.

    This must only be called after validating the JWT/session against the DB,
    or when creating the new worker's profile during trusted registration.
    SET LOCAL is transaction-scoped, so pooled connections cannot inherit it.
    """
    if db.bind is not None and db.bind.dialect.name == "postgresql":
        from sqlalchemy import text
        db.execute(text("SELECT set_config('app.user_id', :uid, true), "
                        "set_config('app.actor_role', :role, true)"),
                   {"uid": user_id, "role": role})
