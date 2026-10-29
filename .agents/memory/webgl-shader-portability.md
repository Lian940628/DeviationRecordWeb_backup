---
name: WebGL shader portability
description: Constraints encountered compiling this project's WebGL 1 GLSL shaders in Chromium.
---

Keep nested GLSL ES loops statically bounded: initialize each loop index with a constant and iterate to a compile-time constant, then skip unwanted pairs with an `if` guard inside the loop. Also avoid GLSL reserved identifiers for local variables.

**Why:** Chromium's WebGL shader compiler rejected a nested loop whose inner index started from the outer index, so build success alone did not validate runtime shader compilation.

**How to apply:** When adding shader loops, compile/link and render the actual shader in a WebGL browser harness in addition to running the TypeScript and production builds.
