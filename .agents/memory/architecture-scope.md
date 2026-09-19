---
name: Architecture scope
description: Scope and safety constraints for adapting the CareRelay AI architecture.
---
The original frontend-only scope is superseded for the authenticated branch: the user explicitly requested bringing main into production-auth-and-rbac. Preserve the authenticated branch's authorization boundary when reconciling demo features.

**Why:** Main's document/demo workflow and the authenticated branch evolved independently. A merge that reinstates demo personas or local demo writes can silently bypass the authenticated care-record model. The architecture still is not permission to silently replace teammates' work.

**How to apply:** Do not describe fixture extraction as general AI or client-side persona filtering as production authorization. Require review of ambiguous dates and preserve source evidence; unsupported text must not generate invented fixture facts.

The hackathon's acceptance criterion is end-to-end selective delivery, not merely different dashboard layouts.

**Why:** Earlier implementations filtered task lists but left raw timelines visible to support roles, and treated appointment approval as equivalent to accepting transportation.

**How to apply:** Verify both visible context and permitted actions for each role, and verify elder reassurance against the accepted transportation responsibility rather than the appointment's approval.