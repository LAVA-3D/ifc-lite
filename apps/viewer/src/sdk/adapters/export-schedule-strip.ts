/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * `stripScheduleEntities` and the STEP statement tokenizer it walks with —
 * the "remove every 4D record from this STEP text" half of
 * `export-adapter.ts`'s schedule rewrite path, split into its own module so
 * that file stays under its recorded module-size budget (see
 * `scripts/module-size-allowlist.txt`). Pure string in / string out: it
 * never touches the store, the viewer, or the DOM.
 */

/**
 * Remove every schedule-related entity declaration from the STEP body.
 *
 * Two-pass:
 *   1. Identify every express ID whose entity type is in the "always a
 *      schedule entity" set (`IfcTask`, `IfcWorkSchedule`, `IfcWorkPlan`,
 *      `IfcTaskTime`, `IfcLagTime`, `IfcWorkCalendar` + its own entities).
 *   2. Drop lines whose ID is in that set OR whose entity type is one of
 *      the sometimes-schedule types (`IfcRelSequence`, `IfcRelAssignsTo-
 *      Process`, `IfcRelAssignsToControl`) OR `IfcRelNests` lines that
 *      reference any ID from step 1.
 *
 * The IfcRelNests check prevents us from stripping cost-item/resource
 * nests, which share the entity but aren't schedule-owned.
 */
const ALWAYS_SCHEDULE_TYPES: ReadonlySet<string> = new Set([
  'IFCTASK',
  'IFCWORKSCHEDULE',
  'IFCWORKPLAN',
  'IFCTASKTIME',
  'IFCTASKTIMERECURRING',
  'IFCLAGTIME',
  // #4830. Each of the three below is reachable ONLY from the 4D pipeline —
  // IfcWorkTime from a calendar's WorkingTimes/ExceptionTimes,
  // IfcRecurrencePattern from an IfcWorkTime or IfcTaskTimeRecurring,
  // IfcTimePeriod from a pattern's TimePeriods — so all are schedule-owned.
  // Leaving them while the serializer re-emits the calendar would duplicate
  // the whole calendar on every edited export.
  'IFCWORKCALENDAR',
  'IFCWORKTIME',
  'IFCRECURRENCEPATTERN',
  'IFCTIMEPERIOD',
]);

const SOMETIMES_SCHEDULE_TYPES: ReadonlySet<string> = new Set([
  'IFCRELSEQUENCE',
  'IFCRELASSIGNSTOPROCESS',
  'IFCRELASSIGNSTOCONTROL',
]);

export function stripScheduleEntities(stepContent: string): string {
  // Pass 1: collect schedule-entity IDs by tokenizing declarations.
  //
  // We walk the STEP content at the STATEMENT level (terminated by `;`
  // outside string literals), not line-by-line. Line-based splitting
  // breaks when a writer spans an entity across multiple lines —
  // valid STEP allows whitespace and newlines anywhere outside string
  // literals. Statement-based walking handles multi-line entities
  // transparently.
  const statements = tokenizeStepStatements(stepContent);
  const scheduleIds = new Set<number>();
  for (const stmt of statements) {
    if (stmt.kind !== 'entity') continue;
    if (ALWAYS_SCHEDULE_TYPES.has(stmt.typeUpper)) scheduleIds.add(stmt.id);
  }

  if (scheduleIds.size === 0) {
    // No "always" schedule entities. There can't be any schedule-related
    // relationship entities either; nothing to strip.
    return stepContent;
  }

  // Pass 2: walk statements and emit non-schedule text ranges. We keep
  // byte ranges (start/end offsets in `stepContent`) rather than
  // reassembling, so leading/trailing whitespace between statements
  // survives byte-identical when every statement is kept.
  const keptRanges: Array<{ start: number; end: number }> = [];
  let cursor = 0;
  for (const stmt of statements) {
    if (stmt.kind !== 'entity') {
      // Non-entity text (header, section markers, whitespace) — always keep.
      continue;
    }
    if (shouldStripStatement(stmt, scheduleIds)) {
      // Push the range from `cursor` up to the statement start, then
      // advance past the statement (including trailing whitespace /
      // newline so we don't leave a gap).
      if (stmt.start > cursor) keptRanges.push({ start: cursor, end: stmt.start });
      cursor = stmt.end;
      // Also consume a trailing newline so we don't leave blank lines
      // scattered where schedule statements used to live.
      if (stepContent[cursor] === '\r') cursor++;
      if (stepContent[cursor] === '\n') cursor++;
    }
  }
  if (cursor < stepContent.length) {
    keptRanges.push({ start: cursor, end: stepContent.length });
  }

  // Concatenate kept ranges.
  if (keptRanges.length === 1 && keptRanges[0].start === 0 && keptRanges[0].end === stepContent.length) {
    return stepContent; // No-op path — nothing was stripped.
  }
  let out = '';
  for (const r of keptRanges) out += stepContent.slice(r.start, r.end);
  return out;
}

/** Per-statement classification: should we drop this record? */
function shouldStripStatement(
  stmt: { typeUpper: string; id: number; attributesText: string },
  scheduleIds: ReadonlySet<number>,
): boolean {
  if (scheduleIds.has(stmt.id)) return true; // Always-schedule entity itself.
  if (SOMETIMES_SCHEDULE_TYPES.has(stmt.typeUpper)) {
    // Relationship entity; strip only if it references a schedule id.
    return referencesAnyId(stmt.attributesText, scheduleIds);
  }
  if (stmt.typeUpper === 'IFCRELNESTS') {
    // Only strip when the referenced set includes a schedule id (the
    // nest ties a task to its children). False-positives (a nests that
    // mixes task + non-task in a single record) are vanishingly rare.
    return referencesAnyId(stmt.attributesText, scheduleIds);
  }
  return false;
}

interface StepEntityStatement {
  kind: 'entity';
  /** Byte offset of the `#` in `#ID=…`. */
  start: number;
  /** Byte offset just past the terminating `;`. */
  end: number;
  id: number;
  typeUpper: string;
  /** The parenthesised attribute list text including the outer parens. */
  attributesText: string;
}

/**
 * Tokenize `stepContent` into entity statements. Skips HEADER / DATA
 * section markers and whitespace; returns only `#ID=TYPE(…);` records.
 * Respects `'…'` string literals (STEP uses `''` to escape a quote).
 */
function tokenizeStepStatements(stepContent: string): StepEntityStatement[] {
  const out: StepEntityStatement[] = [];
  const len = stepContent.length;
  let i = 0;
  while (i < len) {
    // Skip whitespace.
    while (i < len && (stepContent[i] === ' ' || stepContent[i] === '\t' || stepContent[i] === '\n' || stepContent[i] === '\r')) i++;
    if (i >= len) break;
    // Only interested in `#N=…;` records. Anything else — header keywords,
    // section markers, end markers — gets scanned to the next `;` and
    // discarded as non-entity text.
    if (stepContent[i] !== '#') {
      // Scan to next `;` (STEP statements are `;`-terminated).
      i = scanToStatementEnd(stepContent, i);
      continue;
    }
    const declStart = i;
    i++; // past '#'
    // Read id digits.
    const idStart = i;
    while (i < len && stepContent.charCodeAt(i) >= 0x30 && stepContent.charCodeAt(i) <= 0x39) i++;
    if (i === idStart) {
      // `#` not followed by a digit — not an entity reference. Skip to `;`.
      i = scanToStatementEnd(stepContent, declStart + 1);
      continue;
    }
    const id = parseInt(stepContent.slice(idStart, i), 10);
    // Allow whitespace before `=`.
    while (i < len && (stepContent[i] === ' ' || stepContent[i] === '\t')) i++;
    if (stepContent[i] !== '=') {
      // `#N` without `=` — reference inside an attribute list; bail.
      i = scanToStatementEnd(stepContent, declStart + 1);
      continue;
    }
    i++; // past '='
    while (i < len && (stepContent[i] === ' ' || stepContent[i] === '\t')) i++;
    // Type name: uppercase letters, digits, underscore.
    const typeStart = i;
    while (i < len) {
      const c = stepContent[i];
      if ((c >= 'A' && c <= 'Z') || (c >= '0' && c <= '9') || c === '_' || (c >= 'a' && c <= 'z')) i++;
      else break;
    }
    if (i === typeStart) {
      i = scanToStatementEnd(stepContent, declStart + 1);
      continue;
    }
    const typeUpper = stepContent.slice(typeStart, i).toUpperCase();
    // Optional whitespace before attribute list.
    while (i < len && (stepContent[i] === ' ' || stepContent[i] === '\t' || stepContent[i] === '\n' || stepContent[i] === '\r')) i++;
    // Attribute list starts with `(`. Read until matching `)`, respecting
    // string literals and nested parens.
    const attrStart = i;
    if (stepContent[i] !== '(') {
      i = scanToStatementEnd(stepContent, declStart + 1);
      continue;
    }
    i++; // past '('
    let depth = 1;
    let inString = false;
    while (i < len && depth > 0) {
      const c = stepContent[i];
      if (inString) {
        if (c === "'") {
          // Peek for escape `''`.
          if (stepContent[i + 1] === "'") { i += 2; continue; }
          inString = false;
          i++;
          continue;
        }
        i++;
        continue;
      }
      if (c === "'") { inString = true; i++; continue; }
      if (c === '(') { depth++; i++; continue; }
      if (c === ')') { depth--; i++; continue; }
      i++;
    }
    const attrEnd = i;
    // Expect `;` terminator (optionally preceded by whitespace).
    while (i < len && (stepContent[i] === ' ' || stepContent[i] === '\t')) i++;
    if (stepContent[i] !== ';') {
      // Malformed — scan to next `;` and skip this record.
      i = scanToStatementEnd(stepContent, attrEnd);
      continue;
    }
    i++; // past ';'
    const end = i;
    out.push({
      kind: 'entity',
      start: declStart,
      end,
      id,
      typeUpper,
      attributesText: stepContent.slice(attrStart, attrEnd),
    });
  }
  return out;
}

/** Advance past the next `;` outside string literals. Never walks backwards. */
function scanToStatementEnd(s: string, from: number): number {
  const len = s.length;
  let i = from;
  let inString = false;
  while (i < len) {
    const c = s[i];
    if (inString) {
      if (c === "'") {
        if (s[i + 1] === "'") { i += 2; continue; }
        inString = false;
      }
      i++;
      continue;
    }
    if (c === "'") { inString = true; i++; continue; }
    if (c === ';') return i + 1;
    i++;
  }
  return len;
}

/** True iff any `#N` token in `rest` has N in the given set. */
function referencesAnyId(rest: string, ids: ReadonlySet<number>): boolean {
  const refRegex = /#(\d+)/g;
  let m: RegExpExecArray | null;
  while ((m = refRegex.exec(rest)) !== null) {
    const n = parseInt(m[1], 10);
    if (ids.has(n)) return true;
  }
  return false;
}
