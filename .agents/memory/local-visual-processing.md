---
name: Local visual processing
description: Privacy boundary for EMOTION / SYSTEM camera and computer-vision features.
---

Process webcam frames, person tracks, face landmarks, expression estimates, and visual effects only in the visitor's browser. Do not upload, record, or persist camera imagery or facial features. Downloading model files is allowed.

**Why:** The user explicitly requires browser-local processing and no transmission or storage of camera data.

**How to apply:** Keep future camera, AI, and rendering integrations client-side; do not add server calls for frames, landmarks, or derived biometric data.
