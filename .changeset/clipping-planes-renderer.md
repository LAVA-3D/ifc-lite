---
"@ifc-lite/renderer": minor
---

Clipping planes: `RenderOptions.clipPlanes` accepts up to eight world-space half-spaces (`ClipPlane`: unit normal into the removed side plus distance) whose intersection is kept, honoured by the mesh, instanced, shadow and point-cloud shaders, the GPU picker and the CPU raycaster. The axis-aligned `clipBox` option is kept and expanded into six planes at the boundary. `PickClipState.clipBox` is replaced by `PickClipState.clipPlanes`; the per-draw uniform block grows from 240 to 336 bytes.
