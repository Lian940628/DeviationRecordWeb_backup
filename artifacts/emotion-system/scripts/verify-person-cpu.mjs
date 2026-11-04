// Real-model diagnostic, no WebGL, browser, upload or Firebase.
// Supply a local 8-bit RGBA file, width and height (maximum 512 each).
import assert from 'node:assert/strict';
import { readFile, writeFile, mkdtemp, rm } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const require = createRequire(import.meta.url);
const { build } = createRequire(require.resolve('vite/package.json'))('esbuild');
const [path, widthText, heightText] = process.argv.slice(2);
assert.ok(path && widthText && heightText, 'Usage: node scripts/verify-person-cpu.mjs local.rgba WIDTH HEIGHT');
const width = Number(widthText);
const height = Number(heightText);
const bytes = await readFile(path);
const pixels = Uint8Array.from(bytes).buffer;
assert.equal(typeof globalThis.WebGLRenderingContext, 'undefined');
assert.equal(typeof globalThis.document, 'undefined');

const temporary = await mkdtemp(join(tmpdir(), 'person-cpu-'));
try {
  const bundle = await build({
    entryPoints: [new URL('../src/pages/deviationId/cpuPersonSegmentation.ts', import.meta.url).pathname],
    bundle: true, platform: 'node', format: 'cjs', write: false, logLevel: 'silent',
  });
  const modulePath = join(temporary, 'cpu.cjs');
  await writeFile(modulePath, bundle.outputFiles[0].contents);
  const { segmentRgbaOnCpu } = require(modulePath);
  for (let attempt = 1; attempt <= 2; attempt += 1) {
    const started = performance.now();
    const result = await segmentRgbaOnCpu(pixels, width, height);
    assert.equal(result.values.length, width * height);
    assert.equal(result.width, width);
    assert.equal(result.height, height);
    assert.ok(result.values.every((value) => value === 0 || value === 1));
    const foreground = result.values.reduce((sum, value) => sum + value, 0);
    const ratio = foreground / result.values.length;
    assert.ok(ratio > 0.005 && ratio < 0.95, `Expected a visible person and removable background, got ${ratio}`);
    console.log(JSON.stringify({ attempt, width, height, foregroundPixels: foreground, foregroundRatio: ratio, milliseconds: Math.round(performance.now() - started), webgl: false }));
  }
} finally {
  await rm(temporary, { recursive: true, force: true });
}
