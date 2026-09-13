---
"@ifc-lite/wasm": patch
---

The analytic prism void cut's partition self-check no longer accepts a removed solid it cannot measure. Its four volume sums are taken about the host's own AABB centre instead of the frame origin, and the removed solid — the inside fragments plus the reversed reveal caps — must now close before its volume is read at all: over an open surface a divergence sum is set by the reference point rather than by the geometry, so the "removed no more than the cutter holds" bound was reading an artefact. The tolerance now scales with the host's half-extent, the scale those sums round at, in place of the largest world coordinate cubed; on native builds, where host-local coordinates are absolute, a site 9 km out previously bought 0.7 m³ of slack and a removed solid 10 % larger than a 1 m³ cutter passed. Openings that fail the check fall back to the exact kernel, as they already did for every other self-check failure.
