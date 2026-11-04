import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {previewStatement,parseCSV} from '../src/lib/statement-preview.ts';
const sample = readFileSync('public/examples/demo_transactions.csv','utf8');
const r=previewStatement(sample);
assert.equal(r.rows.length,8);
assert.equal(r.skipped,0);
assert.equal(r.transfers,1);
assert.equal(r.outflows,3675);
assert.equal(r.income,2150); // exclude self-transfer and possible duplicate payouts
assert.equal(r.rows.filter(x=>x.potentialDuplicate).length,2);
assert.ok(r.flagged>=3);
assert.equal(parseCSV('date,description,amount\n2026-01-01,"Payout, A",123')[1][1],'Payout, A');
assert.throws(()=>previewStatement('date,description\n2026-01-01,Salary'),/Required columns/);
assert.throws(()=>previewStatement('date,description,amount\n2026-01-01,"bad,23'),/unfinished/);
console.log('CSV preview tests passed');
