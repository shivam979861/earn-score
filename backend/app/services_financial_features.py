"""Provisional descriptive metrics, not verified income or credit decisions."""
from collections import defaultdict
from datetime import date
from decimal import Decimal
from app.services_reconciliation import EARNINGS

VERSION = "financial-features-v1"
ZERO = Decimal(0)
UNMATCHED_FLAG = "No matching eligible record from the other source"


def money(v):
    return None if v is None else str(v.quantize(Decimal("0.01")))


def percent(n, d):
    return None if not d else float((100 * n / d).quantize(Decimal("0.01")))


def calculate_features(analysis, today=None):
    """Six calendar months ending at latest nonfuture bank record. No full
    statement coverage inferred. Platform rows never contribute cash amounts.
    """
    today = today or date.today()
    rows = analysis["rows"]
    bank = [r for r in rows if r["source_kind"] == "bank" and date.fromisoformat(r["date"]) <= today]
    future = sum(date.fromisoformat(r["date"]) > today for r in rows)
    months = []
    sources = defaultdict(Decimal)
    excluded = defaultdict(int)
    if bank:
        end = max(date.fromisoformat(r["date"]) for r in bank)
        idx = end.year * 12 + end.month - 1
        for i in range(idx - 5, idx + 1):
            y, m = divmod(i, 12)
            months.append({"month": f"{y:04d}-{m+1:02d}", "records": 0, "eligible": 0,
                           "income": ZERO, "expense": ZERO, "debt": ZERO,
                           "expense_records": 0, "debt_records": 0, "held": 0})
    by_month = {m["month"]: m for m in months}
    for r in rows:
        if date.fromisoformat(r["date"]) > today:
            excluded["future_dated"] += 1
            continue
        if r["source_kind"] != "bank":
            excluded["non_bank_evidence"] += 1
            continue
        m = by_month.get(r["date"][:7])
        if m is None:
            excluded["outside_window"] += 1
            continue
        m["records"] += 1
        amt = Decimal(r["amount"])
        flags = set(r["flags"]) - {UNMATCHED_FLAG}
        if flags or r["status"] in {"ambiguous", "needs_review"}:
            m["held"] += 1
            excluded["review_required"] += 1
            continue
        cat = r["category"]
        if amt > 0 and cat in EARNINGS and r["status"] in {"matched", "unmatched"} and r["payer"]:
            m["income"] += amt
            m["eligible"] += 1
            sources[r["payer"]] += amt
        elif amt < 0 and cat in {"expense", "debt_payment"}:
            key = "expense" if cat == "expense" else "debt"
            m[key] += -amt
            m[key + "_records"] += 1
        else:
            excluded["not_eligible_income_or_cost"] += 1
    active = [m for m in months if m["records"]]
    earning = [m for m in months if m["eligible"]]
    total = sum((m["income"] for m in earning), ZERO)
    avg = total / len(earning) if earning else None
    # Volatility/trend only on a contiguous run of at least 3 earning-observed months.
    consecutive = len(earning) >= 3 and all(m["eligible"] for m in months[months.index(earning[0]):months.index(earning[-1])+1])
    volatility = trend = None
    if consecutive and avg:
        variance = sum(((m["income"] - avg) ** 2 for m in earning), ZERO) / len(earning)
        volatility = percent(variance.sqrt(), avg)
        trend = percent(earning[-1]["income"] - earning[0]["income"], earning[0]["income"])
    paired = [m for m in earning if m["expense_records"] and m["debt_records"] and not m["held"]]
    residual = (sum((m["income"] - m["expense"] - m["debt"] for m in paired), ZERO) / len(paired)) if paired else None
    debt_months = [m for m in earning if m["debt_records"] and not m["held"]]
    debt_ratio = percent(sum((m["debt"] for m in debt_months), ZERO), sum((m["income"] for m in debt_months), ZERO)) if debt_months else None
    return {"version": VERSION, "reconciliation_version": analysis["version"], "status": "provisional" if earning else "insufficient_data", "currency": "INR", "verified": False,
            "window": {"start": months[0]["month"] if months else None, "end": months[-1]["month"] if months else None, "bank_observed_months": len(active), "earning_observed_months": len(earning), "missing_months": [m["month"] for m in months if not m["records"]], "full_coverage_confirmed": False},
            "metrics": {"eligible_income": money(total) if earning else None, "average_observed_earnings": money(avg), "income_observation_rate_pct": percent(Decimal(len(earning)), Decimal(len(active))), "volatility_pct": volatility, "income_change_pct": trend, "observed_residual": money(residual), "residual_months": len(paired), "observed_debt_to_income_pct": debt_ratio, "debt_observed_months": len(debt_months), "largest_payer_share_pct": percent(max(sources.values()), total) if sources else None},
            "monthly": [{"month": m["month"], "bank_records": m["records"], "eligible_income": money(m["income"]) if m["eligible"] else None, "observed_expenses": money(m["expense"]) if m["expense_records"] else None, "observed_debt_payments": money(m["debt"]) if m["debt_records"] else None, "held_records": m["held"]} for m in months],
            "payers": [{"payer": p, "income": money(a), "share_pct": percent(a, total)} for p, a in sorted(sources.items(), key=lambda x: (-x[1], x[0]))],
            "excluded": dict(excluded), "future_records": future,
            "limitations": ["Self-reported bank CSV only; no external verification or complete statement coverage.", "Only eligible recognized-payer bank credits count. Platform copies, transfers, ambiguous and flagged records are excluded; unmatched bank credits may still be provisional.", "Missing or non-earning months are unknown, not zero; averages use earning-observed months only.", "Volatility and change need at least three consecutive earning-observed months; monthly totals may be partial.", "Residual and debt ratio use only months with recorded relevant outflows and no held bank records. They do not establish complete spending, debt or affordability.", "No credit score, eligibility or loan decision is produced."]}
