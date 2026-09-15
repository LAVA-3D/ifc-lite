/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * Which entities the IFC5 export treats as part of the model, and who each
 * one's parent is.
 *
 * Both answers read the same two IFC mechanisms, and that is the point:
 * spatial containment (`IfcRelContainedInSpatialStructure`, pre-digested by
 * the parser into `spatialHierarchy`) AND decomposition (`IfcRelAggregates`,
 * the `IsDecomposedBy` inverse). Containment alone silently dropped every
 * element that hangs off its parent by aggregation instead: an `IfcRoof`'s
 * `IfcSlab` parts are contained in no storey, so the tree set never reached
 * them, `isOmitted` removed them along with their geometry, and the roof
 * stayed as a node with nothing under it (#4841).
 *
 * The parser folds `IfcRelNests` into the same `RelationshipType.Aggregates`
 * bucket, so nesting is followed here too — a nested part is decomposition by
 * the same argument, and its geometry disappeared the same way.
 */

import type { IfcDataStore } from '@ifc-lite/parser';
import { RelationshipType } from '@ifc-lite/data';

/** Recursive spatial tree node type used when walking the hierarchy. */
interface SpatialTreeNode {
  expressId: number;
  name?: string;
  children: SpatialTreeNode[];
}

/** Child→parent edges of the exported hierarchy, plus the tree's own names. */
export interface Ifc5ParentMap {
  /** childId → parentId; a child absent here has no place in the hierarchy. */
  parentOf: Map<number, number>;
  /** Names carried by `spatialHierarchy` nodes rather than the entity table. */
  spatialNodeNames: Map<number, string>;
}

/** `RelatedObjects` of the decompositions whose `RelatingObject` is `id`. */
function decomposedChildren(dataStore: IfcDataStore, id: number): number[] {
  const { relationships } = dataStore;
  if (!relationships) return [];
  return relationships.getRelated(id, RelationshipType.Aggregates, 'forward');
}

/**
 * Build the set of entity IDs reachable from the spatial tree.
 * Includes Project, Site, Building, Storey, Space, all contained elements,
 * and everything those decompose into, transitively.
 */
export function buildTreeEntitySet(dataStore: IfcDataStore): Set<number> {
  const ids = new Set<number>();

  // Walk spatial hierarchy tree
  const { spatialHierarchy } = dataStore;
  if (spatialHierarchy?.project) {
    const walk = (node: { expressId: number; children: SpatialTreeNode[] }) => {
      ids.add(node.expressId);
      for (const child of node.children) walk(child);
    };
    walk(spatialHierarchy.project);
  }

  // Add elements from containment maps (elements assigned to storeys, etc.)
  if (spatialHierarchy) {
    for (const map of [spatialHierarchy.bySite, spatialHierarchy.byBuilding, spatialHierarchy.byStorey, spatialHierarchy.bySpace]) {
      if (map) {
        for (const children of map.values()) {
          for (const id of children) ids.add(id);
        }
      }
    }
  }

  // Close the set over decomposition (#4841). Iterative, with `ids` itself as
  // the visited set: a file-supplied aggregation graph may be cyclic or
  // diamond-shaped, and membership is a pure function of the id, so an id
  // already in the set never needs expanding twice. That bounds the walk at
  // O(entities + aggregation edges) with no stack to overflow and no separate
  // budget to keep in step.
  const pending = [...ids];
  while (pending.length > 0) {
    const id = pending.pop() as number;
    for (const childId of decomposedChildren(dataStore, id)) {
      if (ids.has(childId)) continue;
      ids.add(childId);
      pending.push(childId);
    }
  }

  return ids;
}

/**
 * Build the child→parent map the exported hierarchy is grouped by.
 *
 * Precedence is containment first, decomposition second: an element a file
 * both contains in a storey and aggregates into an assembly keeps the storey
 * it has always been exported under, and decomposition only speaks for a
 * child that containment leaves with no parent at all. Among several
 * aggregating parents (which EXPRESS forbids but files still emit) the
 * first-declared one wins, matching the parser's own canonical-parent choice.
 */
export function buildParentMap(dataStore: IfcDataStore): Ifc5ParentMap {
  const { spatialHierarchy, relationships } = dataStore;
  const parentOf = new Map<number, number>();
  const spatialNodeNames = new Map<number, string>();

  if (spatialHierarchy?.project) {
    const walkTree = (node: { expressId: number; name?: string; children: SpatialTreeNode[] }) => {
      if (node.name) {
        spatialNodeNames.set(node.expressId, node.name);
      }
      for (const child of node.children) {
        parentOf.set(child.expressId, node.expressId);
        walkTree(child);
      }
    };
    walkTree(spatialHierarchy.project);
  }

  // Add element containment from flat maps
  if (spatialHierarchy) {
    for (const map of [spatialHierarchy.bySite, spatialHierarchy.byBuilding, spatialHierarchy.byStorey, spatialHierarchy.bySpace]) {
      if (map) {
        for (const [parentId, children] of map) {
          if (!children) continue;
          for (const childId of children) parentOf.set(childId, parentId);
        }
      }
    }
  }

  // Decomposition fills what containment left empty (#4841). Without this an
  // aggregated child that `buildTreeEntitySet` now keeps would be emitted as
  // a node nothing lists as a child — present in `data`, unreachable from the
  // root — which is the orphaning the re-parenting walk exists to prevent.
  if (relationships) {
    for (const childId of relationships.inverse.offsets.keys()) {
      if (parentOf.has(childId)) continue;
      const [firstDeclaredParent] = relationships.getRelated(childId, RelationshipType.Aggregates, 'inverse');
      if (firstDeclaredParent !== undefined && firstDeclaredParent !== childId) {
        parentOf.set(childId, firstDeclaredParent);
      }
    }
  }

  return { parentOf, spatialNodeNames };
}
