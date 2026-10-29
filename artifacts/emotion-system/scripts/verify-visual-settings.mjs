import assert from 'node:assert/strict';
import {
  DEFAULT_VISUAL_SETTINGS,
  normalizeVisualSettings,
  parseVisualPreset,
} from '../src/visualization/visualSettings.ts';

const defaults = normalizeVisualSettings(DEFAULT_VISUAL_SETTINGS);
assert.deepEqual(
  Object.values(defaults.stages).map((stage) => stage.duration),
  [1.4, 0.7, 0.9, 0.8],
);
assert.equal(defaults.transitions.glitchDurationSeconds, 0.12);
assert.equal(defaults.transitions.renderScale, 0.7);

const altered = normalizeVisualSettings({
  ...defaults,
  global: {
    ...defaults.global,
    saturation: 500,
    gamma: 0,
    inputBlack: 85,
    inputWhite: 10,
  },
  stages: {
    ...defaults.stages,
    anomaly: { ...defaults.stages.anomaly, intensity: 260, duration: -3, anomalyColor: 'corrupt' },
  },
});
assert.equal(altered.global.saturation, 200);
assert.equal(altered.global.gamma, 0.2);
assert.ok(altered.global.inputWhite > altered.global.inputBlack);
assert.equal(altered.stages.anomaly.intensity, 200);
assert.equal(altered.stages.anomaly.duration, 0.1);
assert.equal(altered.stages.anomaly.anomalyColor, defaults.stages.anomaly.anomalyColor);
assert.deepEqual(altered.stages.normal, defaults.stages.normal, 'stage settings must remain independent');
assert.deepEqual(altered.stages.particle, defaults.stages.particle, 'stage settings must remain independent');

const serialized = JSON.stringify({ version: 1, settings: altered });
assert.deepEqual(parseVisualPreset(serialized), altered);
assert.throws(() => parseVisualPreset('not json'));
assert.throws(() => parseVisualPreset(JSON.stringify({ version: 2, settings: altered })));

console.log('PASS: stage defaults, value bounds, independent stage settings, black/white separation and preset JSON validation.');
