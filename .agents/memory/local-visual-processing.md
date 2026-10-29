---
name: Local visual processing
description: Privacy boundary for EMOTION / SYSTEM camera and computer-vision features.
---

Process webcam frames, person tracks, face landmarks, expression estimates, and visual effects only in the visitor's browser; never upload or server-persist them. The user explicitly wants photos and recordings to be generated and downloaded locally from the visible browser tab, including visible effects and information panels, after an explicit capture action. Fullscreen photos must capture the in-page preview locally without opening a browser screen-share picker or leaving fullscreen.

**Why:** The user requires browser-local processing and no transmission of camera data, explicitly requests local downloads of the rendered screen, and does not want fullscreen photo capture to interrupt the display.

**How to apply:** Keep camera, AI, and rendering client-side; do not add server calls for frames, landmarks, or derived biometric data. Ask for screen capture only from a user-initiated capture button and save the result locally. In fullscreen, capture the preview and its visible effect/HUD layers in-page instead of requesting display capture.
