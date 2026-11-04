/** Private browser-only CSV inspection. No uploads, verification, or persistence. */
export const MAX_CSV_ROWS = 10_000;
export const MAX_CSV_BYTES = 2 * 1024 * 1024;

export type ColumnKey = "date" | "description" | "amount" | "credit" | "debit" | "category" | "source" | "transactionId";
export type ColumnMapping = Record<ColumnKey, number>;
export type PreviewRow = {
  id: string;
  line: number;
  date: string;
  description: string;
  amount: number;
  category: string;
  source: string;
  transactionId: string;
  kind: "income" | "expense" | "transfer" | "unknown";
  potentialDuplicate: boolean;
  needsReview: boolean;
  issues: string[];
};
export type StatementPreview = {
  rows: PreviewRow[];
  skipped: number;
  skippedReasons: { line: number; reason: string }[];
  income: number;
  outflows: number;
  transfers: number;
  flagged: number;
  unknownCredits: number;
  dateRange: { from: string; to: string };
  sources: number;
  warnings: string[];
};

export function parseCSV(input: string): string[][] {
  const content = input.replace(/^\uFEFF/, "");
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  let justClosedQuote = false;
  for (let i = 0; i < content.length; i++) {
    const c = content[i];
    if (quoted) {
      if (c === '"' && content[i + 1] === '"') { cell += '"'; i++; }
      else if (c === '"') { quoted = false; justClosedQuote = true; }
      else cell += c;
    } else if (c === '"') {
      if (cell.trim() || justClosedQuote) throw new Error("Unexpected quote in CSV field. Check the file formatting.");
      quoted = true;
    } else if (c === ",") {
      row.push(cell.trim()); cell = ""; justClosedQuote = false;
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && content[i + 1] === "\n") i++;
      row.push(cell.trim());
      if (row.some(value => value !== "")) rows.push(row);
      row = []; cell = ""; justClosedQuote = false;
    } else if (justClosedQuote && c.trim()) {
      throw new Error("Text after a closing quote is not valid CSV.");
    } else if (!justClosedQuote) {
      cell += c;
    }
  }
  if (quoted) throw new Error("The file contains an unfinished quoted field.");
  row.push(cell.trim());
  if (row.some(value => value !== "")) rows.push(row);
  return rows;
}

function normalizeHeader(input: string): string {
  return input.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");
}

const aliases: Record<ColumnKey, string[]> = {
  date: ["date", "transaction_date", "posted_date", "value_date", "txn_date", "trans_date", "posting_date"],
  description: ["description", "narration", "details", "merchant", "transaction_details", "particulars", "transaction_description", "remarks"],
  amount: ["amount", "transaction_amount", "txn_amount", "net_amount"],
  credit: ["credit", "credit_amount", "deposit", "deposits", "money_in", "paid_in", "cr"],
  debit: ["debit", "debit_amount", "withdrawal", "withdrawals", "money_out", "paid_out", "dr"],
  category: ["category", "transaction_type", "type", "tag"],
  source: ["source", "platform", "account", "account_name", "bank"],
  transactionId: ["transaction_id", "reference", "reference_number", "reference_no", "transaction_reference", "txn_id", "utr", "id"],
};

export function detectColumns(headers: string[]): ColumnMapping {
  const normalized = headers.map(normalizeHeader);
  const mapping = {} as ColumnMapping;
  (Object.keys(aliases) as ColumnKey[]).forEach(key => {
    mapping[key] = aliases[key].map(alias => normalized.indexOf(alias)).find(index => index >= 0) ?? -1;
  });
  return mapping;
}

export function isMappingValid(mapping: ColumnMapping): boolean {
  const values = [mapping.date, mapping.description, mapping.amount >= 0 ? mapping.amount : mapping.credit, mapping.amount >= 0 ? -1 : mapping.debit].filter(v => v >= 0);
  return mapping.date >= 0 && mapping.description >= 0 &&
    (mapping.amount >= 0 || (mapping.credit >= 0 && mapping.debit >= 0)) &&
    new Set(values).size === values.length;
}

export function inspectStatement(csv: string): { headers: string[]; mapping: ColumnMapping; rowCount: number } {
  const raw = parseCSV(csv);
  if (raw.length < 2) throw new Error("Your CSV needs a header and at least one transaction row.");
  if (raw.length > MAX_CSV_ROWS + 1) throw new Error(`Preview up to ${MAX_CSV_ROWS.toLocaleString("en-IN")} transactions at once.`);
  const headers = raw[0].map((h, i) => h.trim() || `Column ${i + 1}`);
  if (new Set(headers.map(normalizeHeader)).size !== headers.length) throw new Error("Your CSV has duplicate column headings. Rename them and try again.");
  return { headers, mapping: detectColumns(headers), rowCount: raw.length - 1 };
}

function parseAmount(input: string): number | null {
  const raw = input.trim();
  if (!raw) return null;
  const negative = /^\(.*\)$/.test(raw) || /^-/.test(raw) || /\sDR$/i.test(raw);
  const clean = raw.replace(/^\(|\)$/g, "").replace(/\s*(?:DR|CR)$/i, "").replace(/[₹,\s]/g, "").replace(/^[-+]/, "");
  if (!/^\d+(?:\.\d{1,2})?$/.test(clean)) return null;
  const value = Number(clean);
  return Number.isFinite(value) && value > 0 ? (negative ? -value : value) : null;
}

function normalizeDate(input: string): string | null {
  const value = input.trim();
  let y: number; let m: number; let d: number;
  if (/^\d{4}[-/]\d{1,2}[-/]\d{1,2}$/.test(value)) [y, m, d] = value.split(/[-/]/).map(Number);
  else if (/^\d{1,2}[-/]\d{1,2}[-/]\d{4}$/.test(value)) [d, m, y] = value.split(/[-/]/).map(Number);
  else return null;
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() + 1 !== m || dt.getUTCDate() !== d || y < 1900 || y > 2100) return null;
  return `${y.toString().padStart(4, "0")}-${m.toString().padStart(2, "0")}-${d.toString().padStart(2, "0")}`;
}

function isTransfer(cat: string, desc: string) {
  return /transfer|own.?account|self.?transfer|internal transfer/.test((cat + " " + desc).toLowerCase());
}
function isOtherCredit(cat: string, desc: string) {
  return /refund|reversal|loan.?disburs|cashback|gift|reimburs|interest.?paid/.test((cat + " " + desc).toLowerCase());
}
function isEarnedIncome(cat: string, desc: string) {
  return /income|earning|payout|salary|revenue|freelanc|invoice paid|client payment|service fee/.test((cat + " " + desc).toLowerCase());
}

/** The amount field is signed; separate credit/debit fields are positive magnitudes. */
export function previewStatement(csv: string, override?: ColumnMapping): StatementPreview {
  const info = inspectStatement(csv);
  const mapping = override ?? info.mapping;
  if (!isMappingValid(mapping)) throw new Error("Required columns: date, description, and amount (or credit and debit). Match the fields below.");
  if (Object.values(mapping).some(index => index >= info.headers.length)) throw new Error("A selected column is missing from this file.");
  const raw = parseCSV(csv);
  const parsed: PreviewRow[] = [];
  const skippedReasons: { line: number; reason: string }[] = [];
  raw.slice(1).forEach((fields, i) => {
    const line = i + 2;
    const get = (key: ColumnKey) => mapping[key] < 0 ? "" : (fields[mapping[key]] ?? "").trim();
    const date = normalizeDate(get("date"));
    const description = get("description");
    let amount: number | null;
    if (mapping.amount >= 0) {
      amount = parseAmount(get("amount"));
    } else {
      const crRaw = get("credit"); const drRaw = get("debit");
      const credit = crRaw ? parseAmount(crRaw) : 0;
      const debit = drRaw ? parseAmount(drRaw) : 0;
      amount = credit === null || debit === null || credit < 0 || debit < 0 || (credit > 0 && debit > 0) || (credit === 0 && debit === 0) ? null : credit - debit;
    }
    if (!date || !description || amount === null) {
      skippedReasons.push({line, reason: !date ? "Invalid date (use YYYY-MM-DD or DD/MM/YYYY)" : !description ? "Missing description" : "Invalid or ambiguous amount"});
      return;
    }
    const category = get("category").toLowerCase();
    const source = get("source") || "Unspecified";
    const kind: PreviewRow["kind"] = isTransfer(category, description) ? "transfer" : amount < 0 ? "expense" : isOtherCredit(category, description) ? "unknown" : isEarnedIncome(category, description) ? "income" : "unknown";
    const issues: string[] = [];
    if (kind === "transfer") issues.push("Transfer, not earned income");
    if (kind === "unknown" && amount > 0) issues.push("Credit needs income-source review");
    parsed.push({id:`line-${line}`,line,date,description:description.slice(0,250),amount,category:category || "Uncategorized",source:source.slice(0,100),transactionId:get("transactionId").slice(0,100),kind,potentialDuplicate:false,needsReview:issues.length > 0,issues});
  });
  if (!parsed.length) throw new Error("No valid transactions were found. Check the selected columns and date format.");
  // Suspicious matches remain visible. They are not auto-deleted or presented as fraud.
  const byId = new Map<string, PreviewRow[]>();
  const byDateAmount = new Map<string, PreviewRow[]>();
  for (const row of parsed) {
    if (row.transactionId) {
      const key = row.transactionId.toLowerCase();
      const group = byId.get(key);
      if (group) group.push(row); else byId.set(key, [row]);
    }
    if (row.amount > 0) {
      const key = `${row.date}|${row.amount.toFixed(2)}`;
      const group = byDateAmount.get(key);
      if (group) group.push(row); else byDateAmount.set(key, [row]);
    }
  }
  const flag = (row: PreviewRow, reason: string) => {
    row.potentialDuplicate = true;
    row.needsReview = true;
    if (!row.issues.includes(reason)) row.issues.push(reason);
  };
  for (const group of byId.values()) if (group.length > 1) group.forEach(r => flag(r,"Repeated transaction reference"));
  for (const group of byDateAmount.values()) {
    if (group.length < 2) continue;
    // Linear-time grouping avoids quadratic work on large exports with repeated values.
    const uniqueSources = new Set(group.map(r => r.source.toLowerCase()));
    if (uniqueSources.size > 1) {
      group.forEach(r => flag(r, "Possible matching payout; verify before counting"));
    } else {
      const identical = new Map<string, PreviewRow[]>();
      for (const r of group) {
        if (r.transactionId) continue;
        const key = r.description.trim().toLowerCase();
        const group = identical.get(key);
        if (group) group.push(r); else identical.set(key, [r]);
      }
      for (const matches of identical.values()) {
        if (matches.length > 1) matches.forEach(r => flag(r, "Possible repeated line; verify before counting"));
      }
    }
  }
  const income = parsed.reduce((sum,r) => sum + (r.kind === "income" && !r.needsReview ? r.amount : 0),0);
  const outflows = parsed.reduce((sum,r) => sum + (r.amount < 0 ? -r.amount : 0),0);
  const warnings: string[] = [];
  if (skippedReasons.length) warnings.push(`${skippedReasons.length} invalid row${skippedReasons.length === 1 ? " was" : "s were"} excluded from totals.`);
  if (parsed.some(r=>r.potentialDuplicate)) warnings.push("Possible duplicate payouts are flagged and excluded from the estimated earnings total; none have been removed.");
  if (parsed.some(r=>r.kind === "unknown" && r.amount > 0)) warnings.push("Some incoming credits have an unknown source and are excluded from estimated earnings.");
  if (mapping.category < 0) warnings.push("No category column detected. Income labels are inferred from descriptions and need review.");
  const dates = parsed.map(r=>r.date).sort();
  return {
    rows: parsed, skipped: skippedReasons.length, skippedReasons,
    income, outflows, transfers: parsed.filter(r=>r.kind === "transfer").length,
    flagged: parsed.filter(r=>r.needsReview).length,
    unknownCredits: parsed.filter(r=>r.kind === "unknown" && r.amount > 0).reduce((sum,r)=>sum+r.amount,0),
    dateRange: {from: dates[0], to: dates[dates.length-1]},
    sources: new Set(parsed.map(r=>r.source)).size,
    warnings,
  };
}
