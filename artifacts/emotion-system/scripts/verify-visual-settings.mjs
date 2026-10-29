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
assert.equal(defaults.transitions.glitchDurationSeconds, 0.18);
assert.equal(defaults.transitions.renderScale, 0.7);
assert.equal(defaults.global.saturation, 95);
assert.equal(defaults.global.brightness, 83);
assert.equal(defaults.global.contrast, 123);
assert.equal(defaults.global.gamma, 1.23);
assert.equal(defaults.global.outputWhite, 65);
assert.equal(defaults.stages.normal.digitalNoiseIntensity, 15);
assert.equal(defaults.stages.normal.scanlineOpacity, 17);
assert.equal(defaults.stages.anomaly.intensity, 129);
assert.equal(defaults.stages.anomaly.anomalyColor, '#339ecc');
assert.equal(defaults.stages.particle.particleSize, 2.9);
assert.equal(defaults.stages.particle.particleDensity, 62);
assert.equal(defaults.stages.particle.luminanceThreshold, 0.26);
assert.equal(defaults.stages.particle.glowIntensity, 62);
assert.equal(defaults.stages.line.lineThickness, 2.3);
assert.equal(defaults.stages.line.edgeThreshold, 0.135);
assert.equal(defaults.stages.line.lineFlicker, 66);
assert.equal(defaults.audio.masterVolume, 0.19);
assert.equal(defaults.audio.muted, false);
assert.equal(defaults.stages.line.personConnectionsEnabled, true);
assert.equal(defaults.stages.line.personConnectionWidth, 2.9);
assert.equal(defaults.stages.line.personConnectionOpacity, 24);
assert.equal(defaults.stages.line.personConnectionGlow, 100);
assert.equal(defaults.stages.line.showPersonIds, true);

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
    line: { ...defaults.stages.line, personConnectionsEnabled: false, showPersonIds: false },
  },
  audio: { ...defaults.audio, masterVolume: 2, muted: true },
});
assert.equal(altered.global.saturation, 200);
assert.equal(altered.global.gamma, 0.2);
assert.ok(altered.global.inputWhite > altered.global.inputBlack);
assert.equal(altered.stages.anomaly.intensity, 200);
assert.equal(altered.stages.anomaly.duration, 0.1);
assert.equal(altered.stages.anomaly.anomalyColor, defaults.stages.anomaly.anomalyColor);
assert.equal(altered.audio.masterVolume, 0.4);
assert.equal(altered.audio.muted, true);
assert.equal(altered.stages.line.personConnectionsEnabled, false);
assert.equal(altered.stages.line.showPersonIds, false);
assert.deepEqual(altered.stages.normal, defaults.stages.normal, 'stage settings must remain independent');
assert.deepEqual(altered.stages.particle, defaults.stages.particle, 'stage settings must remain independent');

const serialized = JSON.stringify({ version: 1, settings: altered });
assert.deepEqual(parseVisualPreset(serialized), altered);
assert.throws(() => parseVisualPreset('not json'));
assert.throws(() => parseVisualPreset(JSON.stringify({ version: 2, settings: altered })));

console.log('PASS: stage defaults, value bounds, independent stage settings, black/white separation and preset JSON validation.');
