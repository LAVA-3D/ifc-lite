/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * Pointer-lock requests settle asynchronously, and a quick gesture can end
 * before they do. #4868 review: the plain-call retry and a late grant both
 * outlived `release()`, so a released session could still capture the cursor
 * with nothing left to free it.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createFlyPointerLock } from './flyPointerLock.js';

interface Deferred { resolve(): void; reject(error: Error): void }

/** An element whose lock requests stay pending until the test settles them. */
function slowLockable() {
  const doc = {
    pointerLockElement: null as unknown,
    exits: 0,
    exitPointerLock() { doc.pointerLockElement = null; doc.exits++; },
  };
  const requests: { options?: { unadjustedMovement?: boolean }; settle: Deferred }[] = [];
  const el = {
    ownerDocument: doc,
    requestPointerLock(options?: { unadjustedMovement?: boolean }) {
      return new Promise<void>((resolve, reject) => {
        requests.push({
          options,
          settle: {
            // A grant is the browser making this element the lock holder.
            resolve: () => { doc.pointerLockElement = el; resolve(); },
            reject,
          },
        });
      });
    },
  };
  return { doc, el, requests, element: el as unknown as Element };
}

const flush = () => new Promise((r) => setTimeout(r, 0));

describe('createFlyPointerLock session lifetime (#4868)', () => {
  it('does not retry a rejected request after release', async () => {
    const lock = createFlyPointerLock();
    const { element, requests } = slowLockable();
    lock.arm(element);
    lock.request();
    assert.equal(requests.length, 1);
    lock.release(); // the gesture ended before the browser answered
    requests[0].settle.reject(new Error('unadjustedMovement not supported'));
    await flush();
    assert.equal(requests.length, 1, 'a stale rejection must not issue a fresh lock request');
  });

  it('gives back a lock granted after release', async () => {
    const lock = createFlyPointerLock();
    const { doc, element, requests } = slowLockable();
    lock.arm(element);
    lock.request();
    lock.release();
    requests[0].settle.resolve();
    await flush();
    assert.equal(doc.pointerLockElement, null, 'nobody owns this lock any more, so it must be exited');
    assert.equal(doc.exits, 1);
  });

  it('gives back a late grant from the plain retry too', async () => {
    const lock = createFlyPointerLock();
    const { doc, element, requests } = slowLockable();
    lock.arm(element);
    lock.request();
    requests[0].settle.reject(new Error('unadjustedMovement not supported'));
    await flush();
    assert.equal(requests.length, 2, 'precondition: the retry went out while the session was live');
    lock.release();
    requests[1].settle.resolve();
    await flush();
    assert.equal(doc.pointerLockElement, null);
  });

  it('keeps a lock granted to the live session', async () => {
    const lock = createFlyPointerLock();
    const { doc, element, requests } = slowLockable();
    lock.arm(element);
    lock.request();
    requests[0].settle.resolve();
    await flush();
    assert.equal(doc.pointerLockElement, element);
    assert.equal(lock.isLocked(), true);
  });

  it('a stale grant does not steal the lock from a newer session on the same element', async () => {
    const lock = createFlyPointerLock();
    const { doc, element, requests } = slowLockable();
    lock.arm(element);
    lock.request();
    lock.release();
    lock.arm(element); // next press
    lock.request();
    requests[1].settle.resolve();
    requests[0].settle.resolve();
    await flush();
    assert.equal(doc.pointerLockElement, element, 'the newer session still holds its lock');
    assert.equal(doc.exits, 0);
  });
});
