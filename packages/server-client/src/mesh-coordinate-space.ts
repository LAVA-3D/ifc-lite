// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

/**
 * The coordinate-space tag, on the TypeScript side of the wire (#4611).
 *
 * The server's `MeshCoordinateSpace` (`rust/processing/src/mesh_frame.rs`) is a
 * three-variant enum whose `serde` attribute spells the wire form, and the ffi,
 * export and Python consumers all read it as that enum. Every TypeScript field
 * that carried it was typed `string`, so the three tiers lived in a doc comment
 * and nothing — not the compiler, not a runtime check — kept a fourth value out.
 * A consumer writing `if (space === 'site_local')` got no help from the type,
 * and a server sending the Rust variant name (`SiteLocal`, which the Rust
 * deserializer itself rejects: see `mesh_frame.rs`'s `from_str` test) reached
 * that consumer looking exactly like a tag it should honour.
 */

/** The three tiers, in the order `MeshCoordinateSpace` declares them. */
export const MESH_COORDINATE_SPACES = ['site_local', 'model_rtc', 'raw_ifc'] as const;

/**
 * Which frame serialized mesh vertices are expressed in.
 *
 * - `site_local`: the `IfcSite` placement's translation was subtracted and its
 *   rotation removed.
 * - `model_rtc`: a detected model-level anchor was subtracted; no rotation.
 * - `raw_ifc`: nothing was subtracted.
 *
 * A response field of this type is optional, and absent means "this server did
 * not say" — either it predates the tag, or it sent something outside the three
 * (see {@link asMeshCoordinateSpace}). Absence is the case every consumer has
 * had to handle since the field was introduced, which is why an unrecognised
 * value resolves to it rather than to a guess.
 */
export type MeshCoordinateSpace = (typeof MESH_COORDINATE_SPACES)[number];

/** The tag when `value` is one of the three tiers, `undefined` otherwise. */
export function asMeshCoordinateSpace(value: unknown): MeshCoordinateSpace | undefined {
  return MESH_COORDINATE_SPACES.find((space) => space === value);
}

/**
 * Earn the narrowed type on a freshly parsed wire object: drop a
 * `mesh_coordinate_space` that is not one of the three tiers, say so, and hand
 * the object back so a caller can wrap its `JSON.parse` in place.
 *
 * Called on the object this client just built from `JSON.parse`, so mutating
 * in place is cheaper than copying a response that carries every mesh, and the
 * object is not shared with anyone yet. Deleting rather than assigning
 * `undefined` keeps "the server sent nothing" and "the server sent something
 * unusable" indistinguishable to a consumer, which is what the type says.
 */
export function withNarrowedCoordinateSpace<T extends { mesh_coordinate_space?: unknown }>(
  wire: T
): T {
  const raw = wire.mesh_coordinate_space;
  if (raw === undefined || asMeshCoordinateSpace(raw) !== undefined) return wire;
  console.warn(
    `[client] Ignoring unrecognised mesh_coordinate_space ${JSON.stringify(raw)}; expected one of ${MESH_COORDINATE_SPACES.join(', ')}`
  );
  delete wire.mesh_coordinate_space;
  return wire;
}
