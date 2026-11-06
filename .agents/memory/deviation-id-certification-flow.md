---
name: DEVIATION ID certification flow
description: Product and interaction requirements for the STEP 02 certification moment.
---

**Rule:** Do not show an idle stamp in STEP 02. After a valid profile submission, show a full-screen centered digital certification mark with a cyan/teal glow and synthesized impact sound, then advance to STEP 03 after the mark completes. The seal uses concentric calibration rings, curved certification lettering, and a bold horizontal certification banner. Audio is decorative and must never block the step change.

**Why:** The user wants certification to feel like a dramatic, screen-wide confirmation rather than a small stamp beside the submit button, and provided a circular ring-and-banner reference for its appearance.

**How to apply:** Trigger the audio from the submit gesture for browser autoplay compatibility, keep the overlay non-interactive and viewport-centered, and preserve the existing form validation and progression callback.
