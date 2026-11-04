---
name: Cloud uploads and local receipts
description: Why browser upload receipt storage must remain optional.
---

Cloud upload receipt persistence is best-effort; browser storage availability must not determine whether a consenting visitor can send finished assets.

**Why:** Browser storage can fail, be blocked, or exhaust quota independently of Firebase, Worker and Cloudinary availability. Treating receipt access as mandatory can prevent every network request or prevent the second asset after the first succeeds.

**How to apply:** Bound receipt operations, preserve successful results in memory, surface storage warnings, and continue the remaining uploads. Report cloud completion separately from local persistence and from Firestore publication.
