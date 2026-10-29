import assert from 'node:assert/strict';
import { classifyBlendshapes, ExpressionSmoother, getCandidateSupports } from '../src/tracking/expressionClassifier.ts';
import { deduplicateFaces, getHeadRegions, mapCropPoint } from '../src/tracking/faceRegions.ts';

// Deterministic rule/geometry regression checks, NOT an accuracy benchmark.
// These feature vectors never enter the live camera application.
const sad = { mouthFrownLeft: .25, mouthFrownRight: .25, browInnerUp: .15 };
const angry = { browDownLeft: .30, browDownRight: .30, mouthPressLeft: .15, mouthPressRight: .15 };
const happy = { mouthSmileLeft: .8, mouthSmileRight: .8, cheekSquintLeft: .5, cheekSquintRight: .5 };
const surprised = { eyeWideLeft: .8, eyeWideRight: .8, jawOpen: .7, browInnerUp: .5 };
for (const [label, features] of [['SAD', sad], ['ANGRY', angry], ['HAPPY', happy], ['SURPRISED', surprised]]) {
  assert.equal(classifyBlendshapes(features).label, label);
}
assert.equal(classifyBlendshapes({}).label, 'NEUTRAL');
assert.equal(classifyBlendshapes({ browDownLeft: .5, browDownRight: .5 }).label, 'UNKNOWN');
assert.equal(classifyBlendshapes({ browInnerUp: .6 }).label, 'UNKNOWN');
assert.equal(classifyBlendshapes({ mouthFrownLeft: .5 }).label, 'UNKNOWN');
assert.equal(getCandidateSupports(angry).find((item) => item.label === 'ANGRY').cuesSatisfied, true);
assert.equal(getCandidateSupports({ browDownLeft: .6, browDownRight: .6 })
  .find((item) => item.label === 'ANGRY').cuesSatisfied, false);

const smoother = new ExpressionSmoother();
let first;
let second;
for (let frame = 0; frame < 20; frame += 1) {
  first = smoother.update(1, sad);
  second = smoother.update(2, angry);
}
assert.equal(first.label, 'SAD');
assert.equal(second.label, 'ANGRY');
assert.equal(smoother.markUnknown(1).label, 'UNKNOWN');

const regions = getHeadRegions([
  { visible: true, x: 0, y: 0, width: .3, height: 1 },
  { visible: true, x: .8, y: .4, width: .2, height: .6 },
  { visible: false, x: .3, y: .1, width: .2, height: .8 },
]);
assert.equal(regions.length, 2);
for (const region of regions) {
  assert.ok(region.x >= 0 && region.y >= 0);
  assert.ok(region.x + region.width <= 1 && region.y + region.height <= 1);
}
const mapped = mapCropPoint({ x: .5, y: .5 }, { x: .2, y: .1, width: .4, height: .3 });
assert.equal(mapped.x, .4);
assert.equal(mapped.y, .25);
const face = { x: .2, y: .1, width: .1, height: .15, poseReliable: true };
assert.equal(deduplicateFaces([face, { ...face, x: .201 }, { ...face, x: .6 }]).length, 2);
console.log('PASS: expression rules, neutral/ambiguous actions, per-ID smoothing, crop bounds, coordinate mapping and face deduplication.');
