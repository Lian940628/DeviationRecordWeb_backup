import assert from 'node:assert/strict';
import { classifyBlendshapes, ExpressionSmoother, getCandidateSupports } from '../src/tracking/expressionClassifier.ts';

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
assert.equal(classifyBlendshapes({ mouthSmileLeft: .25, mouthSmileRight: .25 }).label, 'NEUTRAL');
assert.equal(classifyBlendshapes({ browDownLeft: .5, browDownRight: .5 }).label, 'UNKNOWN');
assert.equal(classifyBlendshapes({ browInnerUp: .6 }).label, 'UNKNOWN');
assert.equal(classifyBlendshapes({ mouthFrownLeft: .5 }).label, 'NEUTRAL');
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

console.log('PASS: expression labels, neutral fallback, ambiguous cues, per-ID smoothing and per-class diagnostics.');
