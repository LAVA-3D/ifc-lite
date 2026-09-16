/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { Decimal } from 'decimal.js';
import { combineCosts, type EvaluatedCost } from './cost-evaluation-arithmetic.js';
import { itemQuantities, type QuantityValue } from './cost-quantity-evaluator.js';
import { isZeroCostNumericLexeme } from './cost-step-lexemes.js';
import type {
  CostDiagnostic, CostEvaluationOptions, CostEvaluationResult, CostGraphExtraction,
  CostQuantityDimension, CostQuantityInfo, CostUnitInfo, CostValueInfo,
} from './cost-types.js';

interface Context {
  DecimalValue: Decimal.Constructor;
  extraction: CostGraphExtraction;
  values: Map<number, CostValueInfo>;
  quantities: Map<number, CostQuantityInfo>;
  units: Map<number, CostUnitInfo>;
  diagnostics: CostDiagnostic[];
}
function diagnostic(context: Context, Code: CostDiagnostic['Code'], Message: string,
  expressId: number, Severity: CostDiagnostic['Severity'] = 'error'): void {
  context.diagnostics.push({ Code, Message, Severity, expressId });
}
function decimal(value: string, expressId: number, context: Context): Decimal | undefined {
  try {
    const parsed = new context.DecimalValue(value);
    if (parsed.isFinite() && !(parsed.isZero() && !isZeroCostNumericLexeme(value))) return parsed;
  } catch (error) {
    diagnostic(context, 'INVALID_NUMBER', `#${expressId} contains an invalid decimal: ${String(error)}`, expressId);
    return undefined;
  }
  diagnostic(context, 'INVALID_NUMBER', `#${expressId} contains a non-finite or underflowed decimal`, expressId);
  return undefined;
}
function projectUnit(dimension: CostQuantityDimension, context: Context): CostUnitInfo | undefined {
  const id = context.extraction.ProjectUnits[dimension];
  return id === undefined ? undefined : context.units.get(id);
}
function typedValue(value: CostValueInfo, valueId: number, context: Context): EvaluatedCost {
  const operand = value.AppliedValue;
  if (!operand) return {};
  if (operand.Kind === 'Unsupported') {
    diagnostic(context, operand.InvalidNumber ? 'INVALID_NUMBER' : 'UNSUPPORTED_APPLIED_VALUE',
      `IfcAppliedValue #${valueId} uses an unsupported select member`, valueId);
    return { invalid: true };
  }
  if (operand.Kind === 'Reference') {
    const measure = context.extraction.MeasuresWithUnit.find(entry => entry.expressId === operand.expressId);
    const unit = measure ? context.units.get(measure.UnitComponent) : undefined;
    if (!measure || !unit) {
      diagnostic(context, 'MISSING_REFERENCE', `AppliedValue reference #${operand.expressId} cannot be evaluated`, valueId);
      return { invalid: true };
    }
    const amount = decimal(measure.ValueComponent, valueId, context);
    if (!amount) return { invalid: true };
    if (unit.Currency) {
      if (measure.ValueType !== 'IFCMONETARYMEASURE') {
        diagnostic(context, 'INCOMPATIBLE_UNIT', `Measure #${operand.expressId} is not monetary`, valueId);
        return { invalid: true };
      }
      return { amount, currency: unit.Currency };
    }
    if (!unit.Dimension || unit.Scale === undefined) {
      diagnostic(context, 'UNSUPPORTED_UNIT', `Unit #${unit.expressId} cannot be evaluated`, valueId);
      return { invalid: true };
    }
    if (measure.ValueDimension !== unit.Dimension) {
      diagnostic(context, 'INCOMPATIBLE_UNIT',
        `Measure #${operand.expressId} uses ${measure.ValueDimension ?? 'unsupported'} with a ${unit.Dimension} unit`, valueId);
      return { invalid: true };
    }
    const normalized = amount.mul(unit.Scale);
    if (!normalized.isFinite() || (normalized.isZero() && !amount.isZero())) {
      diagnostic(context, 'INVALID_NUMBER', `Measure #${operand.expressId} has a non-finite normalized value`, valueId);
      return { invalid: true };
    }
    return { amount: normalized, dimension: unit.Dimension };
  }
  const amount = decimal(operand.Value, valueId, context);
  if (!amount) return { invalid: true };
  if (operand.Type === 'IFCMONETARYMEASURE') {
    if (!context.extraction.Currency) {
      diagnostic(context, 'MISSING_CURRENCY', `IfcCostValue #${valueId} has no project currency`, valueId, 'warning');
    }
    return { amount, currency: context.extraction.Currency };
  }
  const dimensions: Record<string, CostQuantityDimension | 'ratio'> = {
    IFCLENGTHMEASURE: 'length', IFCAREAMEASURE: 'area', IFCVOLUMEMEASURE: 'volume',
    IFCMASSMEASURE: 'mass', IFCTIMEMEASURE: 'time', IFCCOUNTMEASURE: 'count',
    IFCNUMERICMEASURE: 'ratio', IFCRATIOMEASURE: 'ratio', IFCNORMALISEDRATIOMEASURE: 'ratio',
    IFCREAL: 'ratio', IFCINTEGER: 'ratio',
  };
  const dimension = dimensions[operand.Type];
  if (!dimension) {
    diagnostic(context, 'UNSUPPORTED_APPLIED_VALUE', `Typed value ${operand.Type} is not supported`, valueId);
    return { invalid: true };
  }
  if (dimension === 'ratio' || dimension === 'count') return { amount, dimension };
  const unit = projectUnit(dimension, context);
  if (!unit?.Scale) {
    diagnostic(context, 'UNSUPPORTED_UNIT', `No project ${dimension} unit can be resolved`, valueId);
    return { invalid: true };
  }
  const normalized = amount.mul(unit.Scale);
  if (!normalized.isFinite() || (normalized.isZero() && !amount.isZero())) {
    diagnostic(context, 'INVALID_NUMBER', `IfcCostValue #${valueId} has a non-finite normalized value`, valueId);
    return { invalid: true };
  }
  return { amount: normalized, dimension };
}
function normalizeUnitBasis(value: CostValueInfo, valueId: number, evaluated: EvaluatedCost,
  context: Context, apply = true): EvaluatedCost {
  if (evaluated.invalid || evaluated.amount === undefined) return evaluated;
  if (value.InvalidUnitBasis) {
    diagnostic(context, 'UNSUPPORTED_UNIT', `UnitBasis on #${valueId} is not an entity reference`, valueId);
    return { invalid: true };
  }
  if (value.UnitBasis === undefined) return evaluated;
  if (evaluated.rateDimension !== undefined) {
    diagnostic(context, 'INCOMPATIBLE_UNIT', `UnitBasis on #${valueId} produces a compound cost rate`, valueId);
    return { invalid: true };
  }
  const basis = context.extraction.MeasuresWithUnit.find(entry => entry.expressId === value.UnitBasis);
  const unit = basis ? context.units.get(basis.UnitComponent) : undefined;
  const basisValue = basis ? decimal(basis.ValueComponent, valueId, context) : undefined;
  if (!basis || !basisValue || !unit?.Dimension || !unit.Scale || basis.ValueDimension !== unit.Dimension) {
    diagnostic(context, 'UNSUPPORTED_UNIT', `UnitBasis #${value.UnitBasis} cannot be resolved`, valueId);
    return { invalid: true };
  }
  const denominator = basisValue.mul(unit.Scale);
  if (!denominator.isFinite() || denominator.isZero() || denominator.isNegative()) {
    diagnostic(context, denominator.isZero() ? 'DIVISION_BY_ZERO' : 'INVALID_NUMBER',
      `UnitBasis #${value.UnitBasis} is not positive`, valueId);
    return { invalid: true };
  }
  if (!apply) return evaluated;
  const amount = evaluated.amount.div(denominator);
  if (!amount.isFinite() || (amount.isZero() && !evaluated.amount.isZero())) {
    diagnostic(context, 'INVALID_NUMBER', `IfcCostValue #${valueId} produced a non-finite rate`, valueId);
    return { invalid: true };
  }
  return { ...evaluated, amount, rateDimension: unit.Dimension };
}
function normalizeImplicitRate(
  operand: EvaluatedCost, dimension: CostQuantityDimension, valueId: number, context: Context,
): EvaluatedCost {
  if (operand.invalid || operand.amount === undefined) return operand;
  const scale = dimension === 'count' || dimension === 'number' ? '1' : projectUnit(dimension, context)?.Scale;
  if (!scale) {
    diagnostic(context, 'UNSUPPORTED_UNIT', `No project ${dimension} unit can be resolved`, valueId);
    return { invalid: true };
  }
  const amount = operand.amount.div(scale);
  if (!amount.isFinite() || (amount.isZero() && !operand.amount.isZero())) {
    diagnostic(context, 'INVALID_NUMBER', `IfcCostValue #${valueId} produced an invalid implicit rate`, valueId);
    return { invalid: true };
  }
  return { ...operand, amount, rateDimension: dimension };
}
function extendQuantity(
  valueId: number, evaluated: EvaluatedCost, quantities: QuantityValue[], context: Context,
): EvaluatedCost {
  if (evaluated.invalid || evaluated.amount === undefined || quantities.length === 0) return evaluated;
  const dimensions = new Set(quantities.map(entry => entry.dimension));
  if (dimensions.size !== 1) {
    diagnostic(context, 'INCOMPATIBLE_UNIT', 'Direct CostQuantities have incompatible dimensions', valueId);
    return { invalid: true };
  }
  const dimension = quantities[0].dimension;
  if (evaluated.rateDimension !== undefined && evaluated.rateDimension !== dimension) {
    diagnostic(context, 'INCOMPATIBLE_UNIT',
      `Cost rate for ${evaluated.rateDimension} cannot use ${dimension} quantities`, valueId);
    return { invalid: true };
  }
  const normalized = quantities.reduce((sum, entry) => sum.plus(entry.amount), new context.DecimalValue(0));
  const projectScale = dimension === 'count' || dimension === 'number'
    ? '1' : projectUnit(dimension, context)?.Scale;
  if (evaluated.rateDimension === undefined && !projectScale) {
    diagnostic(context, 'UNSUPPORTED_UNIT', `No project ${dimension} unit can be resolved`, valueId);
    return { invalid: true };
  }
  const factor = evaluated.rateDimension === undefined ? normalized.div(projectScale as string) : normalized;
  const quantityApplied = factor;
  const amount = evaluated.amount.mul(factor);
  if (!factor.isFinite() || (factor.isZero() && !normalized.isZero()) || !amount.isFinite() ||
      (amount.isZero() && !evaluated.amount.isZero() && !factor.isZero())) {
    diagnostic(context, 'INVALID_NUMBER', `IfcCostValue #${valueId} produced a non-finite total`, valueId);
    return { invalid: true };
  }
  return { ...evaluated, amount, quantityApplied, rateDimension: undefined };
}
function evaluateValueGraph(root: number, context: Context, quantities: QuantityValue[], implicitRoot: boolean,
  categoryTotals?: Map<string, EvaluatedCost[]>, applyUnitBasis = true): EvaluatedCost {
  const memo = new Map<number, EvaluatedCost>();
  const state = new Map<number, 1 | 2>();
  const stack: Array<{ id: number; expanded: boolean }> = [{ id: root, expanded: false }];
  while (stack.length > 0) {
    const frame = stack.pop() as { id: number; expanded: boolean };
    if (memo.has(frame.id)) continue;
    const value = context.values.get(frame.id);
    if (!value) {
      diagnostic(context, 'MISSING_REFERENCE', `IfcAppliedValue #${frame.id} cannot be resolved`, frame.id);
      memo.set(frame.id, { invalid: true });
      continue;
    }
    if (!frame.expanded) {
      if (state.get(frame.id) === 1) {
        diagnostic(context, 'VALUE_CYCLE', `IfcAppliedValue cycle includes #${frame.id}`, frame.id);
        memo.set(frame.id, { invalid: true });
        continue;
      }
      state.set(frame.id, 1);
      stack.push({ id: frame.id, expanded: true });
      for (const child of [...(value.Components ?? [])].reverse()) {
        if (!memo.has(child)) stack.push({ id: child, expanded: false });
      }
      continue;
    }
    state.set(frame.id, 2);
    if (value.Condition || value.InvalidCondition) {
      diagnostic(context, 'UNSUPPORTED_CONDITION', `Condition on IfcAppliedValue #${frame.id} requires external context`, frame.id, 'warning');
      memo.set(frame.id, { invalid: true });
      continue;
    }
    const categoryTotal = value.AppliedValue === undefined &&
      value.Components === undefined && value.Category !== undefined;
    const categoryValues = categoryTotal
      ? [...(categoryTotals?.get(value.Category as string) ?? []),
        ...(value.Category === '*' ? [] : categoryTotals?.get('') ?? [])]
      : [];
    const base = categoryTotal
      ? combineCosts('ADD', categoryValues, frame.id,
        (Code, Message, id, Severity) => diagnostic(context, Code, Message, id, Severity))
      : value.Components === undefined
        ? typedValue(value, frame.id, context)
      : combineCosts(value.ArithmeticOperator ?? '', value.Components.map(id => memo.get(id) ?? { invalid: true }), frame.id,
        (Code, Message, id, Severity) => diagnostic(context, Code, Message, id, Severity),
        (operand, dimension) => normalizeImplicitRate(operand, dimension, frame.id, context));
    const evaluated = normalizeUnitBasis(value, frame.id, base, context, applyUnitBasis);
    if (!evaluated.invalid && evaluated.amount === undefined) {
      diagnostic(context, 'MISSING_VALUE', `IfcAppliedValue #${frame.id} has no evaluable value`, frame.id, 'warning');
    }
    memo.set(frame.id, evaluated);
  }
  const evaluated = memo.get(root) ?? { invalid: true };
  return implicitRoot ? extendQuantity(root, evaluated, quantities, context) : evaluated;
}
function createContext(extraction: CostGraphExtraction, options?: CostEvaluationOptions): Context {
  const DecimalValue = Decimal.clone({
    precision: options?.Precision ?? 34,
    rounding: Decimal.ROUND_HALF_EVEN,
    maxE: 6144,
    minE: -6144,
  });
  const values = new Map<number, CostValueInfo>();
  for (const value of extraction.CostValues) if (value.expressId !== undefined) values.set(value.expressId, value);
  return {
    DecimalValue, extraction, values,
    quantities: new Map(extraction.CostQuantities.map(value => [value.expressId, value])),
    units: new Map(extraction.Units.map(value => [value.expressId, value])), diagnostics: [],
  };
}

function unsupported(extraction: CostGraphExtraction, expressId: number): CostEvaluationResult | undefined {
  if (extraction.SchemaVersion !== 'IFC2X3' && extraction.SchemaVersion !== 'IFC5') return undefined;
  return { expressId, Diagnostics: [{
    Code: extraction.SchemaVersion === 'IFC2X3' ? 'IFC2X3_PARTIAL_READ' : 'UNSUPPORTED_SCHEMA',
    Message: `${extraction.SchemaVersion} cost values are preserved for inspection but not evaluated`,
    Severity: 'warning', expressId,
  }] };
}

function result(expressId: number, value: EvaluatedCost, diagnostics: CostDiagnostic[]): CostEvaluationResult {
  return {
    expressId, Amount: value.invalid ? undefined : value.amount?.toString(), Currency: value.currency,
    Dimension: value.rateDimension ?? value.dimension, QuantityApplied: value.quantityApplied?.toString(), Diagnostics: diagnostics,
  };
}

/** Evaluate one IFC4/IFC4X3 applied-value expression using decimal arithmetic. */
export function evaluateCostValue(extraction: CostGraphExtraction, expressId: number,
  options?: CostEvaluationOptions): CostEvaluationResult {
  const refused = unsupported(extraction, expressId);
  if (refused) return refused;
  const context = createContext(extraction, options);
  return result(expressId, evaluateValueGraph(expressId, context, [], false), context.diagnostics);
}

interface ItemResult extends EvaluatedCost { byCategory: Map<string, EvaluatedCost[]> }

/** Evaluate a cost item, including IFC category-based totals of nested cost items. */
export function evaluateCostItem(extraction: CostGraphExtraction, expressId: number,
  options?: CostEvaluationOptions): CostEvaluationResult {
  const refused = unsupported(extraction, expressId);
  if (refused) return refused;
  const context = createContext(extraction, options);
  const items = new Map(extraction.CostItems.map(item => [item.expressId, item]));
  const children = new Map<number, number[]>();
  const parentByChild = new Map<number, number>();
  const invalidNesting = new Set<number>();
  for (const relation of extraction.Relationships) {
    if (relation.Type === 'IfcRelNests' && relation.RelatingObject !== undefined) {
      const related = relation.RelatedObjects ?? [];
      if (relation.InvalidRelatedObjects || relation.InvalidReferences) invalidNesting.add(relation.RelatingObject);
      children.set(relation.RelatingObject, [...(children.get(relation.RelatingObject) ?? []), ...related]);
      for (const child of related) {
        const previous = parentByChild.get(child);
        if (previous !== undefined) {
          invalidNesting.add(previous);
          invalidNesting.add(relation.RelatingObject);
          invalidNesting.add(child);
        } else parentByChild.set(child, relation.RelatingObject);
      }
    }
  }
  if (!items.has(expressId)) {
    return { expressId, Diagnostics: [{ Code: 'MISSING_REFERENCE',
      Message: `IfcCostItem #${expressId} cannot be resolved`, Severity: 'error', expressId }] };
  }
  const memo = new Map<number, ItemResult>();
  const state = new Map<number, 1 | 2>();
  const stack: Array<{ id: number; expanded: boolean }> = [{ id: expressId, expanded: false }];
  while (stack.length > 0) {
    const frame = stack.pop() as { id: number; expanded: boolean };
    if (memo.has(frame.id)) continue;
    if (!frame.expanded) {
      if (state.get(frame.id) === 1) {
        diagnostic(context, 'NESTING_CYCLE', `Cost item nesting cycle includes #${frame.id}`, frame.id);
        memo.set(frame.id, { invalid: true, byCategory: new Map() });
        continue;
      }
      state.set(frame.id, 1);
      stack.push({ id: frame.id, expanded: true });
      for (const child of [...(children.get(frame.id) ?? [])].reverse()) {
        if (!memo.has(child)) stack.push({ id: child, expanded: false });
      }
      continue;
    }
    state.set(frame.id, 2);
    const item = items.get(frame.id);
    if (!item) {
      diagnostic(context, 'MISSING_REFERENCE', `Nested cost item #${frame.id} cannot be resolved`, frame.id);
      memo.set(frame.id, { invalid: true, byCategory: new Map() });
      continue;
    }
    if (invalidNesting.has(item.expressId)) {
      diagnostic(context, 'MULTIPLE_NESTING_PARENTS', `Cost item #${item.expressId} participates in duplicate nesting`, item.expressId);
      memo.set(frame.id, { invalid: true, byCategory: new Map() });
      continue;
    }
    const quantities = itemQuantities(item, context);
    const categoryTotals = new Map<string, EvaluatedCost[]>();
    for (const childId of children.get(item.expressId) ?? []) {
      const child = memo.get(childId);
      if (!child) continue;
      categoryTotals.set('*', [...(categoryTotals.get('*') ?? []), child]);
      if (child.invalid) categoryTotals.set('', [...(categoryTotals.get('') ?? []), child]);
      for (const [category, values] of child.byCategory) {
        if (category === '*') continue;
        categoryTotals.set(category, [...(categoryTotals.get(category) ?? []), ...values]);
      }
    }
    const entries: Array<{ category?: string; evaluated: EvaluatedCost }> = [];
    for (const valueId of item.CostValues ?? []) {
      const value = context.values.get(valueId);
      if (!value) {
        diagnostic(context, 'MISSING_REFERENCE', `IfcCostValue #${valueId} cannot be resolved`, item.expressId);
        entries.push({ evaluated: { invalid: true } });
        continue;
      }
      if (value.Condition || value.InvalidCondition) {
        diagnostic(context, 'UNSUPPORTED_CONDITION', `Condition on IfcAppliedValue #${valueId} requires external context`, valueId, 'warning');
        entries.push({ category: value.Category, evaluated: { invalid: true } });
      } else if (quantities === undefined) {
        entries.push({ category: value.Category, evaluated: { invalid: true } });
      } else {
        entries.push({ category: value.Category, evaluated: quantities === undefined
          ? { invalid: true }
          : evaluateValueGraph(valueId, context, quantities, quantities.length > 0,
              categoryTotals, quantities.length > 0) });
      }
    }
    if (entries.length === 0) {
      diagnostic(context, 'MISSING_VALUE', `IfcCostItem #${item.expressId} has no evaluable CostValues`, item.expressId, 'warning');
    }
    const byCategory = new Map<string, EvaluatedCost[]>();
    for (const entry of entries) {
      if (entry.category) byCategory.set(entry.category,
        [...(byCategory.get(entry.category) ?? []), entry.evaluated]);
    }
    const combined = combineCosts('ADD', entries.map(entry => entry.evaluated), item.expressId,
      (Code, Message, id, Severity) => diagnostic(context, Code, Message, id, Severity));
    const quantityApplied = entries.find(entry => entry.evaluated.quantityApplied)?.evaluated.quantityApplied;
    memo.set(frame.id, { ...combined, quantityApplied, byCategory });
  }
  return result(expressId, memo.get(expressId) ?? { invalid: true }, context.diagnostics);
}
