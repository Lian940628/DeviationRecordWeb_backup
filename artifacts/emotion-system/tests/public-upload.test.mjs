// Offline regression tests. All Firebase, Worker, Cloudinary and storage I/O is stubbed.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { webcrypto } from 'node:crypto';
import vm from 'node:vm';
import { test } from 'node:test';

const require = createRequire(import.meta.url);
const { build } = createRequire(require.resolve('vite/package.json'))('esbuild');
const root = new URL('../', import.meta.url).pathname;
const png = new Blob(['finished-png'], { type: 'image/png' });
const video = new Blob(['finished-video'], { type: 'video/webm' });
const draft = {
  cardName: 'Offline fixture', subjectId: 'DR-000001', datasetVisibility: 'PUBLIC',
  deviationLevel: 42, output: { format: 'webm', resolution: '720p' },
  animation: { durationSeconds: 5 }, audio: {},
};
const asset = (type) => ({
  assetId: `asset-${type}`, publicId: `test/${type}`, secureUrl: `https://res.cloudinary.com/test/${type}`,
  resourceType: type,
});
const tick = () => new Promise((resolve) => setTimeout(resolve, 1));

async function compile(entry, mocks, sourceTransform = (source) => source) {
  const result = await build({
    entryPoints: [root + entry], bundle: true, write: false, format: 'cjs',
    platform: 'node', jsx: 'automatic',
    define: { 'import.meta.env.DEV': 'true', 'import.meta.env.BASE_URL': '"/"', 'import.meta.env.VITE_UPLOAD_SIGN_MODE': 'undefined' },
    plugins: [{
      name: 'offline-io',
      setup(builder) {
        builder.onResolve({ filter: /.*/ }, (args) => {
          if (Object.hasOwn(mocks, args.path)) return { path: args.path, namespace: 'stub' };
          if (args.path.endsWith('.css')) return { path: args.path, namespace: 'css-stub' };
        });
        builder.onLoad({ filter: /.*/, namespace: 'stub' }, ({ path }) => ({
          contents: Object.keys(mocks[path]).map((key) =>
            key === 'default'
              ? `export default globalThis.__mocks[${JSON.stringify(path)}].default;`
              : `export const ${key} = globalThis.__mocks[${JSON.stringify(path)}][${JSON.stringify(key)}];`
          ).join('\n'), loader: 'js',
        }));
        builder.onLoad({ filter: /.*/, namespace: 'css-stub' }, () => ({ contents: '' }));
        builder.onLoad({ filter: /DeviationId\.tsx$/ }, async ({ path }) => ({
          contents: sourceTransform(await readFile(path, 'utf8')), loader: 'tsx',
        }));
      },
    }],
  });
  return result.outputFiles[0].text;
}

function sandbox(mocks, extra = {}) {
  return {
    __mocks: mocks, module: { exports: {} }, exports: {}, console,
    Blob, FormData, URL, AbortController, AbortSignal, DOMException,
    crypto: webcrypto, setTimeout, clearTimeout, performance,
    ...extra,
  };
}

async function pageHarness({ visibility = 'PUBLIC', step = 1, imageReady = true, videoReady = true, readReceipt, saveReceipt, upload } = {}) {
  let cursor = 0;
  let stateCursor = 0;
  let dirty = true;
  const slots = [];
  const effects = [];
  const uploadCalls = [];
  const logs = [];
  const downloads = [];
  let syntheticNow = 0;
  const overrides = { 0: { ...draft, datasetVisibility: visibility }, 2: {}, 4: 'ready', 5: true, 6: step, 11: imageReady ? png : null, 12: imageReady ? 'finished.png' : '', 13: videoReady ? video : null, 14: videoReady ? 'finished.webm' : '' };
  const same = (left, right) => left && right && left.length === right.length && left.every((v, i) => Object.is(v, right[i]));
  const react = {
    useState(initial) {
      const index = cursor++;
      const stateIndex = stateCursor++;
      if (!(index in slots)) slots[index] = Object.hasOwn(overrides, stateIndex) ? overrides[stateIndex] : typeof initial === 'function' ? initial() : initial;
      return [slots[index], (value) => {
        const next = typeof value === 'function' ? value(slots[index]) : value;
        if (!Object.is(next, slots[index])) { slots[index] = next; dirty = true; }
      }];
    },
    useRef(initial) { const index = cursor++; return slots[index] ??= { current: initial }; },
    useMemo(fn, deps) {
      const index = cursor++;
      if (!same(slots[index]?.deps, deps)) slots[index] = { deps, value: fn() };
      return slots[index].value;
    },
    useCallback(fn, deps) { return react.useMemo(() => fn, deps); },
    useEffect(fn, deps) {
      const index = cursor++;
      if (!same(slots[index]?.deps, deps)) {
        const previous = slots[index];
        slots[index] = { deps, cleanup: previous?.cleanup };
        effects.push(() => { previous?.cleanup?.(); slots[index].cleanup = fn(); });
      }
    },
  };
  const no = () => {};
  const store = Object.fromEntries([
    'deleteAllProjects', 'deleteProject', 'exportProjectFile', 'getProject', 'importProjectFile',
    'getNextLocalSubjectId', 'saveProject',
  ].map((name) => [name, no]));
  const mocks = {
    react,
    'react/jsx-runtime': { jsx: (type, props) => ({ type, props }), jsxs: (type, props) => ({ type, props }) },
    'lucide-react': Object.fromEntries(['ArrowDownToLine', 'ArrowUpRight', 'Play', 'RotateCcw', 'Square', 'Video'].map((name) => [name, name])),
    '../i18n': { useAppLanguage: () => ({ language: 'en' }) },
    './deviationId/DeviationIdForm': { DeviationIdForm: 'form' },
    './deviationId/DeviationArchive': { DeviationArchive: 'archives' },
    './deviationId/DevFirebaseUid': { DevFirebaseUid: 'uid' },
    './deviationId/copy': { deviationText: (_language, text) => text },
    './deviationId/projectStore': {
      ...store, listProjects: async () => [],
      getCloudinaryUploadReceipt: readReceipt ?? (async () => null),
      saveCloudinaryUploadReceipt: saveReceipt ?? (async () => {}),
    },
    './deviationId/renderPersonFrame': { renderPersonFrame: no },
    './deviationId/imageExport': { renderPostcardPng: async () => png },
    './deviationId/personMatting': { isolatePerson: no },
    './deviationId/types': { createDefaultDraft: () => draft, createProjectKey: () => 'project', MAX_PHOTO_BYTES: 1000 },
    './deviationId/cloudinaryUpload': {
      withUploadTimeout: async (promise) => promise,
      createUploadId: () => '00000000-0000-4000-8000-000000000001',
      uploadFinishedAsset: async (...args) => {
        uploadCalls.push(args);
        return upload ? upload(...args) : asset(args[2]);
      },
    },
  };
  const code = await compile('src/pages/DeviationId.tsx', mocks, (source) => source.replace(
    '  return (\n    <main className="deviation-id-page">',
    '  globalThis.__inspect = { runCloudUpload, updateDraft, cloudUploadStatus, cloudUploadError, cloudUploadProgress, handleContinueDownload, handleDownloadVideo, stepRef, imageBlob, videoBlob, step, error, status, exportProgress };\n  return (\n    <main className="deviation-id-page">',
  ));
  const context = vm.createContext(sandbox(mocks, {
    console: { info: (...args) => logs.push(args), warn: (...args) => logs.push(args), error: (...args) => logs.push(args) },
    window: {
      requestAnimationFrame: (callback) => {
        if (callback.name === 'drawExportFrame') {
          syntheticNow += 1000;
          queueMicrotask(() => callback(syntheticNow));
        }
        return 1;
      },
      cancelAnimationFrame: no, setTimeout, location: { hostname: 'test.replit.dev' },
    },
    performance: { now: () => syntheticNow },
    document: {
      body: { appendChild: (anchor) => { anchor.click = () => downloads.push(anchor.download); } },
      createElement: (tag) => tag === 'canvas' ? {
        width: 0, height: 0, getContext: () => ({}),
        captureStream: () => new MediaStream([{}]),
      } : ({ style: {}, remove: no }),
    },
    HTMLCanvasElement: class { captureStream() {} },
    MediaStream: class {
      constructor(tracks = []) { this.tracks = tracks; }
      getTracks() { return this.tracks; }
      getVideoTracks() { return this.tracks; }
    },
    MediaRecorder: class {
      static isTypeSupported = () => true;
      constructor(_stream, options = {}) { this.state = 'inactive'; this.mimeType = options.mimeType ?? 'video/webm'; }
      start() { this.state = 'recording'; }
      stop() {
        this.state = 'inactive';
        queueMicrotask(() => {
          this.ondataavailable?.({ data: new Blob([new Uint8Array(2048)], { type: this.mimeType }) });
          this.onstop?.();
        });
      }
    },
  }));
  vm.runInContext(code, context);
  const render = () => {
    cursor = 0; stateCursor = 0; dirty = false;
    context.module.exports.default();
    effects.splice(0).forEach((effect) => effect());
  };
  const flush = async () => {
    for (let i = 0; i < 30; i++) { if (dirty) render(); await tick(); }
  };
  const flushExports = async () => {
    for (let i = 0; i < 330; i++) { if (dirty) render(); await tick(); }
  };
  await flush();
  return { context, uploadCalls, logs, downloads, flush, flushExports, inspect: () => context.__inspect };
}

test('PUBLIC sends both finished assets even if optional receipt reads fail', async () => {
  const page = await pageHarness({ readReceipt: async () => { throw new Error('IndexedDB unavailable'); } });
  assert.deepEqual(page.uploadCalls.map((args) => args[2]), ['image', 'video']);
  assert.equal(page.inspect().cloudUploadStatus, 'complete');
});

test('a receipt write failure cannot prevent the video upload', async () => {
  const page = await pageHarness({ saveReceipt: async () => { throw new Error('QuotaExceededError'); } });
  assert.deepEqual(page.uploadCalls.map((args) => args[2]), ['image', 'video']);
});

test('PRIVATE does not call upload or token/signing code', async () => {
  const page = await pageHarness({ visibility: 'PRIVATE' });
  assert.equal(page.uploadCalls.length, 0);
});

test('video downloads are blocked in steps 1–3, allowed only in step 4, then blocked after returning', async () => {
  for (const step of [1, 2, 3]) {
    const page = await pageHarness({ visibility: 'PRIVATE', step });
    page.inspect().handleDownloadVideo();
    assert.deepEqual(page.downloads, []);
    page.inspect().stepRef.current = 4;
    page.inspect().handleDownloadVideo();
    assert.deepEqual(page.downloads, ['finished.webm']);
    page.inspect().stepRef.current = step;
    page.inspect().handleDownloadVideo();
    assert.deepEqual(page.downloads, ['finished.webm']);
  }
});

test('entering step 4 starts each missing export without requiring a download click', async () => {
  const output = await build({
    entryPoints: [root + 'src/pages/deviationId/stepFourExports.ts'],
    bundle: true, write: false, format: 'cjs', platform: 'node',
  });
  const context = vm.createContext({ module: { exports: {} }, exports: {} });
  vm.runInContext(output.outputFiles[0].text, context);
  const { enterStepFourExports, isVideoDownloadAllowed } = context.module.exports;
  const calls = [];
  let selectedStep = 3;
  enterStepFourExports({
    setStep: (value) => { selectedStep = value; },
    imageReady: false, videoReady: false,
    generateImage: () => calls.push('png'), generateVideo: () => calls.push('video'),
  });
  assert.equal(selectedStep, 4);
  assert.deepEqual(calls, ['png', 'video']);
  for (const step of [1, 2, 3]) assert.equal(isVideoDownloadAllowed(step, video, 'finished.webm'), false);
  assert.equal(isVideoDownloadAllowed(4, video, 'finished.webm'), true);
  assert.equal(isVideoDownloadAllowed(4, null, 'finished.webm'), false);
});

test('the actual step-4 action auto-generates both assets and PUBLIC uploads without downloading', async () => {
  const page = await pageHarness({ step: 3, imageReady: false, videoReady: false });
  page.inspect().handleContinueDownload();
  await page.flushExports();
  assert.equal(page.inspect().step, 4);
  assert.ok(page.inspect().imageBlob instanceof Blob);
  assert.ok(page.inspect().videoBlob instanceof Blob, JSON.stringify({ error: page.inspect().error, status: page.inspect().status }));
  assert.deepEqual(page.uploadCalls.map((args) => args[2]), ['image', 'video']);
  assert.deepEqual(page.downloads, []);
});

test('the actual step-4 action generates PRIVATE downloads but never starts cloud upload', async () => {
  const page = await pageHarness({ visibility: 'PRIVATE', step: 3, imageReady: false, videoReady: false });
  page.inspect().handleContinueDownload();
  await page.flushExports();
  assert.equal(page.inspect().step, 4);
  assert.ok(page.inspect().imageBlob instanceof Blob);
  assert.ok(page.inspect().videoBlob instanceof Blob, JSON.stringify({ error: page.inspect().error, status: page.inspect().status }));
  assert.equal(page.uploadCalls.length, 0);
  assert.deepEqual(page.downloads, []);
});

test('PUBLIC toggle while an aborted attempt is settling starts a fresh attempt', async () => {
  let release;
  let first = true;
  const page = await pageHarness({
    upload: async (...args) => {
      if (first) {
        first = false;
        return new Promise((_resolve, reject) => { release = () => reject(new DOMException('cancelled', 'AbortError')); });
      }
      return asset(args[2]);
    },
  });
  page.inspect().updateDraft({ datasetVisibility: 'PRIVATE' });
  await page.flush();
  page.inspect().updateDraft({ datasetVisibility: 'PUBLIC' });
  await page.flush();
  release();
  await page.flush();
  assert.equal(page.inspect().cloudUploadStatus, 'complete');
  assert.deepEqual(page.uploadCalls.map((args) => args[2]), ['image', 'image', 'video']);
});

test('retry keeps the successful image and retries only the failed video', async () => {
  let failVideo = true;
  const page = await pageHarness({
    upload: async (...args) => {
      if (args[2] === 'video' && failVideo) throw new Error('Simulated video HTTP 503');
      return asset(args[2]);
    },
  });
  assert.equal(page.inspect().cloudUploadStatus, 'error');
  failVideo = false;
  await page.inspect().runCloudUpload();
  await page.flush();
  assert.deepEqual(page.uploadCalls.map((args) => args[2]), ['image', 'video', 'video']);
  assert.equal(page.inspect().cloudUploadStatus, 'complete');
});

test('PUBLIC cannot start with only one finished export', async () => {
  for (const readiness of [{ imageReady: false }, { videoReady: false }]) {
    const page = await pageHarness(readiness);
    assert.equal(page.uploadCalls.length, 0);
    assert.equal(page.inspect().cloudUploadStatus, 'waiting');
  }
});

test('changing only PUBLIC consent preserves exports and starts the completion flow', async () => {
  const page = await pageHarness({ visibility: 'PRIVATE' });
  page.inspect().updateDraft({ datasetVisibility: 'PUBLIC' });
  await page.flush();
  assert.deepEqual(page.uploadCalls.map((args) => args[2]), ['image', 'video']);
});

const signingPayload = (type) => ({
  uploadUrl: `https://api.cloudinary.com/v1_1/wqw0n08u/${type}/upload`,
  apiKey: 'offline-api-key', signature: 'offline-dummy-signature',
  params: { public_id: `test/${type}`, upload_preset: 'deviation_id_upload', timestamp: 1, overwrite: false },
  publicId: `test/${type}`, resourceType: type,
});

async function helperHarness({ currentUser = true, signStatuses = [200], cloudStatus = 200, invalidJson = false, missingPublicId = false, tokenAction } = {}) {
  const fetches = [];
  const xhrs = [];
  const tokenRefreshes = [];
  const logs = [];
  const mocks = {
    '../../auth/firebaseAuth': {
      getFirebaseAuth: () => ({
        authStateReady: async () => {},
        currentUser: currentUser ? {
          isAnonymous: true,
          getIdToken: async (refresh) => {
            tokenRefreshes.push(refresh);
            tokenAction?.();
            return 'offline-private-firebase-token';
          },
        } : null,
      }),
    },
  };
  const context = vm.createContext(sandbox(mocks, {
    Response,
    window: { location: { hostname: 'test.replit.dev' } },
    console: { info: (...args) => logs.push(args) },
    fetch: async (url, options) => {
      fetches.push({ url, options });
      const status = signStatuses[Math.min(fetches.length - 1, signStatuses.length - 1)];
      const payload = signingPayload(JSON.parse(options.body).assetType);
      if (missingPublicId) delete payload.params.public_id;
      return new Response(invalidJson ? '<html>Vite fallback</html>' : JSON.stringify(
        status === 200 ? payload : { error: 'Test UID not allowed.' },
      ), { status, headers: { 'Content-Type': invalidJson ? 'text/html' : 'application/json' } });
    },
    XMLHttpRequest: class {
      upload = {};
      open(method, url) { this.method = method; this.url = url; }
      send(form) {
        xhrs.push({ method: this.method, url: this.url, form });
        const type = this.url.includes('/image/') ? 'image' : 'video';
        this.status = cloudStatus;
        this.response = cloudStatus === 200 ? {
          asset_id: `asset-${type}`, public_id: `test/${type}`, secure_url: `https://res.cloudinary.com/test/${type}`, resource_type: type,
        } : { error: { message: 'Invalid Signature offline-dummy-signature. Simulated Cloudinary rejection' } };
        queueMicrotask(() => this.onload());
      }
      abort() { this.onabort?.(); }
    },
  }));
  vm.runInContext(await compile('src/pages/deviationId/cloudinaryUpload.ts', mocks), context);
  const upload = (type = 'image', signal = new AbortController().signal) => context.module.exports.uploadFinishedAsset(
    type === 'image' ? png : video, `finished.${type === 'image' ? 'png' : 'webm'}`,
    type, '00000000-0000-4000-8000-000000000001', signal, () => {},
  );
  return { upload, fetches, xhrs, logs, tokenRefreshes };
}

test('existing Firebase token, signing contract, separate URLs, FormData and returned IDs all match', async () => {
  const helper = await helperHarness();
  for (const type of ['image', 'video']) {
    const result = await helper.upload(type);
    const signed = helper.fetches.at(-1);
    const request = JSON.parse(signed.options.body);
    assert.equal(signed.url, '/api/upload/sign');
    assert.equal(signed.options.headers.Authorization, 'Bearer offline-private-firebase-token');
    assert.deepEqual(request, {
      submissionId: '00000000-0000-4000-8000-000000000001', assetType: type,
      mimeType: type === 'image' ? 'image/png' : 'video/webm',
      bytes: (type === 'image' ? png : video).size, publicConsent: true,
    });
    const cloud = helper.xhrs.at(-1);
    assert.equal(cloud.url, signingPayload(type).uploadUrl);
    assert.equal(cloud.form.get('file').size, request.bytes);
    assert.equal(cloud.form.get('api_key'), 'offline-api-key');
    assert.equal(cloud.form.get('signature'), 'offline-dummy-signature');
    for (const [key, value] of Object.entries(signingPayload(type).params)) assert.equal(cloud.form.get(key), String(value));
    assert.equal(result.assetId, `asset-${type}`);
    assert.equal(result.publicId, `test/${type}`);
    assert.equal(result.secureUrl, `https://res.cloudinary.com/test/${type}`);
  }
  const output = JSON.stringify(helper.logs);
  assert.ok(output.includes('TOKEN_OK') && output.includes('SIGN_OK') && output.includes('CLOUDINARY_RESPONSE'));
  assert.ok(!output.includes('offline-private-firebase-token') && !output.includes('offline-dummy-signature'));
});

test('no existing Firebase user produces a visible failure without logging in or signing', async () => {
  const helper = await helperHarness({ currentUser: false });
  await assert.rejects(helper.upload(), /No sign-in was started/);
  assert.equal(helper.fetches.length, 0);
  assert.equal(helper.xhrs.length, 0);
  assert.match(JSON.stringify(helper.logs), /TOKEN_FAILED/);
});

test('Worker 403 preserves HTTP status and never sends Cloudinary bytes', async () => {
  const helper = await helperHarness({ signStatuses: [403] });
  await assert.rejects(helper.upload(), /HTTP 403: Test UID not allowed/);
  assert.equal(helper.xhrs.length, 0);
  assert.match(JSON.stringify(helper.logs), /SIGN_FAILED/);
});

test('Worker 401 refreshes only the existing token, once', async () => {
  const helper = await helperHarness({ signStatuses: [401, 200] });
  await helper.upload();
  assert.deepEqual(helper.tokenRefreshes, [false, true]);
  assert.equal(helper.fetches.length, 2);
  assert.equal(helper.xhrs.length, 1);
});

test('Cloudinary rejection includes HTTP status and asset failure stage', async () => {
  const helper = await helperHarness({ cloudStatus: 400 });
  await assert.rejects(helper.upload(), /Cloudinary image HTTP 400/);
  assert.match(JSON.stringify(helper.logs), /PNG_FAILED/);
  assert.ok(!JSON.stringify(helper.logs).includes('offline-dummy-signature'));
});

test('HTML route fallback and unsigned public_id are diagnosed before sending bytes', async () => {
  for (const scenario of [{ invalidJson: true }, { missingPublicId: true }]) {
    const helper = await helperHarness(scenario);
    await assert.rejects(helper.upload(), /non-JSON|signed public_id/);
    assert.equal(helper.xhrs.length, 0);
  }
});

test('revoking consent while obtaining a token prevents the signing request', async () => {
  const controller = new AbortController();
  const helper = await helperHarness({ tokenAction: () => controller.abort() });
  await assert.rejects(helper.upload('image', controller.signal), { name: 'AbortError' });
  assert.equal(helper.fetches.length, 0);
  assert.equal(helper.xhrs.length, 0);
});

test('actual API proxy forwards exact contract, token and Origin; PRIVATE is rejected before Worker', async () => {
  let handler;
  const fetches = [];
  const mocks = { express: { Router: () => ({
    post: (route, callback) => { assert.equal(route, '/upload/sign'); handler = callback; },
  }) } };
  const context = vm.createContext(sandbox(mocks, {
    Response, process: { env: { NODE_ENV: 'test' } },
    fetch: async (url, options) => {
      fetches.push({ url, options });
      return new Response(JSON.stringify(signingPayload('image')), { status: 200 });
    },
  }));
  vm.runInContext(await compile('../api-server/src/routes/uploads.ts', mocks), context);
  const body = {
    submissionId: '00000000-0000-4000-8000-000000000001', assetType: 'image',
    mimeType: 'image/png', bytes: png.size, publicConsent: true,
  };
  const req = {
    body, get: (key) => ({ authorization: 'Bearer offline-long-enough-test-token', origin: 'https://test.replit.dev' }[key]),
    log: { warn: () => {}, info: () => {} },
  };
  const res = { status(code) { this.code = code; return this; }, json(payload) { this.payload = payload; } };
  await handler(req, res);
  assert.equal(res.code, 200);
  assert.equal(fetches[0].url, 'https://deviationvalueweb.wang-elaine628.workers.dev/upload/sign');
  assert.equal(fetches[0].options.headers.Origin, 'https://test.replit.dev');
  assert.equal(fetches[0].options.headers.Authorization, 'Bearer offline-long-enough-test-token');
  assert.deepEqual(JSON.parse(fetches[0].options.body), body);
  await handler({ ...req, body: { ...body, publicConsent: false } }, res);
  assert.equal(res.code, 400);
  assert.equal(fetches.length, 1);
});
