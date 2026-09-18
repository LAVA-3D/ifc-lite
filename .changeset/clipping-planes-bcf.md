---
"@ifc-lite/bcf": minor
---

Exact clipping planes: `createViewpoint` accepts `clippingPlanes` (a point on the plane plus the removed direction, viewer Y-up) written after the section plane's, and `extractViewpointState` returns every `ClippingPlane` exactly as `clippingPlanes` alongside the existing lossy `sectionPlane`. New `ViewerClippingPlane` type with `viewerClippingPlaneToBcf` / `bcfClippingPlaneToViewer`.
