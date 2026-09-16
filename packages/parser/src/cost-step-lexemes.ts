/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

const STEP_NUMBER = /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:E[+-]?\d+)?$/i;
const TYPED_VALUE = /^[A-Z][A-Z0-9_]*\s*\(([\s\S]*)\)$/i;
const STEP_REFERENCE = /^#([1-9]\d*)$/;
const STEP_ZERO = /^[+-]?(?:0+(?:\.0*)?|\.0+)(?:E[+-]?\d+)?$/i;

function withoutComments(token: string): string {
  return token.replace(/\/\*[\s\S]*?\*\//g, ' ').trim();
}

/** Distinguish an omitted STEP attribute from malformed-but-present input. */
export function costAttributePresent(token: string | undefined): boolean {
  if (token === undefined) return false;
  const candidate = withoutComments(token);
  return candidate !== '$' && candidate !== '*';
}

/** Split one entity parameter list while retaining the original STEP lexemes. */
export function splitCostAttributeLexemes(record: string): string[] {
  let open = -1;
  let close = -1;
  let depth = 0;
  let quoted = false;
  for (let index = 0; index < record.length; index++) {
    const char = record[index];
    if (char === "'") {
      if (quoted && record[index + 1] === "'") index++;
      else quoted = !quoted;
      continue;
    }
    if (quoted) continue;
    if (char === '/' && record[index + 1] === '*') {
      const end = record.indexOf('*/', index + 2);
      if (end < 0) return [];
      index = end + 1;
      continue;
    }
    if (char === '(') {
      if (open < 0) open = index;
      depth++;
    } else if (char === ')' && open >= 0) {
      depth--;
      if (depth === 0) {
        close = index;
        break;
      }
    }
  }
  if (open < 0 || close <= open) return [];
  const params = record.slice(open + 1, close);
  const result: string[] = [];
  let start = 0;
  depth = 0;
  quoted = false;
  for (let index = 0; index < params.length; index++) {
    const char = params[index];
    if (char === "'") {
      if (quoted && params[index + 1] === "'") index++;
      else quoted = !quoted;
      continue;
    }
    if (quoted) continue;
    if (char === '/' && params[index + 1] === '*') {
      const end = params.indexOf('*/', index + 2);
      if (end < 0) break;
      index = end + 1;
    } else if (char === '(') depth++;
    else if (char === ')') depth--;
    else if (char === ',' && depth === 0) {
      result.push(params.slice(start, index).trim());
      start = index + 1;
    }
  }
  result.push(params.slice(start).trim());
  return result;
}

/** Return the exact numeric token, unwrapping an IFC typed value when present. */
export function costNumericLexeme(token: string | undefined): string | undefined {
  if (!token) return undefined;
  let candidate = withoutComments(token);
  const typed = TYPED_VALUE.exec(candidate);
  if (typed) candidate = typed[1].trim();
  return STEP_NUMBER.test(candidate) ? candidate : undefined;
}

/** Return the EXPRESS wrapper around an exact numeric token, if one was supplied. */
export function costNumericTypeLexeme(token: string | undefined): string | undefined {
  if (!token) return undefined;
  const typed = TYPED_VALUE.exec(withoutComments(token));
  return typed ? withoutComments(token).slice(0, withoutComments(token).indexOf('(')).trim().toUpperCase() : undefined;
}

/** True only when the STEP significand is zero; exponent digits do not count. */
export function isZeroCostNumericLexeme(token: string): boolean {
  return STEP_ZERO.test(token);
}

/** Read one exact STEP entity-reference token, rejecting integer literals. */
export function costReferenceLexeme(token: string | undefined): number | undefined {
  if (!token) return undefined;
  const match = STEP_REFERENCE.exec(withoutComments(token));
  return match ? Number(match[1]) : undefined;
}

/** Read a flat non-empty aggregate of exact STEP entity-reference tokens. */
export function costReferenceListLexeme(token: string | undefined): number[] | undefined {
  if (!token) return undefined;
  const candidate = withoutComments(token);
  if (!candidate.startsWith('(') || !candidate.endsWith(')')) return undefined;
  const entries = candidate.slice(1, -1).split(',').map(entry => entry.trim());
  if (entries.length === 0 || entries.some(entry => entry.length === 0)) return undefined;
  const refs = entries.map(entry => costReferenceLexeme(entry));
  return refs.every((ref): ref is number => ref !== undefined) ? refs : undefined;
}
