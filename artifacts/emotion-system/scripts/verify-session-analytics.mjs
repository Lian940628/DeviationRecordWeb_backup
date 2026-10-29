import assert from 'node:assert/strict';
import {
  createEmptyEmotionCounts,
  emotionShares,
  formatPersonId,
  formatSessionDuration,
  incrementEmotionCount,
  incrementTrackEmotionCount,
  integerEmotionPercentages,
  makeEmotionTrendPoint,
  takeDueTrackSamples,
  validEmotionCount,
} from '../src/dashboard/sessionAnalyticsMath.ts';

const tracks = [
  { id: 1, x: 0, y: 0, width: .2, height: .7, confidence: .9, visible: true },
  { id: 2, x: .3, y: 0, width: .2, height: .7, confidence: .9, visible: false },
  { id: 3, x: .6, y: 0, width: .2, height: .7, confidence: .9, visible: true },
];
const expressions = [
  { trackId: 1, label: 'HAPPY' },
  { trackId: 2, label: 'SAD' },
  { trackId: 3, label: 'UNKNOWN' },
].map((item) => item);
const lastSampleAt = new Map();

assert.deepEqual(
  takeDueTrackSamples(tracks, expressions, lastSampleAt, 0).map((item) => item.trackId),
  [1, 3],
  'samples include visible tracked people only',
);
assert.equal(takeDueTrackSamples(tracks, expressions, lastSampleAt, 999).length, 0);
assert.deepEqual(
  takeDueTrackSamples(tracks, expressions, lastSampleAt, 1_000).map((item) => item.trackId),
  [1, 3],
  'each person is sampled once per second',
);
takeDueTrackSamples([tracks[0]], expressions, lastSampleAt, 1_100);
assert.equal(lastSampleAt.has(3), false, 'expired track sample clocks are removed');

let counts = createEmptyEmotionCounts();
counts = incrementEmotionCount(counts, 'HAPPY');
counts = incrementEmotionCount(counts, 'NEUTRAL');
counts = incrementEmotionCount(counts, 'UNKNOWN');
assert.equal(validEmotionCount(counts), 2, 'UNKNOWN is excluded from the valid denominator');
assert.deepEqual(integerEmotionPercentages(counts), {
  NEUTRAL: 50, HAPPY: 50, SAD: 0, ANGRY: 0, SURPRISED: 0,
});
assert.equal(validEmotionCount(createEmptyEmotionCounts()), 0);
assert.ok(Object.values(emotionShares(createEmptyEmotionCounts())).every((value) => value === null));

const byTrack = {};
incrementTrackEmotionCount(byTrack, 1, 'HAPPY');
incrementTrackEmotionCount(byTrack, 2, 'SAD');
incrementTrackEmotionCount(byTrack, 1, 'UNKNOWN');
assert.equal(byTrack['1'].HAPPY, 1);
assert.equal(byTrack['1'].UNKNOWN, 1);
assert.equal(byTrack['2'].SAD, 1);
assert.equal(byTrack['2'].HAPPY, 0, 'one person’s samples do not leak into another track');

const trend = makeEmotionTrendPoint(10_000, counts, byTrack);
assert.equal(trend.validSamples, 2);
assert.equal(trend.unknownSamples, 1);
assert.equal(trend.byTrack['1'].HAPPY, 100);
assert.equal(formatPersonId(7), '007');
assert.equal(formatSessionDuration(3_661), '01:01:01');

console.log('PASS: per-track one-second sampling, UNKNOWN exclusion, exact percentage totals, trend counts, and session formatting.');
