"""Optional live-PostgreSQL RLS tests. Run only against an EMPTY/throwaway DB.

Env:
 TEST_POSTGRES_OWNER_URL=postgresql+psycopg://earnscore_owner:...@localhost/earnscore
 TEST_POSTGRES_APP_URL=postgresql+psycopg://earnscore_app:...@localhost/earnscore

Migrate that test DB first with Alembic. These tests create and remove records.
"""
import os
import uuid

import pytest
from sqlalchemy import create_engine, text
from sqlalchemy.exc import DBAPIError
from sqlalchemy.orm import Session

OWNER_URL = os.getenv("TEST_POSTGRES_OWNER_URL")
APP_URL = os.getenv("TEST_POSTGRES_APP_URL")
pytestmark = pytest.mark.skipif(not OWNER_URL or not APP_URL, reason="No live PostgreSQL test URLs supplied")


def _id():
    return str(uuid.uuid4())


def _as(conn, uid: str, role: str):
    conn.execute(text("SELECT set_config('app.user_id', :uid, true), "
                      "set_config('app.actor_role', :role, true)"), {"uid": uid, "role": role})


def _num(conn, table: str):
    return conn.execute(text(f"SELECT count(*) FROM {table}")).scalar_one()


def test_worker_isolation_lender_scope_and_revocation():
    from app.api.routes import create_consent, issue_access_grant, revoke_access_grant, revoke_consent
    from app.core.database import set_actor_context
    from app.models.entities import User
    from app.schemas.access import ConsentCreate, GrantCreate

    owner_engine = create_engine(OWNER_URL)
    app_engine = create_engine(APP_URL)
    user1, user2, lender1, lender2, admin = (_id() for _ in range(5))
    assessment, report, source, txn = (_id() for _ in range(4))
    try:
        with owner_engine.begin() as conn:
            for uid, role in [(user1, "worker"), (user2, "worker"),
                              (lender1, "lender"), (lender2, "lender"), (admin, "admin")]:
                conn.execute(text("""
                    INSERT INTO users (id, email, full_name, password_hash, role, is_active, created_at)
                    VALUES (:id, :email, 'RLS Test', 'fake-not-for-login', :role, true, now())
                """), {"id": uid, "role": role, "email": f"rls-{uid}@example.invalid"})
            conn.execute(text("""
                INSERT INTO income_sources (id,user_id,provider,source_type,verification_status)
                VALUES (:sid,:uid,'Demo','gig','self_reported')
            """), {"sid": source, "uid": user1})
            conn.execute(text("""
                INSERT INTO transactions (id,user_id,income_source_id,amount,occurred_at,classification)
                VALUES (:tid,:uid,:sid,1000,now(),'income')
            """), {"tid": txn, "uid": user1, "sid": source})
            conn.execute(text("""
                INSERT INTO assessments (id,user_id,model_version,status,score,created_at)
                VALUES (:aid,:uid,'fictional-v0','completed',790,now())
            """), {"aid": assessment, "uid": user1})
            conn.execute(text("""
                INSERT INTO reports (id,assessment_id,version,status) VALUES (:rid,:aid,1,'ready')
            """), {"rid": report, "aid": assessment})

        # No actor => deny by default on all financial records.
        with app_engine.begin() as conn:
            assert conn.execute(text("SELECT count(*) FROM transactions WHERE id = :id"), {"id": txn}).scalar_one() == 0
        with app_engine.begin() as conn:
            _as(conn, user1, "worker")
            assert conn.execute(text("SELECT count(*) FROM transactions WHERE id = :id"), {"id": txn}).scalar_one() == 1
        with app_engine.begin() as conn:
            _as(conn, user2, "worker")
            assert conn.execute(text("SELECT count(*) FROM transactions WHERE id = :id"), {"id": txn}).scalar_one() == 0
        with app_engine.begin() as conn:
            _as(conn, admin, "admin")
            assert conn.execute(text("SELECT count(*) FROM transactions WHERE id = :id"), {"id": txn}).scalar_one() == 0
        # No app-side scoring writes: only processor role can insert assessments.
        with pytest.raises(DBAPIError):
            with app_engine.begin() as conn:
                _as(conn, user1, "worker")
                conn.execute(text("""
                    INSERT INTO assessments (id,user_id,model_version,status,created_at)
                    VALUES (:id,:uid,'x','pending',now())
                """), {"id": _id(), "uid": user1})

        with Session(app_engine) as db:
            set_actor_context(db, user1, "worker")
            worker = db.get(User, user1)
            consent = create_consent(ConsentCreate(scopes=["assessment", "report"]), worker, db)
            assert consent["active"]

            set_actor_context(db, user1, "worker")
            grant_input = GrantCreate(
                assessment_id=assessment, consent_id=consent["id"], lender_id=lender1,
                scopes=["assessment", "report"],
            )
            grant = issue_access_grant(grant_input, worker, db)
            assert grant["scopes"] == {"assessment": True, "report": True}
        with app_engine.begin() as conn:
            _as(conn, lender1, "lender")
            assert conn.execute(text("SELECT count(*) FROM assessments WHERE id=:id"), {"id": assessment}).scalar_one() == 1
            assert conn.execute(text("SELECT count(*) FROM reports WHERE id=:id"), {"id": report}).scalar_one() == 1
            assert conn.execute(text("SELECT count(*) FROM transactions WHERE id=:id"), {"id": txn}).scalar_one() == 0
        with app_engine.begin() as conn:
            _as(conn, lender2, "lender")
            assert conn.execute(text("SELECT count(*) FROM reports WHERE id=:id"), {"id": report}).scalar_one() == 0

        with Session(app_engine) as db:
            set_actor_context(db, user1, "worker")
            worker = db.get(User, user1)
            assert revoke_access_grant(grant["id"], worker, db)["revoked_at"] is not None
        with app_engine.begin() as conn:
            _as(conn, lender1, "lender")
            assert conn.execute(text("SELECT count(*) FROM reports WHERE id=:id"), {"id": report}).scalar_one() == 0

        # Parent consent revocation cuts off an otherwise active grant.
        with Session(app_engine) as db:
            set_actor_context(db, user1, "worker")
            worker = db.get(User, user1)
            issue_access_grant(grant_input, worker, db)
            set_actor_context(db, user1, "worker")
            assert not revoke_consent(consent["id"], worker, db)["active"]
        with app_engine.begin() as conn:
            _as(conn, lender1, "lender")
            assert conn.execute(text("SELECT count(*) FROM reports WHERE id=:id"), {"id": report}).scalar_one() == 0

    finally:
        # Schema owner bypasses RLS only in this isolated fixture cleanup.
        with owner_engine.begin() as conn:
            for table, column, values in [
                ("lender_access", "assessment_id", [assessment]),
                ("consents", "user_id", [user1]),
                ("audit_events", "actor_id", [user1]),
                ("reports", "id", [report]),
                ("assessments", "id", [assessment]),
                ("transactions", "id", [txn]),
                ("income_sources", "id", [source]),
                ("users", "id", [user1, user2, lender1, lender2, admin]),
            ]:
                for value in values:
                    conn.execute(text(f"DELETE FROM {table} WHERE {column}=:v"), {"v": value})
        owner_engine.dispose()
        app_engine.dispose()
