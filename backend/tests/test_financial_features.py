from datetime import date
from decimal import Decimal
from fastapi.testclient import TestClient
from app.main import app
from app.services_financial_features import calculate_features
from test_ingestion import worker


def row(day, amount, cat="gig_earnings", kind="bank", status="matched", payer="swiggy", flags=()):
    return {"date": day, "amount": str(amount), "category": cat, "source_kind": kind, "status": status, "payer": payer, "flags": list(flags)}


def test_features_observed_only():
    rows = [row("2026-01-10",1000), row("2026-01-09",1000,kind="platform"), row("2026-02-10",2000,payer="zomato"), row("2026-03-10",3000), row("2026-03-12",-500,"expense",status="not_applicable"), row("2026-03-13",-250,"debt_payment",status="not_applicable"), row("2026-02-14",9000,status="ambiguous"), row("2026-02-15",400,status="needs_review",flags=["duplicate"]), row("2026-04-10",100,cat="transfer",status="not_applicable"), row("2027-01-01",999999)]
    r=calculate_features({"version":"test","rows":rows},date(2026,4,30))
    m=r["metrics"]
    assert Decimal(m["eligible_income"])==6000
    assert Decimal(m["average_observed_earnings"])==2000
    assert m["volatility_pct"]==40.82 and m["income_change_pct"]==200
    assert m["income_observation_rate_pct"]==75
    assert m["largest_payer_share_pct"]==66.67
    assert Decimal(m["observed_residual"])==2250 and m["observed_debt_to_income_pct"]==8.33
    assert r["window"]["missing_months"]==["2025-11","2025-12"]
    assert r["monthly"][-1]["eligible_income"] is None
    assert r["future_records"]==1 and not r["verified"]
    assert r["excluded"]["review_required"]==2


def test_features_missing_data():
    r=calculate_features({"version":"test","rows":[row("2026-01-10",1000),row("2026-03-10",2000),row("2026-04-10",3000)]},date(2026,4,30))
    assert r["metrics"]["volatility_pct"] is None
    assert r["metrics"]["observed_debt_to_income_pct"] is None
    assert r["metrics"]["observed_residual"] is None
    assert r["monthly"][-3]["eligible_income"] is None
    r=calculate_features({"version":"test","rows":[row("2026-01-10",1000,kind="platform")]},date(2026,4,30))
    assert r["status"]=="insufficient_data" and r["metrics"]["eligible_income"] is None


def test_features_api_worker_isolation():
    with TestClient(app) as client:
        a=worker(client,"features-a@example.com")
        b=worker(client,"features-b@example.com")
        endpoint="/api/v1/worker/financial-features"
        assert client.get(endpoint).status_code==401
        for kind, day, ref in [("platform","2026-01-01","P1"),("bank","2026-01-02","B1")]:
            csv=f"date,description,amount,source,transaction_id\n{day},Swiggy payout,1500,Swiggy,{ref}\n"
            res=client.post("/api/v1/worker/uploads",headers=a,data={"source_kind":kind},files={"file":("test.csv",csv,"text/csv")})
            assert res.status_code==201, res.text
        result=client.get(endpoint,headers=a)
        assert result.status_code==200, result.text
        assert Decimal(result.json()["metrics"]["eligible_income"])==1500
        assert client.get(endpoint,headers=b).json()["status"]=="insufficient_data"
