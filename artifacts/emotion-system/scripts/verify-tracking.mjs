import assert from 'node:assert/strict';
import { classifyBlendshapes, ExpressionSmoother, getCandidateSupports } from '../src/tracking/expressionClassifier.ts';
import { PersonTracker } from '../src/tracking/personTracker.ts';

// Deterministic rule/geometry regression checks, NOT an accuracy benchmark.
// These feature vectors never enter the live camera application.
const sad = { mouthFrownLeft: .25, mouthFrownRight: .25, browInnerUp: .15 };
const angry = { browDownLeft: .30, browDownRight: .30, mouthPressLeft: .15, mouthPressRight: .15 };
const happy = { mouthSmileLeft: .8, mouthSmileRight: .8, cheekSquintLeft: .5, cheekSquintRight: .5 };
const surprised = { eyeWideLeft: .8, eyeWideRight: .8, jawOpen: .7, browInnerUp: .5 };
const mildSad = { mouthFrownLeft: .18, mouthFrownRight: .18, browInnerUp: .12 };
const mildAngry = { browDownLeft: .2, browDownRight: .2, mouthPressLeft: .08, mouthPressRight: .08 };
const mildHappy = { mouthSmileLeft: .4, mouthSmileRight: .4, cheekSquintLeft: .25, cheekSquintRight: .25 };
for (const [label, features] of [['SAD', sad], ['ANGRY', angry], ['HAPPY', happy], ['SURPRISED', surprised]]) {
  assert.equal(classifyBlendshapes(features).label, label);
}
assert.equal(classifyBlendshapes(mildSad).label, 'SAD');
assert.equal(classifyBlendshapes(mildAngry).label, 'ANGRY');
const happyResult = classifyBlendshapes(mildHappy);
const neutralResult = classifyBlendshapes({});
assert.equal(happyResult.label, 'HAPPY');
assert.equal(neutralResult.label, 'NEUTRAL');
assert.ok(happyResult.score > neutralResult.score, 'active HAPPY rule index must exceed NEUTRAL');
assert.ok(neutralResult.score <= .5, 'NEUTRAL rule index must stay at or below the boundary');
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

const person = { x: 0.4, y: 0.12, width: 0.2, height: 0.72, confidence: 0.82 };
const tracker = new PersonTracker();
assert.equal(tracker.update([person], 1_000)[0].visible, false, 'single-frame detections remain unconfirmed');
assert.equal(tracker.update([person], 1_100)[0].visible, true, 'two consistent detections confirm a person track');

const transient = new PersonTracker();
assert.equal(transient.update([person], 2_000)[0].visible, false);
assert.equal(
  transient.update([], 2_100).some((track) => track.visible),
  false,
  'a one-frame false positive never becomes a visible person',
);

console.log('PASS: expression rules, temporal smoothing, and two-frame person-track confirmation.');
