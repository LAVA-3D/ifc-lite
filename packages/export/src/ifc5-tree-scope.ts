/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/** Effective IFC5 tree membership and parent selection (#4841). */

import { RelationshipType, createLogger } from '@ifc-lite/data';
import { EntityExtractor, type IfcDataStore } from '@ifc-lite/parser';
import type { MutablePropertyView, NewEntity } from '@ifc-lite/mutations';
import { authoredEntityRefs, type EffectiveEntityIndex } from './effective-index.js';

const RELATING_OBJECT_INDEX = 4;
const RELATED_OBJECTS_INDEX = 5;
const CYCLE_CHECK_VISIT_BUDGET = 2_000_000;
const log = createLogger('Ifc5TreeScope');

interface SpatialTreeNode {
  expressId: number;
  name?: string;
  children: SpatialTreeNode[];
}

interface DecompositionGraph {
  childrenByParent: Map<number, number[]>;
  parentsByChild: Map<number, number[]>;
}

/** All tree answers used by one IFC5 export. */
export interface Ifc5TreeScope {
  treeIds: Set<number>;
  parentOf: Map<number, number>;
  spatialNodeNames: Map<number, string>;
}

function parsedSingleRef(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isInteger(value) && value > 0 ? value : undefined;
}

function parsedRefs(value: unknown): number[] {
  if (Array.isArray(value)) return value.flatMap(parsedRefs);
  const id = parsedSingleRef(value);
  return id === undefined ? [] : [id];
}

function effectiveRelationshipAttributes(
  id: number,
  sourceAttributes: unknown[] | undefined,
  created: NewEntity | undefined,
  view: MutablePropertyView | null,
): unknown[] | undefined {
  const attributes = created ? [...created.attributes] : sourceAttributes?.slice();
  if (!attributes || !view) return attributes;
  const positional = view.getPositionalMutationsForEntity(id);
  if (positional) {
    for (const [index, value] of positional) attributes[index] = value;
  }
  // Named mutations are more specific and win over positional ones, matching
  // the effective-index and STEP-export paths.
  for (const { name, value } of view.getAttributeMutationsForEntity(id)) {
    if (name === 'RelatingObject') attributes[RELATING_OBJECT_INDEX] = value;
    if (name === 'RelatedObjects') attributes[RELATED_OBJECTS_INDEX] = value;
  }
  return attributes;
}

function authoredKnownRefs(value: unknown): number[] {
  if (Array.isArray(value)) return value.flatMap(authoredKnownRefs);
  const numeric = parsedSingleRef(value);
  if (numeric !== undefined) return [numeric];
  return authoredEntityRefs(value as Parameters<typeof authoredEntityRefs>[0]);
}

function authoredOrParsedSingleRef(value: unknown, authored: boolean): number | undefined {
  return authored ? authoredKnownRefs(value)[0] : parsedSingleRef(value);
}

function authoredOrParsedRefs(value: unknown, authored: boolean): number[] {
  return authored ? authoredKnownRefs(value) : parsedRefs(value);
}

function addEdge(graph: DecompositionGraph, parentId: number, childId: number): void {
  if (parentId === childId) return;
  const children = graph.childrenByParent.get(parentId) ?? [];
  // Do not scan a potentially huge sibling list to deduplicate. Duplicate
  // malformed edges are harmless to the visited-set closure; keeping this
  // append O(1) avoids quadratic graph construction for large assemblies.
  children.push(childId);
  graph.childrenByParent.set(parentId, children);
  const parents = graph.parentsByChild.get(childId) ?? [];
  if (!parents.includes(parentId)) {
    parents.push(parentId);
    graph.parentsByChild.set(childId, parents);
  }
}

function buildEffectiveDecompositionGraph(
  dataStore: IfcDataStore,
  effective: EffectiveEntityIndex,
  view: MutablePropertyView | null,
): DecompositionGraph {
  const graph: DecompositionGraph = { childrenByParent: new Map(), parentsByChild: new Map() };
  const extractor = dataStore.source ? new EntityExtractor(dataStore.source) : null;
  const created = new Map<number, NewEntity>();
  for (const entity of view?.getNewEntities() ?? []) created.set(entity.expressId, entity);

  if (!extractor) {
    const relationships = dataStore.relationships;
    if (!relationships) return graph;
    for (const parentId of relationships.forward.offsets.keys()) {
      for (const childId of relationships.getRelated(parentId, RelationshipType.Aggregates, 'forward')) {
        addEdge(graph, parentId, childId);
      }
    }
    return graph;
  }

  // Effective-index iteration preserves source declaration order and appends
  // overlay-created records, so candidate parents retain first-declared order.
  for (const [id, record] of effective) {
    const type = effective.effectiveType(id, record.type);
    if (type !== 'IFCRELAGGREGATES' && type !== 'IFCRELNESTS') continue;
    const newEntity = created.get(id);
    const sourceRef = newEntity ? undefined : dataStore.entityIndex.byId.get(id);
    const sourceEntity = sourceRef ? extractor.extractEntity(sourceRef) : null;
    const attributes = effectiveRelationshipAttributes(id, sourceEntity?.attributes, newEntity, view);
    if (!attributes) continue;

    const named = view?.getAttributeMutationsForEntity(id) ?? [];
    const parentAuthored = newEntity !== undefined
      || view?.getPositionalMutationsForEntity(id)?.has(RELATING_OBJECT_INDEX) === true
      || named.some(({ name }) => name === 'RelatingObject');
    const parentId = authoredOrParsedSingleRef(attributes[RELATING_OBJECT_INDEX], parentAuthored);
    if (parentId === undefined || !effective.has(parentId)) continue;

    const childrenAuthored = newEntity !== undefined
      || view?.getPositionalMutationsForEntity(id)?.has(RELATED_OBJECTS_INDEX) === true
      || named.some(({ name }) => name === 'RelatedObjects');
    for (const childId of authoredOrParsedRefs(attributes[RELATED_OBJECTS_INDEX], childrenAuthored)) {
      if (effective.has(childId)) addEdge(graph, parentId, childId);
    }
  }
  return graph;
}

function addSpatialHierarchy(
  dataStore: IfcDataStore,
  treeIds: Set<number>,
  parentOf: Map<number, number>,
  spatialNodeNames: Map<number, string>,
): void {
  const { spatialHierarchy } = dataStore;
  if (spatialHierarchy?.project) {
    const stack: SpatialTreeNode[] = [spatialHierarchy.project];
    while (stack.length > 0) {
      const node = stack.pop() as SpatialTreeNode;
      treeIds.add(node.expressId);
      if (node.name) spatialNodeNames.set(node.expressId, node.name);
      for (const child of node.children) {
        parentOf.set(child.expressId, node.expressId);
        stack.push(child);
      }
    }
  }
  if (!spatialHierarchy) return;
  for (const map of [spatialHierarchy.bySite, spatialHierarchy.byBuilding, spatialHierarchy.byStorey, spatialHierarchy.bySpace]) {
    if (!map) continue;
    for (const [parentId, children] of map) {
      for (const childId of children ?? []) {
        treeIds.add(childId);
        parentOf.set(childId, parentId);
      }
    }
  }
}

function aggregatedDescendants(
  childId: number,
  graph: DecompositionGraph,
  budget: { visits: number },
): Set<number> | null {
  const visited = new Set<number>([childId]);
  const pending = [childId];
  while (pending.length > 0) {
    const current = pending.pop() as number;
    for (const descendant of graph.childrenByParent.get(current) ?? []) {
      if (--budget.visits < 0) return null;
      if (visited.has(descendant)) continue;
      visited.add(descendant);
      pending.push(descendant);
    }
  }
  return visited;
}

function addDecompositionParents(graph: DecompositionGraph, parentOf: Map<number, number>): void {
  const budget = { visits: CYCLE_CHECK_VISIT_BUDGET };
  let exhausted = false;
  for (const [childId, candidates] of graph.parentsByChild) {
    if (parentOf.has(childId) || candidates.length === 0) continue;
    let winner = candidates[0];
    if (candidates.length > 1 && !exhausted) {
      const descendants = aggregatedDescendants(childId, graph, budget);
      if (descendants === null) {
        exhausted = true;
        log.warn(
          `Aggregation back-edge cycle checks stopped after ${CYCLE_CHECK_VISIT_BUDGET} graph visits; `
          + 'remaining multi-parent children use their first-declared decomposition edge',
        );
      } else {
        winner = candidates.find((candidate) => !descendants.has(candidate)) ?? winner;
      }
    }
    parentOf.set(childId, winner);
  }
}

/** Build membership and hierarchy from the same effective decomposition graph. */
export function buildIfc5TreeScope(
  dataStore: IfcDataStore,
  effective: EffectiveEntityIndex,
  view: MutablePropertyView | null,
): Ifc5TreeScope {
  const treeIds = new Set<number>();
  const parentOf = new Map<number, number>();
  const spatialNodeNames = new Map<number, string>();
  addSpatialHierarchy(dataStore, treeIds, parentOf, spatialNodeNames);

  const graph = buildEffectiveDecompositionGraph(dataStore, effective, view);
  const pending = [...treeIds];
  while (pending.length > 0) {
    const id = pending.pop() as number;
    for (const childId of graph.childrenByParent.get(id) ?? []) {
      if (treeIds.has(childId)) continue;
      treeIds.add(childId);
      pending.push(childId);
    }
  }
  // Existing containment remains authoritative for occurrences declared both
  // ways; decomposition only fills children that containment left unplaced.
  addDecompositionParents(graph, parentOf);
  return { treeIds, parentOf, spatialNodeNames };
}
