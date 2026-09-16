/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import type { EvaluatedCost } from './cost-evaluation-arithmetic.js';
import {
  consumeValueEvaluationWork, type ValueEvaluationSession,
} from './cost-value-evaluation-session.js';

export function appendCategoryValues(
  target: Map<string, EvaluatedCost[]>, category: string, values: readonly EvaluatedCost[],
  session: ValueEvaluationSession, onExhausted: () => void,
): boolean {
  const bucket = target.get(category) ?? [];
  if (!target.has(category)) target.set(category, bucket);
  for (const value of values) {
    const wasExhausted = session.exhausted;
    if (!consumeValueEvaluationWork(session)) {
      if (!wasExhausted) onExhausted();
      return false;
    }
    bucket.push(value);
  }
  return true;
}
