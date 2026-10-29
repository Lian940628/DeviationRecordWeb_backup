---
name: Camera fitting and coordinates
description: Preserve the full camera source and keep every visual layer aligned.
---

Use contain-style fitting for the camera image rather than filling the viewport by cropping. Update raw video, artwork texture mapping, bounding boxes, and person connections together whenever fitting or mirroring changes.

**Why:** A CSS-only fitting change can reveal the full image while leaving AI overlays and generated effects in the old cropped coordinate space.

**How to apply:** Account for centered letterbox padding in every projected coordinate. Mirror within the fitted image region, not an unrelated full-canvas width.
