---
name: Person detection precision
description: Reduce transient false-positive person tracks without claiming perfect object-class accuracy.
---

Do not expose a person track from one object-detection frame. Keep a minimum confidence threshold and require consecutive detections before drawing/counting a new track. A temporal gate reduces transient errors but cannot prove a persistent object is human; if a stationary object remains misclassified, validate it with a pose-aware model rather than endlessly raising confidence thresholds.

**Why:** COCO-SSD can classify non-human objects as people. Raising the score alone can also suppress distant or partially occluded people.

**How to apply:** When a false positive persists, inspect its confidence and bounding-box shape from real camera diagnostics; consider a local pose-landmark confirmation stage if threshold and persistence gates are insufficient.
