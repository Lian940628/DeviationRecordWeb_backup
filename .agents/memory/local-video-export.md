---
name: Processed video export
description: Capturing shader-processed clips without blocking browser rendering
---

For processed video export, analyze the selected clip locally while paused, then reuse time-aligned person-track samples during playback and recording. Keep TensorFlow inference out of the active MediaRecorder capture loop, and relay WebGL-rendered frames through a 2D canvas when direct WebGL capture is unreliable.

**Why:** Browser testing showed that first-run and repeated model inference can stall the main thread long enough for video playback to pass the trim boundary before the recorder receives frames. Direct WebGL canvas capture may also produce empty output.

**How to apply:** Precompute real person tracks from local frames, align them to playback time, composite the HUD and current per-track expression readouts into the captured 2D canvas, and keep track samples visible in the paused result after recording. Switch back to live inference during playback; describe expression scores as heuristic indices, not probabilities.
