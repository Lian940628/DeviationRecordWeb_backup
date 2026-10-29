---
name: Expression heuristic sensitivity
description: Tuning browser-local MediaPipe blendshape rules without overclaiming emotion confidence.
---

Use class-specific support thresholds for heuristic labels rather than forcing every expression through one cutoff. SAD and ANGRY may need lower support than HAPPY and SURPRISED, but keep ambiguity margins and class-specific cue checks so one isolated blendshape does not trigger a label. Expose the rule and support in Debug Mode, and continue to call the scores heuristic support rather than probabilities.

**Why:** The same fixed threshold suppressed sad and angry cues that were weaker than smile/neutral signals, while lowering every label uniformly would raise false positives.

Define neutral support from the strongest raw facial-action cue, not as a complement of a weighted expression support; the two scores use different rules and are not calibrated probabilities.

**Why:** A weighted, moderate smile could be labeled HAPPY while its complementary NEUTRAL score appeared numerically higher, which users could interpret as a contradictory confidence report.

For the NEUTRAL label itself, retain the low weighted-support fallback (≤0.20), but let SAD/ANGRY override it when their class-specific cue pattern and margin pass.

**Why:** Tightening neutral to reject every raw action over 0.20 caused ordinary low-level facial movement to become UNKNOWN.

**How to apply:** When changing weights or thresholds, validate representative feature vectors and inspect actual top blendshapes in Debug Mode. Preserve UNKNOWN when competing cues are close or corroboration is missing.

For distant faces, judge reliability using native source pixels, not the apparent size after cropping/resizing; keep pose/feature corroboration gates rather than lowering all detector thresholds.

**Why:** Full-frame input can lose small faces during model resizing, but enlarging a crop cannot recover missing facial detail.

**How to apply:** Separate no-face, small-source-face, pose and classification failures in diagnostics; preserve UNKNOWN when detail is insufficient.

Real-camera acceptance includes SAD/ANGRY and use at approximately 1.5 metres. Deterministic blendshape-vector tests verify rules, not real-world recognition accuracy.

**Why:** The user reported that sad/angry and distant-face recognition still failed after multiple threshold adjustments whose synthetic checks passed.

**How to apply:** Do not claim these cases are resolved from unit tests alone. If they still fail, inspect native face size and measured per-class action cues from the real camera before further tuning.
