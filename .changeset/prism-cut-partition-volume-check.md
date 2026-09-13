---
"@ifc-lite/wasm": patch
---

The analytic prism void cut's partition self-check now reads its volumes at the host's own scale. Its four sums are taken about the host's AABB centre instead of the frame origin, so they cancel against each other rather than about four different reference points, and the tolerance scales with the host's half-extent — the scale those recentred sums round at — in place of the largest world coordinate cubed. On native builds, where host-local coordinates are absolute metres, a site 9 km out previously bought 0.7 m³ of slack on the "removed no more than the cutter holds" bound, and a removed solid 10 % larger than a 1 m³ cutter passed. The half-extent form is no looser than the world-magnitude form at any site. Openings that fail the check fall back to the exact kernel, as they already did for every other self-check failure.
