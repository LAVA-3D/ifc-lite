---
"@ifc-lite/renderer": patch
---

Section cut: the GPU clip, the 3D hatched cap and the 2D drawing now resolve the slider's 0..100% over one shared range (`resolveSectionSliderRange`). The clip used to fall back to its own mesh bounds whenever the viewer's range poked outside them, while the cap and the drawing kept the viewer's range, so the hatched cut floated above the clipped geometry. A viewer range that overlaps the meshes is now honoured even when it is wider than them; a degenerate or non-overlapping range still falls back.
