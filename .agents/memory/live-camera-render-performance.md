---
name: Live camera render performance
description: Rendering constraints for keeping the camera preview responsive while the HUD is visible.
---

When optimizing the live camera view, do not apply backdrop filters to translucent HUDs over video, avoid full-screen background-position or layout-property animations, cap high-DPI canvas render ratios, and stop canvas animation loops whenever their visual mode is inactive. Prefer compositor-friendly transform/opacity motion and retain at least 30 FPS for the primary artwork where possible.

**Why:** The user reported severe slowdown when opening the full HUD. Several continuously updated layers were simultaneously filtering or redrawing the moving camera and full-screen background.

**How to apply:** Before adding HUD panels or overlays, check for per-frame video compositing, canvas pixel area, and animation loops that continue while hidden or inactive.
