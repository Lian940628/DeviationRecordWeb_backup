---
name: MediaPipe module worker loading
description: Why Tasks Vision's WASM fileset must match an ES module worker.
---

For Tasks Vision 1.2.0 in an ES module worker, select the ES module WASM fileset using the resolver's `useModule` argument. Keep the worker itself and its bundled output as ES modules.

**Why:** The default classic loader declares `var ModuleFactory`. When a module worker cannot use `importScripts`, Tasks Vision dynamically imports that loader, leaving the variable module-scoped instead of on the worker global. Initialization then fails with `ModuleFactory not set.` The module loader explicitly publishes its factory on `globalThis`.

**How to apply:** Match WASM loader format to worker format whenever upgrading or changing runtime setup. Do not switch the Vite worker to classic merely to permit `importScripts`: development worker source still contains ES imports and will fail to parse.
