from decimal import Decimal
from fastapi.testclient import TestClient
from app.main import app
from app.services_reconciliation import categorize
from test_ingestion import worker


def test_categories():
    assert categorize("Loan disbursement", "Income", Decimal(1000))[0] == "loan_proceeds"
    assert categorize("EMI payment", "", Decimal(-100))[0] == "debt_payment"
    assert categorize("Refund", "income", Decimal(100))[0] == "refund_reversal"
    assert categorize("Self transfer", "Income", Decimal(100))[0] == "transfer"
    assert categorize("Swiggy settlement", "", Decimal(100))[0] == "gig_earnings"


def test_reconciliation_api():
    with TestClient(app) as client:
        a = worker(client, "reconcile-a@example.com")
        b = worker(client, "reconcile-b@example.com")
        def upload(kind, lines):
            data = ("date,description,amount,source,transaction_id\n" + lines).encode()
            return client.post("/api/v1/worker/uploads", headers=a, data={"source_kind": kind}, files={"file": ("test.csv", data, "text/csv")})
        assert upload("fake", "2026-10-01,Swiggy payout,1500,Swiggy,P1\n").status_code == 422
        assert upload("platform", "2026-10-01,Swiggy payout,1500,Swiggy,P1\n2026-10-02,Zomato payout,100,Zomato,P2\n2026-10-03,Uber payout,500,Uber,P3\n").status_code == 201
        assert upload("bank", "2026-10-02,Swiggy payout,1500,Swiggy,P1\n2026-10-03,Zomato payout,100,Bank,B1\n2026-10-04,Zomato payout,100,Bank,B2\n2026-10-10,Uber payout,500,Bank,B3\n").status_code == 201
        assert client.get("/api/v1/worker/reconciliation").status_code == 401
        assert client.get("/api/v1/worker/reconciliation", headers=b).json()["summary"]["records"] == 0
        result = client.get("/api/v1/worker/reconciliation", headers=a).json()
        assert result["summary"]["matched_pairs"] == 1
        assert Decimal(result["summary"]["matched_amount"]) == 1500
        assert sum(r["status"] == "ambiguous" for r in result["rows"]) == 3
        assert sum(r["status"] == "unmatched" for r in result["rows"]) == 2
        assert all(r["verification_status"] == "unverified" for r in result["rows"])
