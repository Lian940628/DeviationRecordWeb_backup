---
name: MediaPipe worker canvas
description: Worker initialization behavior in MediaPipe Tasks Vision when selecting a canvas.
---

When initializing `@mediapipe/tasks-vision` in a dedicated worker, pass an explicit `OffscreenCanvas` when the browser supports it. In version 1.2.0, the default canvas selection may call `document.createElement("canvas")`, which is unavailable in workers.

**Why:** A missing document can turn model initialization into a runtime failure even when the model and WASM assets are reachable.

**How to apply:** Keep worker setup explicit about its canvas. If targeting a browser without worker-compatible `OffscreenCanvas`, use a main-thread fallback or surface a clear unsupported-model status rather than assuming model files are broken.

The CPU delegate still needs a working WebGL canvas for the vision image-input path.

**Why:** A browser test without either main-thread or worker WebGL could initialize the graph but failed on image inference with an `activeTexture` error.

**How to apply:** Distinguish successful model initialization from successful image inference. Probe both canvas and worker OffscreenCanvas WebGL capabilities before attributing this error to model loading.
