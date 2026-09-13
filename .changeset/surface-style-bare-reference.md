---
"@ifc-lite/wasm": patch
---

A bare entity reference written where a list is expected now colours the 3D mesh. An `IfcStyledItem` whose `Styles` is `#20` instead of `(#20)`, the same inside an IFC2X3 `IfcPresentationStyleAssignment`, and a material's `IfcStyledRepresentation` whose `Items` is a bare reference all rendered in the default colour, while the 2D symbolic overlay already read a bare reference as a one-element list. Every entity-reference list read in the processing pipeline now goes through one reader with that rule.
