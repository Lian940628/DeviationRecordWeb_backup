import assert from 'node:assert/strict';
import { buildPersonConnectionTree } from '../src/tracking/personConnections.ts';
import { averageOfValidScores, getValidDisplayedScores } from '../src/tracking/sessionScoreMath.ts';

const track = (id, centerX, visible = true) => ({
  id,
  x: centerX - 0.05,
  y: 0.45,
  width: 0.1,
  height: 0.1,
  confidence: 0.9,
  visible,
});

assert.deepEqual(buildPersonConnectionTree([track(7, 0.75)]), []);
assert.deepEqual(
  buildPersonConnectionTree([track(1, 0.1), track(2, 0.3)]),
  [{ fromId: 1, toId: 2 }],
);
assert.deepEqual(
  buildPersonConnectionTree([track(1, 0.1), track(2, 0.3), track(3, 0.7)]),
  [{ fromId: 1, toId: 2 }, { fromId: 2, toId: 3 }],
  'three visible people should receive an MST without all-pairs cross links',
);
assert.deepEqual(
  buildPersonConnectionTree([track(1, 0.1), track(2, 0.3, false), track(3, 0.7)]),
  [{ fromId: 1, toId: 3 }],
  'hidden or expired tracks must not remain in the network',
);

const displayedScores = getValidDisplayedScores([
  { score: 0.62 },
  { score: 0.78 },
  { score: null },
  { score: undefined },
  { score: Number.NaN },
  { score: Number.POSITIVE_INFINITY },
]);
assert.deepEqual(displayedScores, [0.62, 0.78]);
assert.equal(averageOfValidScores(displayedScores.reduce((sum, score) => sum + score, 0), displayedScores.length), 0.7);
assert.equal(averageOfValidScores(0, 0), null);
assert.equal(averageOfValidScores(Number.NaN, 2), null);

console.log('PASS: deterministic MST connections exclude hidden tracks; expression score averages reject invalid and missing values.');
