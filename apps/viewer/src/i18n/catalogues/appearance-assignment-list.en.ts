/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import type { TranslationValue } from '../types';

export const appearanceAssignmentListEn = {
  'appearanceAssignmentList.sectionAriaLabel': 'Appearance assignments',
  'appearanceAssignmentList.heading': 'Assignments',
  'appearanceAssignmentList.description':
    'Later assignments replace earlier ones on overlapping objects. Excluding an object here keeps any earlier assignment.',
  'appearanceAssignmentList.assignmentAriaLabel': 'Assignment {position}: {sourceName} on {modelName}',
  'appearanceAssignmentList.moveEarlierAriaLabel': 'Move assignment {position} earlier',
  'appearanceAssignmentList.moveLaterAriaLabel': 'Move assignment {position} later',
  'appearanceAssignmentList.removeAriaLabel': 'Remove assignment {position}',
  'appearanceAssignmentList.summary': {
    one: '{productCount} object · {excludedCount} excluded · {overriddenCount} replaced by later assignments',
    other: '{productCount} objects · {excludedCount} excluded · {overriddenCount} replaced by later assignments',
  },
  'appearanceAssignmentList.reviewAriaLabel': 'Review objects for assignment {position}',
  'appearanceAssignmentList.reviewButton': 'Review objects and exceptions',
} as const satisfies Record<string, TranslationValue>;
