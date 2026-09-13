---
"@ifc-lite/wasm": patch
---

The analytic prism void cut's "removed no more than the cutter holds" bound no longer carries a world-magnitude slack, and neither of the two bounds it takes on the removed volume depends any more on where that volume is read from. The slack used to be `1e-12 × (largest world coordinate + 1)³`, which is a roundoff scale for the partition identity's origin-referenced sums but not for a comparison against the cutter's analytic volume: on native builds, where host-local coordinates are absolute metres, a site 9 km out bought 0.73 m³ of it and a removed solid 10 % larger than a 1 m³ cutter passed. It now scales with the removed region's own half-extent, which is the same number wherever the site is.

The removed region is not closed where the self-check runs — the per-triangle CDT leaves coplanar gaps that the consolidation pass closes afterwards — so its volume moves with the reference point by exactly `δ · A / 6`, `A` being the region's summed doubled-area normal. A reading at one point cannot be used to decide whether the analytic cut commits or the opening goes to the exact kernel, because a different point reaches a different answer: measured on a 1.1 m³ open region, the reading moves from 0.92 m³ at the origin to −3416 m³ at 9 km, and the cutter bound flips. Both bounds are now applied to the whole interval `volume ± |A| · radius / 6`, so every reference the region admits reaches one verdict. A region that does close carries `A = 0` to roundoff and reads exactly as it did; over this repo's census corpus that is 2191 of 2483 cuts, and no host's output moves.

Openings that fail the check fall back to the exact kernel, as they already did for every other self-check failure.
