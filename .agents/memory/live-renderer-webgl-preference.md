---
name: Live renderer WebGL preference
description: Browser context preference for the live camera effects renderer.
---

For the live camera effects renderer, request WebGL with the browser-default power preference first, then retry with `high-performance` if needed. Do not force a high-performance context as the only option.

**Why:** The live effects failed to render in the user's browser with a forced high-performance context. Trying the browser default first restored the effects after reload.

**How to apply:** Use this preference order for the live camera renderer. Keep an explicit unavailable-WebGL state if both attempts fail; do not silently show the raw camera as if effects were active.
