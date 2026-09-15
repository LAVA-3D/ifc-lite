/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * Calendar-specific cross-entity orchestration, split out of
 * `schedule-extractor.ts` purely to keep both files under the ~400-line
 * module-size guideline (see AGENTS.md) — same reason
 * `schedule-calendar-types.ts` was split from `schedule-types.ts`. This file
 * owns the two calendar-specific steps of the walk: collecting every
 * IFCWORKCALENDAR into a lookup map, and — given one already-decoded
 * IfcRelAssignsToControl — deciding whether it's a calendar assignment
 * (as opposed to the schedule/work-plan control relation
 * `schedule-extractor.ts` handles inline) and if so wiring it onto the
 * related tasks/schedules.
 */

import { EntityExtractor } from './entity-extractor.js';
import type { IfcDataStore } from './columnar-parser.js';
import type { ScheduleTaskInfo, WorkScheduleInfo } from './schedule-types.js';
import { extractWorkCalendar } from './schedule-calendar-types.js';
import type { WorkCalendarInfo } from './schedule-calendar-types.js';

/** Extract every IFCWORKCALENDAR express id into a WorkCalendarInfo, keyed both as a flat list and by express id (for the assignment walk below). */
export function extractWorkCalendars(
  extractor: EntityExtractor,
  store: IfcDataStore,
  workCalendarIds: number[],
): { workCalendars: WorkCalendarInfo[]; calendarByExpressId: Map<number, WorkCalendarInfo> } {
  const workCalendars: WorkCalendarInfo[] = [];
  const calendarByExpressId = new Map<number, WorkCalendarInfo>();
  for (const id of workCalendarIds) {
    const info = extractWorkCalendar(extractor, store, id);
    if (info) {
      workCalendars.push(info);
      calendarByExpressId.set(id, info);
    }
  }
  return { workCalendars, calendarByExpressId };
}

/**
 * Given one IfcRelAssignsToControl's already-decoded RelatingControl id and
 * RelatedObjects, check whether RelatingControl resolves to a calendar
 * (rather than a schedule/work-plan, which the caller's own branch handles)
 * and if so populate `calendarGlobalIds` on every related task/schedule it
 * resolves to. A task or schedule can carry both a controlling schedule AND
 * a calendar via two separate IfcRelAssignsToControl relation instances —
 * this only ever touches `calendarGlobalIds`, so it never clobbers
 * `controllingScheduleGlobalIds`/`taskGlobalIds` populated by the caller's
 * schedule-control branch for a *different* relation.
 *
 * Returns true when this relation WAS a calendar assignment, so the caller
 * knows to skip its own schedule/work-plan handling for it.
 */
export function tryAssignCalendar(
  controlId: number,
  objects: number[],
  calendarByExpressId: Map<number, WorkCalendarInfo>,
  taskByExpressId: Map<number, ScheduleTaskInfo>,
  scheduleByExpressId: Map<number, WorkScheduleInfo>,
): boolean {
  const calendar = calendarByExpressId.get(controlId);
  if (!calendar) return false;
  for (const objId of objects) {
    const task = taskByExpressId.get(objId);
    if (task) {
      const ids = (task.calendarGlobalIds ??= []);
      if (!ids.includes(calendar.globalId)) ids.push(calendar.globalId);
      continue;
    }
    const schedule = scheduleByExpressId.get(objId);
    if (schedule) {
      const ids = (schedule.calendarGlobalIds ??= []);
      if (!ids.includes(calendar.globalId)) ids.push(calendar.globalId);
    }
  }
  return true;
}
