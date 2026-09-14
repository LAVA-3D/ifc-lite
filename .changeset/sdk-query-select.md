---
"@ifc-lite/sdk": minor
---

`QueryBuilder.select(text)`: filter by IfcOpenShell-style selector text, e.g. `bim.query().select('IfcWall, Pset_WallCommon.FireRating=2HR')`. Parses via `@ifc-lite/query`'s shared `selectorToQueryDescriptor` and appends into the same `types`/`filters` lists `.byType()`/`.where()` already append to (types OR, filters AND), so it composes with either in any order. Throws the re-exported `SelectorUnsupportedError` for a construct with no lossless target in `QueryDescriptor`, rather than running an empty or partial query.
