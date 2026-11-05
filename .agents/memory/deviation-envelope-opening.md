---
name: Invitation envelope cutting
description: Geometry and transition invariants for DEVIATION ID's Step 01 envelope interaction.
---

**Rule:** Measure cut progress from the blade tip against the envelope's physical top lip. Preserve the last projected position while the blade approaches or briefly leaves the edge; only advance from left to right, and normalize snapped endpoints to exactly 0% or 100%. After a complete cut, advance flap separation, paper reveal, envelope fall, and paper expansion through CSS `animationend` events, then call the real Step 02 callback.

**Why:** A cut line placed on the envelope's front face or a lost projection during approach can make a real drag appear correct but never finish. Timed transitions can also move the React workflow before the visible animation completes.

**How to apply:** When changing the envelope geometry or animation, keep the source path attached to the physical top edge, synchronize the overlay with its transformed position, and verify a browser pointer drag all the way through to Step 02.
