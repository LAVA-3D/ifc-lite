---
"@ifc-lite/server-client": minor
---

`mesh_coordinate_space` is typed as the server's three-tier union (`'site_local' | 'model_rtc' | 'raw_ifc'`) on all five response and metadata-header interfaces, instead of `string`, and the client drops a value outside those three rather than passing it off as a tier. The union and a narrowing helper are exported as `MeshCoordinateSpace`, `asMeshCoordinateSpace` and `withNarrowedCoordinateSpace`.

**Migration:** a consumer that stored the field in a `string` variable now needs `MeshCoordinateSpace | undefined`, or `asMeshCoordinateSpace(value)` to go the other way. A server that sends a fourth value now reads as absent (with a console warning) where it used to read as that value; absence was already the documented state for a server that does not declare the tag.
