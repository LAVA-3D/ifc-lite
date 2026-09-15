/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import type { Decimal } from 'decimal.js';
import type { CostDiagnostic, CostQuantityDimension } from './cost-types.js';

export interface EvaluatedCost {
  amount?: Decimal;
  currency?: string;
  dimension?: CostQuantityDimension | 'ratio';
  rateDimension?: CostQuantityDimension;
  quantityApplied?: Decimal;
  invalid?: boolean;
}

export type CostDiagnosticSink = (
  Code: CostDiagnostic['Code'], Message: string, expressId: number,
  Severity?: CostDiagnostic['Severity'],
) => void;

export type ImplicitRateNormalizer = (
  operand: EvaluatedCost, dimension: CostQuantityDimension,
) => EvaluatedCost;

function sameIdentity(left: EvaluatedCost, right: EvaluatedCost): boolean {
  return left.currency === right.currency && left.dimension === right.dimension &&
    left.rateDimension === right.rateDimension;
}

function finite(result: EvaluatedCost, valueId: number, report: CostDiagnosticSink): EvaluatedCost {
  if (result.amount?.isFinite()) return result;
  report('INVALID_NUMBER', `IfcCostValue #${valueId} produced a non-finite decimal`, valueId);
  return { invalid: true };
}

function combinedRateDimension(
  operands: EvaluatedCost[], valueId: number, report: CostDiagnosticSink,
): CostQuantityDimension | undefined | false {
  const dimensions = new Set(operands.map(entry => entry.rateDimension).filter(entry => entry !== undefined));
  if (dimensions.size <= 1) return dimensions.values().next().value;
  report('INCOMPATIBLE_UNIT', 'Cannot combine cost rates with different quantity dimensions', valueId);
  return false;
}

function multipliedRateDimension(
  operands: EvaluatedCost[], valueId: number, report: CostDiagnosticSink,
): CostQuantityDimension | undefined | false {
  const dimensions = operands.flatMap(entry => entry.rateDimension === undefined ? [] : [entry.rateDimension]);
  if (dimensions.length <= 1) return dimensions[0];
  report('INCOMPATIBLE_UNIT', 'Multiplication produces an unsupported compound cost rate', valueId);
  return false;
}

function dividedRateDimension(
  operands: EvaluatedCost[], valueId: number, report: CostDiagnosticSink,
): CostQuantityDimension | undefined | false {
  let dimension = operands[0].rateDimension;
  for (const divisor of operands.slice(1)) {
    if (divisor.rateDimension === undefined) continue;
    if (dimension === divisor.rateDimension) dimension = undefined;
    else {
      report('INCOMPATIBLE_UNIT', 'Division produces an unsupported inverse or compound cost rate', valueId);
      return false;
    }
  }
  return dimension;
}

function multiplyIdentity(operands: EvaluatedCost[]): Pick<EvaluatedCost, 'currency' | 'dimension'> | undefined {
  const dimensional = operands.filter(entry => entry.currency !== undefined || entry.dimension !== 'ratio');
  if (dimensional.length === 0) return { dimension: 'ratio' };
  if (dimensional.length > 1) return undefined;
  return { currency: dimensional[0].currency, dimension: dimensional[0].dimension };
}

function divideIdentity(operands: EvaluatedCost[]): Pick<EvaluatedCost, 'currency' | 'dimension'> | undefined {
  let identity: Pick<EvaluatedCost, 'currency' | 'dimension'> = {
    currency: operands[0].currency, dimension: operands[0].dimension,
  };
  for (const divisor of operands.slice(1)) {
    const divisorIsRatio = divisor.currency === undefined && divisor.dimension === 'ratio';
    if (divisorIsRatio) continue;
    if (identity.currency === divisor.currency && identity.dimension === divisor.dimension) {
      identity = { dimension: 'ratio' };
    } else return undefined;
  }
  return identity;
}

export function combineCosts(
  operator: string, operands: EvaluatedCost[], valueId: number, report: CostDiagnosticSink,
  normalizeImplicitRate?: ImplicitRateNormalizer,
): EvaluatedCost {
  if (operands.length === 0) {
    report('MISSING_VALUE', `IfcCostValue #${valueId} has no arithmetic operands`, valueId);
    return { invalid: true };
  }
  if (operands.some(entry => entry.invalid || entry.amount === undefined)) {
    report('MISSING_VALUE', `IfcCostValue #${valueId} depends on an invalid arithmetic operand`, valueId);
    return { invalid: true };
  }
  const amounts = operands.map(entry => entry.amount as Decimal);
  if (operator === 'ADD' || operator === 'SUBTRACT') {
    const explicitRateDimensions = new Set(
      operands.map(entry => entry.rateDimension).filter(entry => entry !== undefined),
    );
    if (explicitRateDimensions.size === 1 && normalizeImplicitRate) {
      const dimension = explicitRateDimensions.values().next().value as CostQuantityDimension;
      operands = operands.map(entry => entry.rateDimension === undefined && entry.currency !== undefined
        ? normalizeImplicitRate(entry, dimension)
        : entry);
      if (operands.some(entry => entry.invalid || entry.amount === undefined)) return { invalid: true };
    }
    if (operands.slice(1).some(entry => !sameIdentity(operands[0], entry))) {
      const currencies = new Set(operands.map(entry => entry.currency).filter(Boolean));
      report(currencies.size > 1 ? 'MIXED_CURRENCY' : 'INCOMPATIBLE_UNIT',
        `Cannot ${operator.toLowerCase()} values with different units`, valueId);
      return { invalid: true };
    }
    const rateDimension = combinedRateDimension(operands, valueId, report);
    if (rateDimension === false) return { invalid: true };
    const normalizedAmounts = operands.map(entry => entry.amount as Decimal);
    let amount = normalizedAmounts[0];
    for (const next of normalizedAmounts.slice(1)) {
      const combined = operator === 'ADD' ? amount.plus(next) : amount.minus(next);
      const exactlyZero = operator === 'ADD' ? amount.eq(next.negated()) : amount.eq(next);
      if (combined.isZero() && !exactlyZero) {
        report('INVALID_NUMBER', `IfcCostValue #${valueId} underflowed during ${operator.toLowerCase()}`, valueId);
        return { invalid: true };
      }
      amount = combined;
    }
    return finite({
      amount, currency: operands[0].currency, dimension: operands[0].dimension,
      rateDimension,
      quantityApplied: operands.find(entry => entry.quantityApplied)?.quantityApplied,
    }, valueId, report);
  }
  if (operator === 'MULTIPLY') {
    const identity = multiplyIdentity(operands);
    if (!identity) {
      report('INCOMPATIBLE_UNIT', 'Multiplication of multiple dimensional or monetary operands is unsupported', valueId);
      return { invalid: true };
    }
    const rateDimension = multipliedRateDimension(operands, valueId, report);
    if (rateDimension === false) return { invalid: true };
    let amount = amounts[0];
    for (const next of amounts.slice(1)) {
      const multiplied = amount.mul(next);
      if (multiplied.isZero() && !amount.isZero() && !next.isZero()) {
        report('INVALID_NUMBER', `IfcCostValue #${valueId} underflowed during multiplication`, valueId);
        return { invalid: true };
      }
      amount = multiplied;
    }
    return finite({
      amount, ...identity, rateDimension,
      quantityApplied: operands.find(entry => entry.quantityApplied)?.quantityApplied,
    }, valueId, report);
  }
  if (operator === 'DIVIDE') {
    for (const divisor of amounts.slice(1)) {
      if (divisor.isZero()) {
        report('DIVISION_BY_ZERO', `IfcCostValue #${valueId} divides by zero`, valueId);
        return { invalid: true };
      }
    }
    const identity = divideIdentity(operands);
    if (!identity) {
      report('INCOMPATIBLE_UNIT', 'Division produces an unsupported inverse or compound unit', valueId);
      return { invalid: true };
    }
    const rateDimension = dividedRateDimension(operands, valueId, report);
    if (rateDimension === false) return { invalid: true };
    let amount = amounts[0];
    for (const next of amounts.slice(1)) {
      const divided = amount.div(next);
      if (divided.isZero() && !amount.isZero()) {
        report('INVALID_NUMBER', `IfcCostValue #${valueId} underflowed during division`, valueId);
        return { invalid: true };
      }
      amount = divided;
    }
    return finite({
      amount, ...identity, rateDimension,
      quantityApplied: operands.find(entry => entry.quantityApplied)?.quantityApplied,
    }, valueId, report);
  }
  report('UNSUPPORTED_APPLIED_VALUE', `Arithmetic operator ${operator || '(missing)'} is not supported`, valueId);
  return { invalid: true };
}
