// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

//! Tests for `properties.rs`.
//!
//! `IfcRelDefinesByProperties.RelatingPropertyDefinition` is typed
//! `IfcPropertySetDefinitionSelect`, whose `IfcPropertySetDefinitionSet`
//! alternative is a defined `SET [1:?] OF IfcPropertySetDefinition` —
//! schema-legally written inline in STEP as `(#20,#22)` rather than a single
//! `#id`. `collect_rel_defines_by_properties_link` used to read that slot
//! with `get_ref`, which recognises only a bare reference and returns `None`
//! for the grouped form, so the `?` silently dropped the WHOLE relationship —
//! every related space/zone lost every property/quantity set in the group.
//! This is the same root cause as issue #4772 / PR #4773
//! (`apps/server/src/services/data_model/relationships.rs::extract_relationship`),
//! an independent second site in `rust/processing`.

use super::*;
use ifc_lite_core::{build_entity_index, EntityDecoder};

/// Mirrors the repro shape from the issue: a single `IfcRelDefinesByProperties`
/// whose `RelatingPropertyDefinition` groups two property-set definitions.
fn grouped_rel_defines_content() -> &'static [u8] {
    b"ISO-10303-21;\nHEADER;\nENDSEC;\nDATA;\n\
      #20=IFCPROPERTYSET('gid1',$,'Pset_A',$,(#30));\n\
      #22=IFCELEMENTQUANTITY('gid2',$,'Qto_B',$,$,(#31));\n\
      #40=IFCRELDEFINESBYPROPERTIES('gid3',$,$,$,(#50),(#20,#22));\n\
      ENDSEC;\nEND-ISO-10303-21;\n"
}

#[test]
fn collects_both_property_sets_from_a_grouped_relating_property_definition() {
    let content = grouped_rel_defines_content();
    let index = build_entity_index(content);
    let mut decoder = EntityDecoder::with_index(content, index);

    let rel_defines = decoder
        .decode_by_id(40)
        .expect("IFCRELDEFINESBYPROPERTIES #40 should decode");

    let link = collect_rel_defines_by_properties_link(&rel_defines)
        .expect("a grouped RelatingPropertyDefinition must not be silently dropped");

    assert_eq!(
        link.property_set_ids,
        vec![20, 22],
        "both entries of the grouped IfcPropertySetDefinitionSet must be collected, \
         not just the first (or none, if get_ref alone returned None for the list)"
    );
    assert_eq!(link.related_object_ids, vec![50]);
}

/// The ordinary, non-grouped shape must still work unchanged.
#[test]
fn collects_a_single_bare_relating_property_definition() {
    let content = b"ISO-10303-21;\nHEADER;\nENDSEC;\nDATA;\n\
        #20=IFCPROPERTYSET('gid1',$,'Pset_A',$,(#30));\n\
        #40=IFCRELDEFINESBYPROPERTIES('gid3',$,$,$,(#50),#20);\n\
        ENDSEC;\nEND-ISO-10303-21;\n";
    let index = build_entity_index(content);
    let mut decoder = EntityDecoder::with_index(content, index);

    let rel_defines = decoder
        .decode_by_id(40)
        .expect("IFCRELDEFINESBYPROPERTIES #40 should decode");

    let link = collect_rel_defines_by_properties_link(&rel_defines)
        .expect("a bare RelatingPropertyDefinition must still resolve");

    assert_eq!(link.property_set_ids, vec![20]);
    assert_eq!(link.related_object_ids, vec![50]);
}
