---
name: Expression heuristic sensitivity
description: Tuning browser-local MediaPipe blendshape rules without overclaiming emotion confidence.
---

Use class-specific support thresholds for heuristic labels rather than forcing every expression through one cutoff. SAD and ANGRY may need lower support than HAPPY and SURPRISED, but keep ambiguity margins and class-specific cue checks so one isolated blendshape does not trigger a label. Expose the rule and support in Debug Mode, and continue to call the scores heuristic support rather than probabilities.

**Why:** The same fixed threshold suppressed sad and angry cues that were weaker than smile/neutral signals, while lowering every label uniformly would raise false positives.

**How to apply:** When changing weights or thresholds, validate representative feature vectors and inspect actual top blendshapes in Debug Mode. Preserve UNKNOWN when competing cues are close or corroboration is missing.
