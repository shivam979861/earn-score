"""Import untrusted, self-reported CSV statements into normalized candidate rows.

Parsing, financial categorization and duplicate hints are NOT bank verification.
No user-supplied CSV text is evaluated or trusted as independently verified.
"""
import csv
from datetime import date, datetime, timezone
from decimal import Decimal, InvalidOperation
from hashlib import sha256
from io import StringIO
import json
import re
from dataclasses import dataclass, field

MAX_BYTES = 2 * 1024 * 1024
MAX_ROWS = 10_000
FIELDS = ("date", "description", "amount", "credit", "debit", "category", "source", "transactionId")
ALIASES = {
    "date": ("date", "transaction_date", "posted_date", "value_date", "txn_date", "trans_date", "posting_date"),
    "description": ("description", "narration", "details", "merchant", "transaction_details", "particulars", "transaction_description", "remarks"),
    "amount": ("amount", "transaction_amount", "txn_amount", "net_amount"),
    "credit": ("credit", "credit_amount", "deposit", "deposits", "money_in", "paid_in", "cr"),
    "debit": ("debit", "debit_amount", "withdrawal", "withdrawals", "money_out", "paid_out", "dr"),
    "category": ("category", "transaction_type", "type", "tag"),
    "source": ("source", "platform", "account", "account_name", "bank"),
    "transactionId": ("transaction_id", "reference", "reference_number", "reference_no", "transaction_reference", "txn_id", "utr", "id"),
}


class ImportValidationError(ValueError):
    pass


def clean_header(s: str) -> str:
    return re.sub(r"^_|_$", "", re.sub(r"[^a-z0-9]+", "_", s.strip().lower()))


def normalize_text(s: str) -> str:
    return " ".join(s.lower().split())


def infer_mapping(headers: list[str]) -> dict[str, int]:
    canonical = [clean_header(h) for h in headers]
    return {key: next((canonical.index(alias) for alias in ALIASES[key] if alias in canonical), -1) for key in FIELDS}


def validate_mapping(mapping: dict, num_columns: int) -> dict[str, int]:
    if not isinstance(mapping, dict) or set(mapping) != set(FIELDS):
        raise ImportValidationError("Column mapping must include all eight supported field names.")
    if any(type(i) is not int or i < -1 or i >= num_columns for i in mapping.values()):
        raise ImportValidationError("Column mapping includes an invalid index.")
    selected = {k: v for k, v in mapping.items() if v >= 0 and (mapping["amount"] < 0 or k not in ("credit", "debit"))}
    if len(set(selected.values())) != len(selected):
        raise ImportValidationError("Each mapped field must use a different CSV column.")
    if mapping["date"] < 0 or mapping["description"] < 0 or (
        mapping["amount"] < 0 and (mapping["credit"] < 0 or mapping["debit"] < 0)
    ):
        raise ImportValidationError("Map date, description and either signed amount or both credit and debit.")
    return mapping


def parse_date(raw: str) -> date | None:
    value = raw.strip()
    for fmt in ("%Y-%m-%d", "%Y/%m/%d", "%d/%m/%Y", "%d-%m-%Y"):
        try:
            d = datetime.strptime(value, fmt).date()
            return d if 1900 <= d.year <= 2100 else None
        except ValueError:
            pass
    return None


def parse_amount(raw: str) -> Decimal | None:
    s = raw.strip()
    if not s:
        return None
    negative = s.startswith("-") or (s.startswith("(") and s.endswith(")")) or bool(re.search(r"\sDR$", s, re.I))
    s = re.sub(r"\s*(DR|CR)$", "", s, flags=re.I)
    s = re.sub(r"[₹,\s]", "", s).strip("()")
    s = s.lstrip("+-")
    if not re.fullmatch(r"\d+(?:\.\d{1,2})?", s):
        return None
    try:
        amount = Decimal(s)
    except InvalidOperation:
        return None
    if amount == 0 or amount >= Decimal("1000000000000"):
        return None
    amount = amount.quantize(Decimal("0.01"))
    return -amount if negative else amount


def classify(description: str, category: str, amount: Decimal) -> str:
    label = normalize_text(category + " " + description)
    if re.search(r"transfer|own.?account|self.?transfer|internal transfer", label):
        return "transfer"
    if amount < 0:
        return "expense"
    if re.search(r"refund|reversal|loan.?disburs|cashback|gift|reimburs|interest.?paid", label):
        return "unknown"
    if re.search(r"income|earning|payout|salary|revenue|freelanc|invoice paid|client payment|service fee", label):
        return "income"
    return "unknown"


def sha_value(*parts: str) -> str:
    return sha256(json.dumps(parts, ensure_ascii=False, separators=(",", ":")).encode("utf-8")).hexdigest()


@dataclass
class CleanRow:
    line: int
    date: date
    description: str
    amount: Decimal
    source: str
    reference: str
    classification: str
    fingerprint: str
    reference_key: str | None
    issues: list[str] = field(default_factory=list)
    duplicate: bool = False

    def flag(self, reason: str) -> None:
        if reason not in self.issues:
            self.issues.append(reason)
        if "duplicate" in reason.lower() or "repeated" in reason.lower():
            self.duplicate = True


@dataclass
class ImportResult:
    rows: list[CleanRow]
    invalid: list[dict]
    count: int
    mapping: dict[str, int]


def parse_statement(raw_bytes: bytes, mapping_json: str | None = None) -> ImportResult:
    if not raw_bytes or len(raw_bytes) > MAX_BYTES:
        raise ImportValidationError("CSV must be nonempty and no larger than 2 MB.")
    try:
        content = raw_bytes.decode("utf-8-sig")
    except UnicodeDecodeError as exc:
        raise ImportValidationError("Use a UTF-8 encoded CSV file.") from exc
    # Do not allow giant individual fields to consume unbounded memory.
    csv.field_size_limit(100_000)
    try:
        parser = csv.reader(StringIO(content, newline=""), strict=True)
        data = [(parser.line_num, [cell.strip() for cell in values]) for values in parser if any(c.strip() for c in values)]
    except (csv.Error, UnicodeError) as exc:
        raise ImportValidationError("CSV formatting is invalid or contains broken quoting.") from exc
    if len(data) < 2:
        raise ImportValidationError("CSV must include a header and at least one transaction.")
    if len(data) - 1 > MAX_ROWS:
        raise ImportValidationError("Limit each import to 10,000 transaction rows.")
    headers = data[0][1]
    if len(headers) > 100 or len(headers) < 2 or len({clean_header(h) for h in headers}) != len(headers):
        raise ImportValidationError("CSV must have distinct column headings (maximum 100 columns).")
    try:
        chosen = infer_mapping(headers) if not mapping_json else json.loads(mapping_json)
    except (json.JSONDecodeError, TypeError) as exc:
        raise ImportValidationError("Column mapping is not valid JSON.") from exc
    mapping = validate_mapping(chosen, len(headers))
    rows: list[CleanRow] = []
    invalid: list[dict] = []
    for line, parts in data[1:]:
        if len(parts) != len(headers):
            invalid.append({"line": line, "reason": f"Expected {len(headers)} columns, received {len(parts)}"})
            continue
        def get(key: str) -> str:
            i = mapping[key]
            return parts[i] if i >= 0 and i < len(parts) else ""
        d = parse_date(get("date"))
        desc = " ".join(get("description").split())
        if mapping["amount"] >= 0:
            amount = parse_amount(get("amount"))
        else:
            credit_raw, debit_raw = get("credit"), get("debit")
            credit = parse_amount(credit_raw) if credit_raw else Decimal(0)
            debit = parse_amount(debit_raw) if debit_raw else Decimal(0)
            if credit is None or debit is None or credit < 0 or debit < 0 or (credit > 0 and debit > 0) or (credit == 0 and debit == 0):
                amount = None
            else:
                amount = credit - debit
        reason = ("Invalid date" if d is None else "Missing description" if not desc else "Invalid or ambiguous amount" if amount is None else None)
        if reason:
            invalid.append({"line": line, "reason": reason})
            continue
        source = " ".join(get("source").split())[:100] or "Unspecified"
        reference = " ".join(get("transactionId").split())[:100]
        classification = classify(desc, get("category"), amount)
        content_key = sha_value(d.isoformat(), str(amount), normalize_text(desc), normalize_text(source))
        reference_key = sha_value(normalize_text(source), normalize_text(reference)) if reference else None
        row = CleanRow(line, d, desc[:250], amount, source, reference, classification, content_key, reference_key)
        if classification == "transfer":
            row.flag("Transfer is not earned income")
        elif classification == "unknown" and amount > 0:
            row.flag("Credit requires income-source review")
        if d > datetime.now(timezone.utc).date():
            row.flag("Transaction date is in the future")
        rows.append(row)
    if not rows:
        raise ImportValidationError("No valid transactions found; inspect the mapping and CSV values.")
    # All members of a suspected repeated group are flagged, not discarded.
    by_ref: dict[str, list[CleanRow]] = {}
    by_fingerprint: dict[str, list[CleanRow]] = {}
    for row in rows:
        if row.reference_key:
            by_ref.setdefault(row.reference_key, []).append(row)
        by_fingerprint.setdefault(row.fingerprint, []).append(row)
    for group in by_ref.values():
        if len(group) > 1:
            for row in group:
                row.flag("Repeated transaction reference in this file — possible duplicate")
    for group in by_fingerprint.values():
        if len(group) > 1:
            for row in group:
                row.flag("Repeated date, amount, description and source — possible duplicate")
    return ImportResult(rows=rows, invalid=invalid, count=len(data) - 1, mapping=mapping)
