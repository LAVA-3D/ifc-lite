/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import type { EvaluatedCost } from './cost-evaluation-arithmetic.js';

export interface ValueEvaluationSession {
  memo: Map<number, EvaluatedCost>;
  categoryMemo: Map<string, EvaluatedCost>;
  state: Map<number, 1 | 2>;
  work: number;
  exhausted: boolean;
  owner: number;
}

export function valueEvaluationSession(owner: number): ValueEvaluationSession {
  return { memo: new Map(), categoryMemo: new Map(), state: new Map(), work: 0, exhausted: false, owner };
}

export function consumeValueEvaluationWork(session: ValueEvaluationSession, amount = 1): boolean {
  if (session.exhausted) return false;
  session.work += amount;
  if (session.work <= 100_000) return true;
  session.exhausted = true;
  return false;
}
