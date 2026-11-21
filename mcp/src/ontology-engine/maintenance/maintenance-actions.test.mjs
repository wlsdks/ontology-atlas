import assert from 'node:assert/strict';
import test from 'node:test';

import { annotateMaintenanceAction, compareMaintenanceActions } from './maintenance-actions.mjs';

const action = (overrides) => ({ severity: 'warn', phase: 'repair', score: 0, kind: 'k', reason: 'r', ...overrides });

test('actions are ordered by severity, then phase, then higher score, then kind and reason', () => {
  const ordered = [
    action({ severity: 'info', phase: 'validate' }),
    action({ severity: 'fail', phase: 'review' }),
    action({ phase: 'review' }),
    action({ phase: 'repair', score: 1 }),
    action({ phase: 'repair', score: 5, kind: 'z' }),
    action({ phase: 'repair', score: 5, kind: 'a' }),
  ].sort(compareMaintenanceActions);
  assert.deepEqual(
    ordered.map(({ severity, phase, score, kind }) => `${severity}/${phase}/${score}/${kind}`),
    ['fail/review/0/k', 'warn/repair/5/a', 'warn/repair/5/z', 'warn/repair/1/k', 'warn/review/0/k', 'info/validate/0/k'],
  );
});

test('an unknown severity or phase sorts after every known one', () => {
  assert.ok(compareMaintenanceActions(action({ severity: 'info' }), action({ severity: 'odd' })) < 0);
  assert.ok(compareMaintenanceActions(action({ phase: 'review' }), action({ phase: 'odd' })) < 0);
});

test('an action id is the same for the same action wherever its nodes are listed from', () => {
  const first = annotateMaintenanceAction(action({ nodes: [{ slug: 'b' }, { slug: 'a' }] }));
  const second = annotateMaintenanceAction(action({ nodes: [{ slug: 'a' }, { slug: 'b' }] }));
  assert.match(first.id, /^maint_[0-9a-f]{8}$/);
  assert.equal(first.id, second.id);
  assert.notEqual(first.id, annotateMaintenanceAction(action({ reason: 'other' })).id);
});

test('an action is executable only when it proposes a tool call', () => {
  assert.equal(annotateMaintenanceAction(action({})).executable, false);
  assert.equal(annotateMaintenanceAction(action({ proposedAction: { tool: 'patch_concept' } })).executable, true);
});
