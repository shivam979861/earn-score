"""Import API and parser safety tests. Uses existing isolated SQLite test database."""
import io

from fastapi.testclient import TestClient
from app.main import app
from app.core.database import SessionLocal
from app.models.entities import Transaction, Upload
from app.services_ingestion import ImportValidationError, parse_statement


def worker(client, email):
    creds = {"email": email, "password": "very-safe-test-password", "full_name": "CSV Worker"}
    r = client.post("/api/v1/auth/register", json=creds)
    assert r.status_code == 201, r.text
    token = client.post("/api/v1/auth/login", json=creds).json()["access_token"]
    return {"Authorization": f"Bearer {token}"}


def post_csv(client, auth, content, name="test.csv", mapping=None):
    data = {"mapping": mapping} if mapping is not None else {}
    return client.post("/api/v1/worker/uploads", headers=auth,
                       data=data, files={"file": (name, content, "text/csv")})


def test_parsing_normalization_and_duplicate_review():
    data = """date,description,amount,category,source,transaction_id
2026-10-01, Swiggy Payout ,"₹1,500.00",Income,Swiggy,REF-11
01/10/2026,Swiggy Payout,1500.00,Income,Swiggy,REF-11
02/10/2026,Self transfer,10000,Transfer,Bank,SELF
03/10/2026,Travel,(-350),Expense,Bank,FUEL
04/10/2026,Unknown credit,200,Other,Bank,X
invalid,Invalid date,100,Income,Bank,Y
""".replace('(-350)', '(350)')
    result = parse_statement(data.encode())
    assert result.count == 6 and len(result.rows) == 5 and len(result.invalid) == 1
    assert result.rows[0].amount == result.rows[1].amount
    assert result.rows[0].duplicate and result.rows[1].duplicate
    assert result.rows[2].classification == "transfer"
    assert result.rows[3].amount == -350
    assert result.rows[4].classification == "unknown" and result.rows[4].issues


def test_import_api_stores_clean_data_unverified_and_keeps_duplicates():
    csv = b"date,description,amount,source,transaction_id\n2026-10-01,Swiggy Payout,1000,Swiggy,A1\n2026-10-01,Swiggy Payout,1000.00,Swiggy,A1\n2026-10-02,Refund,200,Bank,R\n2026-10-03,Fuel,-250,Bank,B\nwrong,broken,19,Bank,W\n"
    with TestClient(app) as client:
        a = worker(client, "csv-import-a@example.com")
        b = worker(client, "csv-import-b@example.com")
        assert post_csv(client, {}, csv).status_code == 401
        response = post_csv(client, a, csv)
        assert response.status_code == 201, response.text
        body = response.json()
        assert (body["row_count"],body["valid_count"],body["invalid_count"],body["duplicate_count"]) == (5,4,1,2)
        assert body["review_count"] >= 3
        assert body["summary"]["possible_income"] == "0"
        assert body["verification_status"] == "unverified" and not body["raw_file_stored"]
        assert post_csv(client, a, csv).status_code == 409
        assert client.get("/api/v1/worker/uploads", headers=b).json() == []
        assert client.get(f"/api/v1/worker/uploads/{body['id']}/transactions", headers=b).status_code == 404
        assert client.get("/api/v1/worker/uploads", headers=a).json()[0]["valid_count"] == 4
        records = client.get(f"/api/v1/worker/uploads/{body['id']}/transactions", headers=a).json()["transactions"]
        assert len(records) == 4 and all(r["verification_status"] == "unverified" for r in records)
        assert sum(r["potential_duplicate"] for r in records) == 2
        with SessionLocal() as db:
            upload = db.get(Upload, body["id"])
            assert upload.storage_key == "not-stored"
            assert db.query(Transaction).filter(Transaction.upload_id == upload.id).count() == 4


def test_bank_credit_debit_mapping_and_across_file_dedup():
    with TestClient(app) as client:
        a = worker(client, "csv-match-a@example.com")
        f1 = b"date,description,amount,source,transaction_id\n2026-10-01,Platform payout,1550,App,ID01\n"
        f2 = b"date,narration,credit,debit,source,reference\n02/10/2026,Platform payout,1550,,App,ID01\n03/10/2026,Petrol,,300,Bank,ID02\n"
        first = post_csv(client, a, f1)
        assert first.status_code == 201, first.text
        second = post_csv(client, a, f2)
        assert second.status_code == 201, second.text
        assert second.json()["duplicate_count"] == 1
        first_rows = client.get(f"/api/v1/worker/uploads/{first.json()['id']}/transactions", headers=a).json()
        assert first_rows["transactions"][0]["potential_duplicate"]
        assert first_rows["upload"]["duplicate_count"] == 1
        second_rows = client.get(f"/api/v1/worker/uploads/{second.json()['id']}/transactions", headers=a).json()["transactions"]
        assert second_rows[1]["amount"] == "-300.00"


def test_bad_files_and_mapping_are_rejected_without_persistence():
    with TestClient(app) as client:
        a = worker(client, "csv-bad-a@example.com")
        csv = b"date,description,amount\n2026-10-01,good,100\n"
        for payload, filename, status in [
            (b"", "empty.csv", 413),
            (b"123", "not-csv.txt", 400),
            (b"date,description,amount\n2026-10-01,broken,\"oops", "broken.csv", 422),
            (b"date,description,amount\n2026-10-01,good,0\n", "zero.csv", 422),
            (b"date,description,amount\n2026-10-01,good,10,extra\n", "ragged.csv", 422),
        ]:
            r = post_csv(client, a, payload, filename)
            assert r.status_code == status, (filename, r.text)
        bad_mapping = '{"date":0,"description":0,"amount":2,"credit":-1,"debit":-1,"category":-1,"source":-1,"transactionId":-1}'
        assert post_csv(client, a, csv, mapping=bad_mapping).status_code == 422
        assert post_csv(client, a, b"x" * (2*1024*1024+1)).status_code == 413
        assert client.get("/api/v1/worker/uploads", headers=a).json() == []
