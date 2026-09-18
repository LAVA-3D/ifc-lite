/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import type { TranslationValue } from '../types';

export const clipPlanesEn = {
  'clipPlanes.ribbon.label': 'Clipping',
  'clipPlanes.ribbon.tooltip': 'Clipping planes — right-click a face in the model to add one',
  'clipPlanes.menu.enable': 'Enable clipping',
  'clipPlanes.menu.showHandles': 'Show plane handles',
  'clipPlanes.menu.removeAll': 'Remove all planes',
  'clipPlanes.menu.count': '{count} of {max} planes',
  'clipPlanes.menu.empty': 'No clipping planes. Right-click a face and choose "Add clipping plane".',
  'clipPlanes.context.add': 'Add clipping plane',
  'clipPlanes.context.remove': 'Remove plane',
  'clipPlanes.gizmo.dragTitle': 'Drag to move the plane along its normal. Right-click to remove it.',
  'clipPlanes.toast.noFace': 'No face under the cursor to clip on.',
  'clipPlanes.toast.crossing': 'That plane would cross the opposite plane.',
  'clipPlanes.toast.empty': 'That plane would clip away the whole model.',
  'clipPlanes.toast.full': 'Up to {max} clipping planes are supported. Remove one first.',
  'clipPlanes.toast.replaced': 'Replaced the existing plane facing the same way.',
  'clipPlanes.toast.importDropped': '{dropped} clipping planes from the viewpoint could not be applied.',
} as const satisfies Record<string, TranslationValue>;
