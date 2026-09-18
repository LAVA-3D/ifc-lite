# Clipping planes

Status: proof of concept, not yet filed as an issue. This page records the
design the feature was agreed against and what the proof of concept covers.

## Why

The Section tool cuts along one plane and exists to produce 2D sections.
BIMcollab Zoom style review work needs something different: several planes at
once, added from the faces of the model, moved along their normals, and
exchanged through BCF so a viewpoint from another tool shows the same clipped
volume here. Six such planes form a box.

## Agreed design

### Model

- A flat list of up to **eight** independent planes. Each plane is a unit
  normal, a signed distance (`dot(p, normal) = distance` is on the plane), an
  enabled flag, an id and the world point it was created from.
- The kept region is the **intersection** of the half-spaces
  `dot(p, normal) - distance <= 0`. The normal points into the removed half,
  which is also the BCF `Direction` convention.
- The list is **persistent viewer state**, independent of the active tool. It
  combines with the Section tool's cut when both are active. Session only, not
  persisted to local storage.
- **Cleared** when all models are cleared and on a session reset. Removing one
  model leaves it. "Show all" and Home leave it alone. Only "Remove all", a
  loaded BCF viewpoint, the per-plane remove action and the SDK change the set.

### Creation

- Right-click a face, **Add clipping plane**. A CPU raycast at the menu's
  screen position gives the face normal and the hit point.
- The plane **removes the side the face normal points into** (the outward
  side of the element, also the camera side). It is pushed **1 mm** outward so
  the picked face stays visible.
- A new plane whose normal is within **2 degrees** of an existing plane's
  normal, pointing the same way, **replaces** it. Opposite normals are the two
  walls of a box and are kept.
- No flip action. A wrong plane is removed and re-added from the other face.

### Moving

- One arrow gizmo per plane, dragged along the plane normal.
- A move is **clamped** so any pair of opposite planes keeps at least a
  **10 mm** gap.
- A move or add is **rejected** when the kept region would no longer intersect
  the model bounds. The check clips the model AABB by every half-space and is
  conservative, so it never rejects a valid state.

### UI

- Translucent quad plus arrow gizmo per plane, as an SVG overlay projected per
  frame like the Section tool's custom-plane gizmo.
- The quad is **centred on the model, not on the picked point**: it is the
  face of the kept region on that plane (the model bounds cut by every other
  enabled plane), grown by a **1 m margin** on every side. A lone plane draws
  the model's silhouette plus the margin; six planes boxing in a small volume
  draw six small faces that overshoot each other by the margin instead of six
  model-sized sheets. The gizmo sits at the quad's centroid. A plane dragged
  past the padded bounds keeps a model-sized square so it stays visible.
- One toolbar button, **Clipping**, with a dropdown: enable or disable all
  planes, show or hide the handles, remove all planes, and a count badge.
- Right-click on a plane quad offers **Remove plane**.
- No list panel and no numeric input in the first version.

### Renderer

- The unused axis-aligned `clipBox` lanes become an array of **eight plane
  lanes** plus a count. `RenderOptions.clipBox` stays as a convenience and is
  expanded into six planes at the renderer boundary.
- Honoured by the mesh, transparent, instanced, shadow and point-cloud
  shaders, the GPU pick pass, the CPU raycaster, the 2D section generator and
  PDF view export.
- **No caps** on clipped surfaces in the first version.

### BCF

- **Import**: every `ClippingPlane` becomes a clipping plane, exactly, in file
  order, up to eight with a warning beyond that. Never routed into the Section
  tool. A viewpoint without clipping planes clears the list.
- **Export**: the `ClippingPlanes` list is the Section tool's cut, if it is on
  screen, written with its exact normal, followed by every enabled clipping
  plane. Disabled planes are not written.
- `Direction` is the removed side, `Location` a point on the plane, metres,
  Z-up. The existing Y-up to Z-up conversion and the world offset for
  georeferenced models apply unchanged.
- Consequence accepted: a BCF exported with a Section tool cut comes back as
  a clipping plane, not as a Section tool cut.

### SDK

- BCF namespace: `extractViewpointState` additionally returns `clippingPlanes`
  as an exact list; `createViewpoint` accepts an optional `clippingPlanes`
  list. Existing fields unchanged.
- Viewer namespace: get, set and clear clipping planes with the same rules as
  the UI.

## Stretch goals

- Hatched caps per clipping plane with correct joins at box edges.
- Undo for plane removal and moves.
- Box from selection or from model bounds.
- GPU-drawn, depth-tested plane quads instead of the SVG overlay.

## Proof of concept scope

Implemented:

- Renderer plane array in every clip consumer listed above except PDF export.
- Store slice with add, move, remove, clear and enable, plus the merge, gap
  and non-empty rules as pure functions with tests.
- Context menu entry, SVG quads and gizmos, ribbon dropdown.
- BCF library conversion both ways, viewer import and export wiring.
- 2D section generation clipped to the kept region.

Not yet done:

- SDK namespace additions.
- PDF view export.
- Legacy `MainToolbar` entry (the ribbon is the primary toolbar).
- Module-size budgets: `Viewport.tsx`, `EntityContextMenu.tsx`,
  `useAnimationLoop.ts`, `store/index.ts` and `useDrawingGeneration.ts` each
  grew by 3 to 12 lines over their allowlisted budget. Trim or split before
  this becomes a PR; the `check-module-size` gate will refuse the raise.
- A viewer screenshot on a real model (the ground truth AGENTS.md asks for)
  has not been taken yet.

## Where things live

| Concern | Location |
| --- | --- |
| Plane rules (merge, gap, non-empty), pure | `apps/viewer/src/lib/clip-planes/clip-plane-math.ts` |
| Store slice + teardown | `apps/viewer/src/store/slices/clipPlanesSlice.ts` |
| Renderer-shaped active list | `apps/viewer/src/store/clip-planes-active.ts` |
| Per-frame ref into the render loop | `apps/viewer/src/components/viewer/useClipPlanesRef.ts` |
| Context-menu action (raycast + add) | `apps/viewer/src/lib/clip-planes/add-from-screen.ts` |
| On-canvas quads and drag gizmos | `apps/viewer/src/components/viewer/tools/ClipPlanesOverlay.tsx` |
| Quad outline (bounds and neighbour clipping, margin), pure | `apps/viewer/src/lib/clip-planes/clip-plane-outline.ts` |
| Ribbon dropdown | `apps/viewer/src/components/viewer/ribbon/ClipPlanesRibbonButton.tsx` |
| 2D section mesh clip | `apps/viewer/src/lib/clip-planes/clip-meshes.ts` |
| BCF export/import shaping | `apps/viewer/src/hooks/bcf/clip-planes-viewpoint.ts` |
| BCF conversion | `packages/bcf/src/viewpoint-clipping.ts` |
| Renderer packing + box expansion | `packages/renderer/src/clip-planes.ts` |

## Uniform layouts

The count lives in the flag word so the shaders loop exactly `count` times;
bit 2 stays set whenever the count is non-zero for callers that only ask
"is anything clipping".

| Block | Section plane | Flags | Clip planes | Total |
| --- | --- | --- | --- | --- |
| Main / instanced (`Uniforms`) | floats 40..43 | 44..47 (`flags.y`) | 48..79, quantParams 80..83 | 84 floats, 336 bytes |
| Picker | 16..19 | 20..23 (`clipFlags.x`) | 24..55 | 56 floats, 224 bytes |
| Shadow (`Clip`) | 0..3 | 4..7 (`flags.x`) | 8..39 | 40 floats, 160 bytes |
| Point cloud | 44..47 | 48..51 (`flags.w` = count) | 68..99 | 100 floats, 400 bytes |

## Coordinates

Planes live in the viewer's Y-up render frame, the same frame the section
plane and camera use. BCF conversion goes through `viewerToBcfCoords` for the
axis swap and `translateViewpoint` / `viewpointFromWorld` for the large
coordinate offset, exactly as the camera does.
