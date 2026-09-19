---
name: Architecture scope
description: Scope and safety constraints for adapting the CareRelay AI architecture.
---
Keep the architecture adaptation a clearly labeled frontend demo unless the user explicitly authorizes live backend/integration work.

**Why:** The original brief reserves messaging and transcription integrations for another developer. The architecture describes a larger target system, not permission to silently replace teammates' work.

**How to apply:** Do not describe fixture extraction as general AI or client-side persona filtering as production authorization. Require review of ambiguous dates and preserve source evidence; unsupported text must not generate invented fixture facts.

The hackathon's acceptance criterion is end-to-end selective delivery, not merely different dashboard layouts.

**Why:** Earlier implementations filtered task lists but left raw timelines visible to support roles, and treated appointment approval as equivalent to accepting transportation.

**How to apply:** Verify both visible context and permitted actions for each role, and verify elder reassurance against the accepted transportation responsibility rather than the appointment's approval.