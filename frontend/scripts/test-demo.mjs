/** Node 22+ with --experimental-strip-types. Tests pure educational math only. */
import assert from 'node:assert/strict';
import { assess, SCENARIOS } from '../src/lib/demo-assessment.ts';
for (const entry of Object.values(SCENARIOS)) {
  const r = assess(entry);
  assert(r.total >= 0 && r.total <= 1000, 'score range');
  assert.equal(r.components.reduce((s,c) => s + c.weight,0),100,'weights sum');
  assert(Number.isFinite(r.mean) && Number.isFinite(r.median),'finite descriptive stats');
}
const steady = assess(SCENARIOS.consistent);
const volatile = assess(SCENARIOS.volatile);
const extraDebt = assess({...SCENARIOS.consistent,existingEmi:SCENARIOS.consistent.existingEmi+3000});
assert(volatile.total < steady.total,'high volatility weakens score');
assert(extraDebt.total < steady.total,'additional EMI weakens score');
assert.equal(steady.mean,31333.333333333332);
assert.equal(steady.total,855);
assert.equal(assess({...SCENARIOS.consistent,monthlyIncome:[0,0,0,0,0,0]}).mean,0);
console.log('EarnScore demo formula: all invariants passed.');
