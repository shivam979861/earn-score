import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { inspectStatement, isMappingValid, parseCSV, previewStatement } from "../src/lib/statement-preview.ts";

const sample = readFileSync("public/examples/demo_transactions.csv", "utf8");
const result = previewStatement(sample);
assert.equal(result.rows.length, 8);
assert.equal(result.skipped, 0);
assert.equal(result.transfers, 1);
assert.equal(result.outflows, 3675);
assert.equal(result.income, 2150);
assert.equal(result.rows.filter(r => r.potentialDuplicate).length, 2);
assert.equal(result.flagged, 3);
assert.equal(result.sources, 2);
assert.deepEqual(result.dateRange, { from: "2026-09-01", to: "2026-09-07" });
assert.ok(result.warnings.some(w => w.includes("Possible duplicate")));

// Quoted commas, embedded line breaks, escaped quotes, CRLF and BOM.
assert.equal(parseCSV('date,description,amount\n2026-01-01,"Payout, A",123')[1][1], "Payout, A");
assert.equal(parseCSV('a,b\r\n"line 1\nline 2","said ""yes"""')[1][0], "line 1\nline 2");
assert.equal(parseCSV('\uFEFFdate,description,amount\n2026-01-01,"Payout A",123')[0][0], "date");
assert.throws(() => parseCSV('date,description,amount\n2026-01-01,"bad,23'), /unfinished/);
assert.throws(() => parseCSV('a,b\n1,abc"def'), /Unexpected quote/);
assert.throws(() => previewStatement('date,description\n2026-01-01,Salary'), /Required columns/);

// Column recognition and separate credit/debit import (DD/MM/YYYY).
const bank = 'Value Date,Particulars,Deposits,Withdrawals,Account Name,UTR\n03/11/2026,Platform payout,"1,250.50",,Wallet,REF1\n04/11/2026,Groceries,,450.00,Wallet,REF2';
const inspected = inspectStatement(bank);
assert.ok(isMappingValid(inspected.mapping));
const bankResult = previewStatement(bank);
assert.equal(bankResult.income, 1250.5);
assert.equal(bankResult.outflows, 450);
assert.equal(bankResult.rows[0].date, "2026-11-03");
assert.equal(bankResult.rows[0].transactionId, "REF1");

// Manual mapping for custom bank headers.
const custom = 'Day,Note,Value\n2026-11-01,Salary payout,600';
const cols = inspectStatement(custom);
assert.equal(isMappingValid(cols.mapping), false);
assert.equal(previewStatement(custom, { ...cols.mapping, date: 0, description: 1, amount: 2 }).income, 600);

// Invalid and dangerous values are rejected, not silently interpreted as zero earnings.
const malformed = 'date,description,amount\n2026-02-30,Salary payout,200\n2026-02-01,Salary payout,not-money\n2026-02-02,Salary payout,500';
const malformedResult = previewStatement(malformed);
assert.equal(malformedResult.skipped, 2);
assert.deepEqual(malformedResult.skippedReasons.map(r => r.line), [2,3]);
assert.equal(malformedResult.income, 500);
assert.throws(() => previewStatement('date,description,amount\n2026-01-01,Salary,not-number'), /No valid transactions/);

// Self transfers, refunds, unknown credits and loan disbursements aren't earnings.
const credits = previewStatement('date,narration,amount\n2026-01-01,Transfer from own account,5000\n2026-01-02,Loan disbursement,3000\n2026-01-03,Refund credit,200\n2026-01-04,Random credit,600\n2026-01-05,Client payment,1500');
assert.equal(credits.income,1500);
assert.equal(credits.transfers,1);
assert.equal(credits.unknownCredits,3800);
assert.equal(credits.flagged,4);

// Duplicate reference and same-day cross-platform match are warnings, not row deletion.
const duplicates = previewStatement('date,description,amount,source,transaction_id\n2026-01-01,Platform payout,200,Bank,R1\n2026-01-01,Platform payout,200,Platform,R2\n2026-01-02,Client payment,100,Bank,R3\n2026-01-03,Client payment,150,Bank,R3');
assert.equal(duplicates.rows.filter(r=>r.potentialDuplicate).length,4);
assert.equal(duplicates.income,0);

// Separate credit/debit columns cannot contain two incoming/outgoing amounts in one row.
const both = previewStatement('date,description,credit,debit\n2026-01-01,Payout,100,100\n2026-01-02,Payout,200,');
assert.equal(both.skipped,1);
assert.equal(both.income,200);
console.log("CSV parser, mapping, validation, review and preview tests passed");

// Large but allowed files should be parsed in a bounded amount of time.
const many = 'date,description,amount,source\n' + Array.from({length: 10_000}, (_, i) => `2026-01-01,Platform payout,100,${i % 2 ? 'A' : 'B'}`).join('\n');
const start = performance.now();
const large = previewStatement(many);
assert.equal(large.rows.length,10_000);
assert.equal(large.flagged,10_000);
assert.ok(performance.now() - start < 10_000,"10k-row preview should complete promptly");
assert.throws(() => inspectStatement(many + '\n2026-01-02,Platform payout,2,A'), /10,000 transactions/);
