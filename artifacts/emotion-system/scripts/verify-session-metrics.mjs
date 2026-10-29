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
  { trackId: 1, label: 'HAPPY', score: 0.62 },
  { trackId: 2, label: 'SAD', score: 0.78 },
  { trackId: 3, label: 'UNKNOWN', score: 0.99 },
  { trackId: 1, label: 'HAPPY', score: 0.35 },
  { trackId: 4, label: 'NEUTRAL', score: null },
  { trackId: 5, label: 'HAPPY', score: Number.NaN },
  { trackId: 6, label: 'SAD', score: Number.POSITIVE_INFINITY },
  { trackId: 7, label: 'ANGRY', score: 1.2 },
]);
assert.deepEqual(displayedScores, [0.62, 0.78]);
assert.equal(averageOfValidScores(displayedScores.reduce((sum, score) => sum + score, 0), displayedScores.length), 0.7);
assert.equal(averageOfValidScores(0, 0), null);
assert.equal(averageOfValidScores(Number.NaN, 2), null);

console.log('PASS: MST connections exclude hidden tracks; score averages exclude UNKNOWN, duplicates, invalid, and out-of-range values.');
