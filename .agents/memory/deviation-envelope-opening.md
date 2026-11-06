---
name: Invitation envelope style and cutting
description: Visual direction, geometry, and transition invariants for DEVIATION ID's Step 01 envelope.
---

**Rule:** Measure cut progress from the blade tip against the envelope's physical top lip. Preserve the last projected position while the blade approaches or briefly leaves the edge; only advance from left to right, and normalize snapped endpoints to exactly 0% or 100%. After a complete cut, advance flap separation, paper reveal, envelope fall, and paper expansion through CSS `animationend` events, then call the real Step 02 callback.

**Why:** A cut line placed on the envelope's front face or a lost projection during approach can make a real drag appear correct but never finish. Timed transitions can also move the React workflow before the visible animation completes.

**How to apply:** When changing the envelope geometry or animation, keep the source path attached to the physical top edge, synchronize the overlay with its transformed position, and verify a browser pointer drag all the way through to Step 02.

**Visual direction:** Keep the envelope itself free of printed words; place its abstract postage graphic at the upper-right of the front face. Preserve visible buoyant motion and restrained cyan/teal electronic details. The letter opener needs an obvious, generous grab target and must track pointer movement directly.

**Why:** The user rejected text printed on the envelope and misplaced center-seal styling, and reported that the opener was difficult to grab and follow. These are specific Step 01 product requirements.

**How to apply:** Keep instructional copy outside the envelope; use graphic-only marks on it, make the opener's interactive area easier to hit than its visible handle, and keep ambient animation and scan effects lightweight.

**Visual update:** The current envelope direction is a wordless, dark metallic teal form against a vertically pleated black-teal curtain, with restrained cyan edge glow and the abstract postage graphic at upper-right. Keep the envelope scaled to fit without clipping; do not place a seal or circular ornament at its center. Preserve the existing float, scan, circuit, and letter-opener effects.

**Why:** The user asked for the Step 01 envelope to take cues from a cinematic teal curtain-and-metal reference while keeping the existing effects, then clarified the envelope was too large and explicitly requested removal of its center ring/seal.

**How to apply:** Keep future envelope refinements within this material and lighting direction; do not add printed words or a center seal, or remove the upper-right graphic mark.

**Transition direction:** When the invitation completes and advances from Step 01 to Step 02, use a four-second cyan Matrix Rain code overlay; it must be decorative, non-blocking, and limited to that transition.

**Why:** The user specifically requested the Matrix Rain effect for the Step 01 → Step 02 transition.

**How to apply:** Trigger it only after the envelope-opening sequence completes, let Step 02 appear beneath it, keep the canvas scoped to those four seconds, and clean it up afterward so it does not affect other steps or camera/rendering performance.
