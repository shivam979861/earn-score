"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Icon } from "@/components/icon";
import {
  inspectStatement, isMappingValid, MAX_CSV_BYTES, previewStatement,
  type ColumnKey, type ColumnMapping, type StatementPreview,
} from "@/lib/statement-preview";

const money = (n: number) => new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 2 }).format(n);
const fields: { key: ColumnKey; label: string; hint: string }[] = [
  { key: "date", label: "Transaction date *", hint: "YYYY-MM-DD or DD/MM/YYYY" },
  { key: "description", label: "Description *", hint: "Payment narration or details" },
  { key: "amount", label: "Signed amount", hint: "Choose this OR credit + debit" },
  { key: "credit", label: "Credit", hint: "Money received (positive amounts)" },
  { key: "debit", label: "Debit", hint: "Money paid (positive amounts)" },
  { key: "category", label: "Category", hint: "Optional: helps identify earnings" },
  { key: "source", label: "Source", hint: "Optional: platform / bank account" },
  { key: "transactionId", label: "Reference ID", hint: "Optional: helps identify repeated records" },
];
const formatDate = (s: string) => new Date(`${s}T00:00:00Z`).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
type KindFilter = "all" | "income" | "expense" | "transfer" | "review";
type ImportReceipt = {
  id: string; filename: string; created_at: string; status: string; row_count: number;
  valid_count: number; invalid_count: number; review_count: number;
  duplicate_count: number; verification_status: "unverified";
  raw_file_stored: boolean;
  summary?: { possible_income: string; total_outflows: string; note: string };
  review_samples?: { line: number; description: string; reasons: string[] }[];
  invalid_rows?: { line: number; reason: string }[];
};

function exportReview(result: StatementPreview) {
  const esc = (value: string | number) => {
    const raw = String(value);
    const safe = /^[=+@-]/.test(raw) && typeof value === "string" ? `'${raw}` : raw;
    return `"${safe.replace(/"/g, '""')}"`;
  };
  const header = ["line", "date", "description", "source", "amount", "status", "reason"];
  const rows = result.rows.filter(r => r.needsReview).map(r => [r.line, r.date, r.description, r.source, r.amount, "Requires review", r.issues.join("; ")]);
  const skipped = result.skippedReasons.map(r => [r.line, "", "", "", "", "Skipped", r.reason]);
  const csv = [header, ...rows, ...skipped].map(r => r.map(esc).join(",")).join("\r\n");
  const url = URL.createObjectURL(new Blob(["\uFEFF", csv], { type: "text/csv;charset=utf-8" }));
  const link = document.createElement("a");
  link.href = url; link.download = "earnscore-review-items.csv";
  document.body.appendChild(link); link.click(); link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

export function StatementPreviewTool() {
  const fileRef = useRef<HTMLInputElement>(null);
  const [filename, setFilename] = useState("");
  const [raw, setRaw] = useState("");
  const [headers, setHeaders] = useState<string[]>([]);
  const [rowCount, setRowCount] = useState(0);
  const [mapping, setMapping] = useState<ColumnMapping | null>(null);
  const [showMapping, setShowMapping] = useState(false);
  const [result, setResult] = useState<StatementPreview | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [saved, setSaved] = useState<ImportReceipt | null>(null);
  const [previousImports, setPreviousImports] = useState<ImportReceipt[]>([]);
  const [importsLoaded, setImportsLoaded] = useState(false);
  const [filter, setFilter] = useState<KindFilter>("all");
  const [source, setSource] = useState("all");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(0);
  const [sort, setSort] = useState<"newest" | "oldest">("newest");
  useEffect(() => {
    let active = true;
    fetch("/api/worker/uploads", { cache: "no-store" }).then(r => r.ok ? r.json() : [])
      .then((data: unknown) => {
        if (active && Array.isArray(data)) { setPreviousImports(data as ImportReceipt[]); setImportsLoaded(true); }
      }).catch(() => { /* Backend may be offline in preview-only mode. */ });
    return () => { active = false; };
  }, []);

  async function saveImport() {
    if (!raw || !mapping || !result || saving || saved) return;
    setSaving(true); setSaveError("");
    const form = new FormData();
    form.set("file", new File([raw], filename, { type: "text/csv" }));
    form.set("mapping", JSON.stringify(mapping));
    try {
      const response = await fetch("/api/worker/uploads", { method: "POST", body: form });
      const body = await response.json();
      if (!response.ok) throw new Error(typeof body.detail === "string" ? body.detail : "Import was not saved. Please try again.");
      const receipt = body as ImportReceipt;
      setSaved(receipt);
      setPreviousImports(existing => [receipt, ...existing.filter(item => item.id !== receipt.id)]);
      setImportsLoaded(true);
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : "Could not save processed records.");
    } finally { setSaving(false); }
  }

  const resetFilters = () => { setFilter("all"); setSource("all"); setSearch(""); setPage(0); setSort("newest"); };

  function applyPreview(csv: string, columns: ColumnMapping) {
    try {
      const parsed = previewStatement(csv, columns);
      setResult(parsed); setShowMapping(false); setError(""); setSaved(null); setSaveError(""); resetFilters();
    } catch (e) {
      setResult(null); setSaved(null); setSaveError(""); setError(e instanceof Error ? e.message : "Could not parse this statement."); setShowMapping(true);
    }
  }
  function openCSV(text: string, name: string) {
    try {
      const inspected = inspectStatement(text);
      setRaw(text); setFilename(name); setHeaders(inspected.headers);
      setRowCount(inspected.rowCount); setMapping(inspected.mapping);
      setResult(null); setSaved(null); setSaveError(""); setError(""); resetFilters();
      if (isMappingValid(inspected.mapping)) applyPreview(text, inspected.mapping);
      else { setShowMapping(true); setError("We couldn't identify all required columns. Match them below to continue."); }
    } catch (e) {
      setResult(null); setRaw(""); setFilename(""); setMapping(null); setHeaders([]);
      setError(e instanceof Error ? e.message : "Could not read this file.");
    }
  }
  async function readFile(file?: File) {
    if (!file) return;
    if (!file.name.toLowerCase().endsWith(".csv")) { setError("Choose a CSV file ending in .csv."); setResult(null); return; }
    if (file.size > MAX_CSV_BYTES) { setError("This file is too large. Choose a CSV smaller than 2 MB."); setResult(null); return; }
    if (!file.size) { setError("This CSV file is empty."); setResult(null); return; }
    setLoading(true); setError("");
    try { openCSV(await file.text(), file.name); }
    catch { setError("We couldn't open the selected CSV file."); setResult(null); }
    finally { setLoading(false); }
  }
  async function useSample() {
    setLoading(true); setError("");
    try {
      const response = await fetch("/examples/demo_transactions.csv", { cache: "no-store" });
      if (!response.ok) throw new Error("Sample CSV is unavailable.");
      openCSV(await response.text(), "demo_transactions.csv");
    } catch (e) { setError(e instanceof Error ? e.message : "Sample is unavailable."); }
    finally { setLoading(false); }
  }
  function reset() {
    setRaw(""); setFilename(""); setHeaders([]); setRowCount(0); setMapping(null);
    setShowMapping(false); setResult(null); setSaved(null); setSaveError(""); setError(""); resetFilters();
    if (fileRef.current) fileRef.current.value = "";
  }
  const sources = useMemo(() => [...new Set(result?.rows.map(r => r.source) || [])].sort(), [result]);
  const visible = useMemo(() => {
    const term = search.trim().toLowerCase();
    return (result?.rows || []).filter(r =>
      (filter === "all" || (filter === "review" ? r.needsReview : r.kind === filter)) &&
      (source === "all" || r.source === source) &&
      (!term || [r.date, r.description, r.source, r.category, r.transactionId].some(x => x.toLowerCase().includes(term)))
    ).sort((a, b) => (sort === "newest" ? b.date.localeCompare(a.date) : a.date.localeCompare(b.date)) || a.line - b.line);
  }, [result, filter, source, search, sort]);
  const totalPages = Math.ceil(visible.length / 25);
  const safePage = Math.min(page, Math.max(0, totalPages - 1));
  const pageRows = visible.slice(safePage * 25, (safePage + 1) * 25);
  const setKind = (v: KindFilter) => { setFilter(v); setPage(0); };

  return <div className="statement-tool">
    <div className="new-page-heading"><span className="ui-kicker">WORKER WORKSPACE · INCOME RECORDS</span><h1>Upload and preview a statement</h1><p>Review transactions before using them for any future EarnScore assessment. You can try the whole experience with fictional sample data.</p></div>
    <section className="privacy-strip" role="note"><Icon name="shield-check" size={20}/><div><strong>Preview first, save only when you choose</strong><span>Column matching and preview run locally in this browser. Only pressing “Save cleaned records” sends the CSV to your authenticated backend for processing and storage; bank verification and lender sharing are not enabled.</span></div></section>
    <div className="csv-workflow-steps"><span className="csv-step active"><b>1</b> Choose CSV</span><span className={`csv-step ${raw ? "active" : ""}`}><b>2</b> Match columns</span><span className={`csv-step ${result ? "active" : ""}`}><b>3</b> Review transactions</span><span className={`csv-step ${saved ? "active" : ""}`}><b>4</b> Save if you want</span></div>
    <div className="statement-grid">
      <section className="card statement-upload-card">
        <div className={`csv-dropzone ${dragging ? "is-dragging" : ""}`} onDragEnter={e => { e.preventDefault(); setDragging(true); }} onDragOver={e => { e.preventDefault(); setDragging(true); }} onDragLeave={e => { e.preventDefault(); if (!e.currentTarget.contains(e.relatedTarget as Node)) setDragging(false); }} onDrop={e => { e.preventDefault(); setDragging(false); void readFile(e.dataTransfer.files[0]); }}>
          <div className="statement-upload-symbol"><Icon name="cloud-upload" size={27}/></div>
          <h2>{loading ? "Reading your statement…" : "Drag your CSV here"}</h2>
          <p>Or choose a file from your device. Bank statement exports, platform payouts, or a simple transaction sheet all work with column matching.</p>
          <input ref={fileRef} className="statement-file-input" id="statement-file" type="file" accept=".csv,text/csv" aria-label="Choose a financial CSV file" onChange={e => void readFile(e.target.files?.[0])} />
          <label htmlFor="statement-file" className="btn btn-primary"><Icon name="cloud-upload" size={17}/> {loading ? "Reading…" : filename ? "Replace CSV" : "Choose CSV file"}</label>
          <span className="csv-file-hint">CSV only · Up to 2 MB · 10,000 rows</span>
        </div>
        {filename && <div className="csv-selected-file"><Icon name="file-text" size={19}/><div><strong>{filename}</strong><span>{rowCount.toLocaleString("en-IN")} transaction rows found</span></div><button type="button" className="csv-text-button" onClick={reset} aria-label="Clear selected statement">Clear</button></div>}
      </section>
      <section className="card statement-steps"><span className="ui-kicker">NEW HERE?</span><h2>Try the sample first</h2><p className="csv-aside-copy">See how earnings, transfers, possible duplicates, and expenses appear before choosing a personal file.</p>
        <button className="btn btn-outline csv-demo-button" type="button" disabled={loading} onClick={() => void useSample()}><Icon name="file-text" size={18}/> Load sample transactions</button>
        <a className="sample-download" href="/examples/demo_transactions.csv" download>Download example CSV <Icon name="arrow-down-right" size={14}/></a>
        <div className="csv-supported"><strong>Supported column layouts</strong><span><Icon name="check" size={15}/> Date + description + signed amount</span><span><Icon name="check" size={15}/> Date + narration + credit + debit</span><span><Icon name="check" size={15}/> Optional source, category, and reference ID</span></div>
      </section>
    </div>
    {error && <div className="form-error statement-feedback" role="alert"><Icon name="circle-alert" size={18}/>{error}</div>}
    {raw && mapping && <section className="card csv-mapping-card">
      <div className="csv-section-heading"><div><span className="ui-kicker">STEP 2 · COLUMN MATCHING</span><h2>Match your CSV columns</h2><p>We selected common bank headings automatically. Adjust them if your file uses different labels.</p></div><button type="button" className="btn btn-outline" aria-expanded={showMapping} aria-controls="csv-mapping-controls" onClick={() => setShowMapping(!showMapping)}>{showMapping ? "Hide column settings" : "Edit column mapping"}</button></div>
      {showMapping && <div id="csv-mapping-controls"><div className="csv-column-grid">{fields.map(field => <label key={field.key} className="csv-field-map"><strong>{field.label}</strong><span>{field.hint}</span><select aria-label={field.label} value={mapping[field.key]} onChange={e => { setMapping(prev => prev ? { ...prev, [field.key]: Number(e.target.value) } : prev); setResult(null); }}><option value={-1}>— Not in file —</option>{headers.map((header, index) => <option key={`${header}-${index}`} value={index}>{header}</option>)}</select></label>)}</div><div className="csv-mapping-actions"><p>Amount is signed; use either that field <strong>or</strong> both credit and debit. Dates are interpreted as day/month/year when not ISO formatted.</p><button className="btn btn-primary" disabled={!isMappingValid(mapping)} onClick={() => applyPreview(raw, mapping)}>Preview transactions <Icon name="arrow-right" size={17}/></button></div></div>}
      {!showMapping && <p className="csv-mapped-ok"><Icon name="check-circle-2" size={18}/> Columns matched. You can change the mapping at any time.</p>}
    </section>}
    {result && <section className="statement-result" aria-live="polite">
      <div className="statement-result-title"><div><span className="ui-kicker">STEP 3 · LOCAL PREVIEW</span><h2>Transaction overview</h2><p>{result.rows.length.toLocaleString("en-IN")} valid transactions · {result.dateRange.from === result.dateRange.to ? formatDate(result.dateRange.from) : `${formatDate(result.dateRange.from)} – ${formatDate(result.dateRange.to)}`} · {result.sources} source{result.sources === 1 ? "" : "s"}</p></div><button className="btn btn-outline" onClick={reset}>Clear preview</button></div>
      <section className="card csv-save-card" aria-live="polite">
        <div className="csv-save-copy"><span className="ui-kicker">STEP 4 · OPTIONAL SECURE IMPORT</span><h3>Save these cleaned transactions?</h3>
          <p>Nothing is sent until you choose to save. EarnScore will validate the CSV again on the server and store normalized transaction records in your worker account. <strong>All rows remain unverified</strong>; the raw CSV file is not retained.</p>
          <p className="csv-save-privacy"><Icon name="shield-check" size={16}/> Signed-in worker account only · No credit score generated · Duplicates are flagged, not deleted</p>
        </div>
        <div className="csv-save-actions">
          <button type="button" className="btn btn-primary" disabled={saving || !!saved} onClick={() => void saveImport()}>
            <Icon name={saved ? "check-circle-2" : "database"} size={18}/>{saved ? "Saved to your account" : saving ? "Saving records…" : "Save cleaned records"}
          </button>
          <span>Requires running FastAPI and PostgreSQL with migration 0003</span>
        </div>
        {saveError && <div className="form-error csv-save-error" role="alert"><Icon name="circle-alert" size={17}/>{saveError}</div>}
        {saved && <div className="csv-save-success" role="status">
          <strong><Icon name="check-circle-2" size={17}/> Import saved — not externally verified</strong>
          <p>{saved.valid_count} accepted · {saved.invalid_count} invalid · {saved.review_count} needing review · {saved.duplicate_count} potential duplicates.</p>
          <small>Import ID: {saved.id} · Original CSV not stored · No lender can access these records automatically.</small>
          {(saved.review_samples?.length ?? 0) > 0 && <details className="csv-server-issues"><summary>See examples of server-side review flags</summary><ul>{saved.review_samples?.map(item => <li key={item.line}>CSV row {item.line}: {item.description} — {item.reasons.join("; ")}</li>)}</ul></details>}
          {(saved.invalid_rows?.length ?? 0) > 0 && <details className="csv-server-issues"><summary>See invalid rows</summary><ul>{saved.invalid_rows?.slice(0,20).map(item => <li key={item.line}>CSV row {item.line}: {item.reason}</li>)}</ul></details>}
        </div>}
      </section>
      <div className="statement-metrics"><div className="statement-metric"><span>Possible earned income</span><strong>{money(result.income)}</strong><small>Excludes transfers, unknown credits and flagged matches</small></div><div className="statement-metric"><span>Recorded outflows</span><strong>{money(result.outflows)}</strong><small>All negative transactions; not all are necessarily expenses</small></div><div className="statement-metric"><span>Review needed</span><strong>{result.flagged + result.skipped}</strong><small>{result.flagged} flagged · {result.skipped} invalid/skipped</small></div></div>
      {(result.warnings.length > 0 || result.skipped > 0) && <div className="csv-warning-panel"><div className="csv-warning-title"><Icon name="alert-triangle" size={19}/><strong>Check before relying on these numbers</strong></div><ul>{result.warnings.map(w => <li key={w}>{w}</li>)}</ul>{result.skippedReasons.length > 0 && <details><summary>See excluded rows ({result.skipped})</summary><ul>{result.skippedReasons.slice(0,30).map(item => <li key={item.line}>CSV row {item.line}: {item.reason}</li>)}</ul>{result.skipped > 30 && <p>Showing the first 30 excluded rows.</p>}</details>}</div>}
      <div className="card statement-table-card"><div className="csv-section-heading"><div><h3>Transactions</h3><p>All lines are unverified. Tap a status to understand why it needs review.</p></div>{result.flagged + result.skipped > 0 && <button className="btn btn-outline" onClick={() => exportReview(result)}><Icon name="file-text" size={17}/> Export review list</button>}</div>
        <div className="csv-toolbar"><label className="csv-search"><Icon name="search" size={17}/><input type="search" value={search} onChange={e => { setSearch(e.target.value); setPage(0); }} placeholder="Search descriptions or references" aria-label="Search transactions"/></label><label>Type<select value={filter} onChange={e => setKind(e.target.value as KindFilter)}><option value="all">All transactions</option><option value="income">Possible earnings</option><option value="expense">Outflows</option><option value="transfer">Transfers</option><option value="review">Needs review</option></select></label><label>Source<select value={source} onChange={e => { setSource(e.target.value); setPage(0); }}><option value="all">All sources</option>{sources.map(s => <option key={s} value={s}>{s}</option>)}</select></label><label>Sort<select value={sort} onChange={e => { setSort(e.target.value as typeof sort); setPage(0); }}><option value="newest">Newest first</option><option value="oldest">Oldest first</option></select></label></div>
        <div className="csv-table-meta"><span>Showing {visible.length === 0 ? 0 : safePage * 25 + 1}–{Math.min(visible.length, (safePage + 1) * 25)} of {visible.length} matching transactions</span>{(search || filter !== "all" || source !== "all") && <button type="button" onClick={resetFilters}>Reset filters</button>}</div>
        <div className="statement-scroll"><table className="statement-table"><thead><tr><th>Date</th><th>Description</th><th>Source</th><th>Type</th><th>Amount</th><th>Status</th></tr></thead><tbody>{pageRows.map(row => <tr key={row.id}><td>{formatDate(row.date)}</td><td><span className="csv-description">{row.description}</span>{row.transactionId && <small className="csv-ref">Ref: {row.transactionId}</small>}</td><td>{row.source}</td><td><span className={`csv-kind ${row.kind}`}>{row.kind === "income" ? "Possible earning" : row.kind === "expense" ? "Outflow" : row.kind === "transfer" ? "Transfer" : "Unclassified"}</span></td><td className={row.amount > 0 ? "money-positive" : "money-negative"}>{row.amount > 0 ? "+" : "−"}{money(Math.abs(row.amount))}</td><td>{row.needsReview ? <details className="csv-row-issues"><summary className="data-tag review">{row.potentialDuplicate ? "Possible duplicate" : "Review"}</summary><ul>{row.issues.map(x => <li key={x}>{x}</li>)}</ul></details> : <span className="data-tag">Unverified</span>}</td></tr>)}</tbody></table>{visible.length === 0 && <p className="empty-note">No transactions match. Try another filter or search.</p>}</div>
        {totalPages > 1 && <div className="csv-pagination"><button className="btn btn-outline" disabled={safePage === 0} onClick={() => setPage(p => Math.max(0, p - 1))}>Previous</button><span>Page {safePage + 1} of {totalPages}</span><button className="btn btn-outline" disabled={safePage >= totalPages - 1} onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))}>Next</button></div>}
      </div>
      <div className="roadmap-note"><Icon name="info" size={19}/><div><strong>Import does not mean verified income</strong><p>The local preview is only an estimate. If you choose to save, the backend parses and stores cleaned, self-reported transactions. Independent bank verification, score generation and lender sharing are not implemented.</p></div></div>
    </section>}
    {importsLoaded && previousImports.length > 0 && <section className="card csv-history-card">
      <div className="csv-section-heading"><div><span className="ui-kicker">YOUR ACCOUNT</span><h2>Recent saved imports</h2><p>Records are stored privately and remain unverified.</p></div></div>
      <ul className="csv-history-list">{previousImports.slice(0,5).map(item => <li key={item.id}><div><strong>{item.filename}</strong><small>{item.valid_count} saved · {item.review_count} for review · {item.duplicate_count} potential duplicates</small></div><span className="data-tag">Unverified</span></li>)}</ul>
    </section>}
  </div>;
}
