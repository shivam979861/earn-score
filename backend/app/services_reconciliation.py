"""Deterministic self-reported evidence analysis, never external verification."""
from collections import defaultdict
from datetime import timedelta
from decimal import Decimal
import re

VERSION = "reconciliation-v1"
SOURCE_KINDS = {"bank", "platform", "unknown"}
PLATFORMS = ("swiggy", "zomato", "zepto", "blinkit", "uber", "ola", "rapido", "urban company", "upwork", "fiverr", "dunzo", "porter")


def identify_payer(description, source):
    text = f"{description} {source}".lower()
    matches = [p for p in PLATFORMS if re.search(r"\b" + re.escape(p) + r"\b", text)]
    return matches[0] if len(matches) == 1 else None


def categorize(description, category, amount):
    text = f"{description} {category}".lower()
    # The user-provided category is a hint, never proof of income.
    if re.search(r"\b(refund|reversal|chargeback|cashback|reimburse\w*)\b", text):
        return "refund_reversal", "Refund, reversal or reimbursement wording"
    if re.search(r"\b(loan|emi|repayment|installment|instalment)\b", text):
        return ("loan_proceeds" if amount > 0 else "debt_payment"), "Loan or repayment wording"
    if re.search(r"\b(self[ -]?transfer|own account|internal transfer|personal transfer|transfer)\b", text):
        return "transfer", "Transfer wording; not assumed earned income"
    if amount < 0:
        return "expense", "Outgoing amount; purpose inferred from narration"
    if re.search(r"\b(gift|interest|cash deposit|cash withdrawal)\b", text):
        return "other_credit", "Non-earnings or unclear credit wording"
    if re.search(r"\b(payout|settlement|earnings?|delivery payment|gig income)\b", text):
        return "gig_earnings", "Payout or earnings wording; payer not independently verified"
    if re.search(r"\b(freelanc\w*|invoice paid|client payment|service fee)\b", text):
        return "freelance_income", "Client or freelance payment wording"
    if re.search(r"\b(salary|wages)\b", text):
        return "salary", "Salary or wages wording"
    if re.search(r"\b(income|revenue)\b", text):
        return "claimed_income", "Income label supplied by applicant; review supporting evidence"
    return "unknown_credit", "No clear earnings or non-earnings signal"


EARNINGS = {"gig_earnings", "freelance_income", "salary", "claimed_income"}


def analyze(records):
    """Records are (Transaction, Upload source_kind). Unique exact amount/payer,
    bank date 0–3 days after payout. Ambiguous or flagged rows never auto-pair.
    No amount is counted twice; matched totals are not added to bank totals.
    """
    rows = []
    index = {"bank": defaultdict(list), "platform": defaultdict(list)}
    for t, kind in records:
        amount = Decimal(str(t.amount))
        category, reason = categorize(t.description, t.category_hint, amount)
        payer = identify_payer(t.description, t.source_name)
        flags = list(t.review_reasons or [])
        if category == "unknown_credit":
            flags.append("Unclear credit purpose")
        if kind == "unknown":
            flags.append("Statement type not declared")
        row = {"id": t.id, "upload_id": t.upload_id, "date": t.occurred_at.date().isoformat(),
               "description": t.description, "source": t.source_name, "source_kind": kind,
               "reference": t.transaction_ref, "amount": str(amount), "category": category,
               "classification_reason": reason, "payer": payer, "flags": list(dict.fromkeys(flags)),
               "verification_status": "unverified", "status": "not_applicable", "match_id": None}
        eligible = category in EARNINGS and amount > 0 and not t.potential_duplicate and not flags
        if category in EARNINGS and amount > 0:
            row["status"] = "needs_review" if not eligible or not payer or kind == "unknown" else "unmatched"
            if eligible and payer and kind in index:
                index[kind][(payer, amount, t.occurred_at.date())].append(row)
        elif flags or t.potential_duplicate:
            row["status"] = "needs_review"
        rows.append(row)
    # At most four buckets per row. Only keep a single candidate if unique.
    def candidates(row, other, direction):
        from datetime import date
        day = date.fromisoformat(row["date"])
        count = 0
        candidate = None
        for i in range(4):
            group = index[other].get((row["payer"], Decimal(row["amount"]), day + timedelta(days=i * direction)), [])
            count += len(group)
            if len(group) == 1:
                candidate = group[0]
        return count, candidate
    pairs = []
    for group in index["platform"].values():
        for payout in group:
            count, bank = candidates(payout, "bank", 1)
            if count == 0:
                continue
            if count != 1 or candidates(bank, "platform", -1)[0] != 1:
                payout["status"] = "ambiguous"
                continue
            payout["status"] = bank["status"] = "matched"
            payout["match_id"], bank["match_id"] = bank["id"], payout["id"]
            pairs.append({"platform_id": payout["id"], "bank_id": bank["id"], "payer": payout["payer"], "amount": payout["amount"], "reason": "Unique exact amount and payer; deposit within 0–3 days of payout"})
    for group in index["bank"].values():
        for bank in group:
            if bank["status"] == "unmatched" and candidates(bank, "platform", -1)[0] > 0:
                bank["status"] = "ambiguous"
    for row in rows:
        if row["status"] == "ambiguous":
            row["flags"].append("Multiple possible counterparts; no automatic match")
        elif row["status"] == "unmatched":
            row["flags"].append("No matching eligible record from the other source")
        elif row["status"] == "needs_review" and not row["flags"]:
            row["flags"].append("Payer identity or duplicate status needs review")
    return {"version": VERSION, "rows": rows, "pairs": pairs, "summary": {
        "records": len(rows), "matched_pairs": len(pairs),
        "matched_amount": str(sum((Decimal(p["amount"]) for p in pairs), Decimal(0))),
        "review_count": sum(r["status"] in {"ambiguous", "needs_review", "unmatched"} for r in rows),
        "verified_count": 0,
    }}
