---
name: Expression heuristic sensitivity
description: Tuning browser-local MediaPipe blendshape rules without overclaiming emotion confidence.
---

Use class-specific support thresholds for heuristic labels rather than forcing every expression through one cutoff. SAD and ANGRY may need lower support than HAPPY and SURPRISED, but keep ambiguity margins and class-specific cue checks so one isolated blendshape does not trigger a label. Expose the rule and support in Debug Mode, and continue to call the scores heuristic support rather than probabilities.

**Why:** The same fixed threshold suppressed sad and angry cues that were weaker than smile/neutral signals, while lowering every label uniformly would raise false positives.

Define neutral support from the strongest raw facial-action cue, not as a complement of a weighted expression support; the two scores use different rules and are not calibrated probabilities.

**Why:** A weighted, moderate smile could be labeled HAPPY while its complementary NEUTRAL score appeared numerically higher, which users could interpret as a contradictory confidence report.

**How to apply:** When changing weights or thresholds, validate representative feature vectors and inspect actual top blendshapes in Debug Mode. Preserve UNKNOWN when competing cues are close or corroboration is missing.

For distant faces, scale the minimum reliable face-mesh geometry to the 720p input size and keep pose/feature corroboration gates; do not lower every detector threshold together.

**Why:** The earlier 3.5% frame-width gate excluded face meshes around 45 pixels wide at 1280×720, even when the person detector still found the body.

**How to apply:** When adjusting distance sensitivity, test the actual face pixel width in the debug overlay and preserve UNKNOWN below the mesh's reliable resolution.
