import os
import tempfile
from pathlib import Path

# Configure isolated DB and token secret BEFORE importing app modules.
_test_db = Path(tempfile.mkdtemp()) / "test.db"
os.environ["DATABASE_URL"] = f"sqlite:///{_test_db}"
os.environ["JWT_SECRET"] = "test-only-signing-key-with-more-than-32-characters"

from fastapi.testclient import TestClient  # noqa: E402
from app.main import app  # noqa: E402
from app.core.database import SessionLocal  # noqa: E402
from app.core.security import hash_password  # noqa: E402
from app.models.entities import User  # noqa: E402


def test_health_and_worker_auth():
    with TestClient(app) as client:
        assert client.get("/api/v1/health").json()["status"] == "ok"
        payload = {"email": "worker@example.com", "full_name": "Demo Worker", "password": "secure-test-password"}
        assert client.post("/api/v1/auth/register", json=payload).status_code == 201
        assert client.post("/api/v1/auth/register", json=payload).status_code == 409
        token = client.post("/api/v1/auth/login", json={"email": payload["email"], "password": payload["password"]}).json()["access_token"]
        headers = {"Authorization": f"Bearer {token}"}
        assert client.get("/api/v1/auth/me", headers=headers).json()["role"] == "worker"
        assert client.get("/api/v1/worker/overview", headers=headers).status_code == 200
        assert client.get("/api/v1/lender/overview", headers=headers).status_code == 403
        assert client.get("/api/v1/admin/overview", headers=headers).status_code == 403
        assert client.get("/api/v1/auth/me").status_code == 401


def test_lender_role_enforced():
    with TestClient(app) as client:
        with SessionLocal() as db:
            db.add(User(email="lender@example.com", full_name="Demo Lender", role="lender",
                        password_hash=hash_password("secure-test-password")))
            db.commit()
        login = client.post("/api/v1/auth/login", json={"email":"lender@example.com", "password":"secure-test-password"})
        headers = {"Authorization": f"Bearer {login.json()['access_token']}"}
        assert client.get("/api/v1/lender/overview", headers=headers).status_code == 200
        assert client.get("/api/v1/worker/overview", headers=headers).status_code == 403


def test_all_three_roles_and_public_role_injection():
    with TestClient(app) as client:
        # The public endpoint must never honor a client-supplied role.
        reg = client.post("/api/v1/auth/register", json={
            "email": "attempted-admin@example.com", "full_name": "Attempted Admin",
            "password": "very-secure-password", "role": "admin",
        })
        assert reg.status_code == 201
        assert reg.json()["role"] == "worker"

        with SessionLocal() as db:
            db.add_all([
                User(email="admin-test@example.com", full_name="Test Admin", role="admin",
                     password_hash=hash_password("test-admin-password")),
                User(email="lender-test@example.com", full_name="Test Lender", role="lender",
                     password_hash=hash_password("test-lender-password")),
            ])
            db.commit()
        for email, password, expected_role in [
            ("admin-test@example.com", "test-admin-password", "admin"),
            ("lender-test@example.com", "test-lender-password", "lender"),
            ("attempted-admin@example.com", "very-secure-password", "worker"),
        ]:
            resp = client.post("/api/v1/auth/login", json={"email": email, "password": password})
            assert resp.status_code == 200
            assert resp.json()["role"] == expected_role
            assert resp.json()["expires_in"] == 1800
            headers = {"Authorization": f"Bearer {resp.json()['access_token']}"}
            for role in ["worker", "lender", "admin"]:
                overview = client.get(f"/api/v1/{role}/overview", headers=headers)
                assert overview.status_code == (200 if role == expected_role else 403)


def test_logout_revokes_token_and_does_not_end_other_sessions():
    with TestClient(app) as client:
        credentials = {"email": "logout-worker@example.com", "password": "strong-worker-password"}
        assert client.post("/api/v1/auth/register", json={
            **credentials, "full_name": "Logout Test Worker"
        }).status_code == 201
        tokens = [client.post("/api/v1/auth/login", json=credentials).json()["access_token"] for _ in range(2)]
        headers_a, headers_b = ({"Authorization": f"Bearer {token}"} for token in tokens)
        assert client.post("/api/v1/auth/logout", headers=headers_a).status_code == 200
        assert client.get("/api/v1/auth/me", headers=headers_a).status_code == 401
        assert client.get("/api/v1/auth/me", headers=headers_b).status_code == 200
        assert client.post("/api/v1/auth/logout", headers=headers_a).status_code == 401


def test_admin_can_provision_and_disable_but_worker_cannot():
    with TestClient(app) as client:
        admin_token = client.post("/api/v1/auth/login", json={
            "email": "admin-test@example.com", "password": "test-admin-password"
        }).json()["access_token"]
        worker_token = client.post("/api/v1/auth/login", json={
            "email": "logout-worker@example.com", "password": "strong-worker-password"
        }).json()["access_token"]
        a = {"Authorization": f"Bearer {admin_token}"}
        w = {"Authorization": f"Bearer {worker_token}"}
        provision = {"email": "new-lender@example.com", "full_name": "New Lender",
                     "password": "new-lender-password", "role": "lender"}
        assert client.get("/api/v1/admin/users", headers=w).status_code == 403
        assert client.post("/api/v1/admin/users", json=provision, headers=w).status_code == 403
        result = client.post("/api/v1/admin/users", json=provision, headers=a)
        assert result.status_code == 201
        assert result.json()["role"] == "lender"
        assert "password_hash" not in result.json()
        assert client.post("/api/v1/admin/users", json=provision, headers=a).status_code == 409
        assert any(u["email"] == "new-lender@example.com" for u in client.get("/api/v1/admin/users", headers=a).json())
        lender_token = client.post("/api/v1/auth/login", json={
            "email": "new-lender@example.com", "password": "new-lender-password"
        }).json()["access_token"]
        l = {"Authorization": f"Bearer {lender_token}"}
        assert client.get("/api/v1/lender/overview", headers=l).status_code == 200
        assert client.patch(f"/api/v1/admin/users/{result.json()['id']}/status",
                            json={"is_active": False}, headers=a).status_code == 200
        assert client.get("/api/v1/lender/overview", headers=l).status_code == 401
        assert client.post("/api/v1/auth/login", json={
            "email": "new-lender@example.com", "password": "new-lender-password"
        }).status_code == 401
        admin_id = client.get("/api/v1/auth/me", headers=a).json()["id"]
        assert client.patch(f"/api/v1/admin/users/{admin_id}/status", json={"is_active": False}, headers=a).status_code == 400


def test_password_change_revokes_all_sessions():
    with TestClient(app) as client:
        old_credentials = {"email": "logout-worker@example.com", "password": "strong-worker-password"}
        tokens = [client.post("/api/v1/auth/login", json=old_credentials).json()["access_token"] for _ in range(2)]
        a, b = ({"Authorization": f"Bearer {token}"} for token in tokens)
        assert client.post("/api/v1/auth/change-password", headers=a, json={
            "current_password": "wrong-password", "new_password": "my-new-strong-password"
        }).status_code == 400
        assert client.post("/api/v1/auth/change-password", headers=a, json={
            "current_password": "strong-worker-password", "new_password": "my-new-strong-password"
        }).status_code == 200
        assert client.get("/api/v1/auth/me", headers=a).status_code == 401
        assert client.get("/api/v1/auth/me", headers=b).status_code == 401
        assert client.post("/api/v1/auth/login", json=old_credentials).status_code == 401
        assert client.post("/api/v1/auth/login", json={
            "email": old_credentials["email"], "password": "my-new-strong-password"
        }).status_code == 200


def test_no_data_leaks_on_invalid_or_forged_sessions():
    from app.core.config import get_settings
    import jwt
    with TestClient(app) as client:
        assert client.get("/api/v1/admin/users").status_code == 401
        # JWT signed with valid secret still fails if no corresponding auth_session.
        forged = jwt.encode({"sub": "unknown", "jti": "fake-session", "iss": "earnscore-api",
                             "iat": 2000000000, "exp": 2200000000}, get_settings().jwt_secret, algorithm="HS256")
        assert client.get("/api/v1/auth/me", headers={"Authorization": f"Bearer {forged}"}).status_code == 401


def test_overviews_do_not_present_unimplemented_financial_data_as_zero():
    with TestClient(app) as client:
        worker_token = client.post('/api/v1/auth/login', json={
            'email':'attempted-admin@example.com', 'password':'very-secure-password'
        }).json()['access_token']
        data = client.get('/api/v1/worker/overview',headers={'Authorization':f'Bearer {worker_token}'}).json()
        assert data['score'] is None
        assert data['income_sources'] is None
        lender_token = client.post('/api/v1/auth/login',json={
            'email':'lender-test@example.com','password':'test-lender-password'
        }).json()['access_token']
        lender = client.get('/api/v1/lender/overview', headers={'Authorization':f'Bearer {lender_token}'}).json()
        assert lender['assigned_cases'] is None
        assert lender['pending_reviews'] is None
        assert lender['decisions'] is None
        admin_token = client.post('/api/v1/auth/login',json={
            'email':'admin-test@example.com','password':'test-admin-password'
        }).json()['access_token']
        admin = client.get('/api/v1/admin/overview', headers={'Authorization':f'Bearer {admin_token}'}).json()
        assert admin['models'] is None
        assert isinstance(admin['events'], int)


def test_lender_access_requires_scoped_consent_and_revocation():
    """Application access tests use SQLite; PostgreSQL RLS is separate integration coverage."""
    from datetime import timedelta
    from app.models.entities import Assessment, Report, Consent

    with TestClient(app) as client:
        def register(email):
            payload = {"email": email, "full_name": "Test Worker", "password": "very-safe-test-password"}
            assert client.post("/api/v1/auth/register", json=payload).status_code == 201
            token = client.post("/api/v1/auth/login", json={"email": email, "password": payload["password"]}).json()["access_token"]
            return {"Authorization": f"Bearer {token}"}

        worker = register("consenting-worker@example.com")
        other_worker = register("other-consenting-worker@example.com")
        with SessionLocal() as db:
            owner = db.query(User).filter(User.email == "consenting-worker@example.com").one()
            lender = User(email="grant-lender@example.com", full_name="Grant Lender", role="lender",
                          password_hash=hash_password("grant-lender-password"))
            stranger = User(email="stranger-lender@example.com", full_name="Stranger Lender", role="lender",
                            password_hash=hash_password("stranger-password"))
            db.add_all([lender, stranger])
            db.flush()
            assessment = Assessment(user_id=owner.id, status="completed", model_version="fictional-v0", score=790)
            db.add(assessment)
            db.flush()
            report = Report(assessment_id=assessment.id, version=1, status="ready")
            db.add(report)
            db.commit()
            aid, rid, lid = assessment.id, report.id, lender.id
        lender_login = client.post("/api/v1/auth/login", json={"email": "grant-lender@example.com", "password": "grant-lender-password"}).json()
        stranger_login = client.post("/api/v1/auth/login", json={"email": "stranger-lender@example.com", "password": "stranger-password"}).json()
        lender_h = {"Authorization": f"Bearer {lender_login['access_token']}"}
        stranger_h = {"Authorization": f"Bearer {stranger_login['access_token']}"}
        lender_assessment = f"/api/v1/lender/assessments/{aid}"
        lender_report = f"/api/v1/lender/reports/{rid}"
        assert client.get(lender_assessment, headers=lender_h).status_code == 404
        assert client.get(lender_report, headers=lender_h).status_code == 404
        assert client.get(f"/api/v1/worker/assessments/{aid}", headers=other_worker).status_code == 404
        assert client.post("/api/v1/worker/consents", headers=lender_h,
                           json={"scopes": ["report"]}).status_code == 403

        consent_r = client.post("/api/v1/worker/consents", headers=worker,
                                json={"scopes": ["assessment", "report"]})
        assert consent_r.status_code == 201
        cid = consent_r.json()["id"]
        payload = {"assessment_id": aid, "consent_id": cid, "lender_id": lid,
                   "scopes": ["assessment", "report"], "expires_in_days": 7}
        assert client.post("/api/v1/worker/access-grants", headers=other_worker, json=payload).status_code == 404
        assert client.post("/api/v1/worker/access-grants", headers=worker,
                           json={**payload, "scopes": ["assessment", "decision"]}).status_code == 400
        issued = client.post("/api/v1/worker/access-grants", headers=worker, json=payload)
        assert issued.status_code == 201
        gid = issued.json()["id"]
        assert client.get(lender_assessment, headers=lender_h).json()["score"] == 790
        assert client.get(lender_report, headers=lender_h).status_code == 200
        assert client.get(lender_assessment, headers=stranger_h).status_code == 404
        assert client.get(lender_report, headers=stranger_h).status_code == 404
        assert client.post(f"/api/v1/worker/access-grants/{gid}/revoke", headers=other_worker).status_code == 404
        assert client.post(f"/api/v1/worker/access-grants/{gid}/revoke", headers=worker).status_code == 200
        assert client.get(lender_assessment, headers=lender_h).status_code == 404
        assert client.get(lender_report, headers=lender_h).status_code == 404

        # Revoking parent consent invalidates every associated grant.
        grant2 = client.post("/api/v1/worker/access-grants", headers=worker, json=payload)
        assert grant2.status_code == 201
        assert client.get(lender_report, headers=lender_h).status_code == 200
        assert client.post(f"/api/v1/worker/consents/{cid}/revoke", headers=worker).status_code == 200
        assert client.get(lender_report, headers=lender_h).status_code == 404
        assert client.post("/api/v1/worker/access-grants", headers=worker, json=payload).status_code == 400
