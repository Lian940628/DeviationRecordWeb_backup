---
name: Mobile camera fullscreen
description: Fullscreen and HUD layout constraints for the camera experience on phones.
---

For camera experiences on mobile, try the standard element fullscreen API first, then fall back to a fixed viewport-sized app surface when the browser rejects it. Keep an exit control inside the preview because the surrounding controls disappear in fullscreen. On narrow screens, place collapsed HUD metrics in a short horizontal strip and constrain expanded details to a scrollable partial-height panel.

**Why:** Mobile browsers differ in support for fullscreen on arbitrary elements, and a desktop-style vertical HUD can obscure nearly the entire phone preview.

**How to apply:** Check both the fullscreen API path and the CSS fallback, and verify that preview content and an exit affordance remain visible at phone sizes.
