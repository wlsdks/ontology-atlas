import test from 'node:test';
import assert from 'node:assert/strict';

import { diagnosisStatusColor, healthCheckStatusColor } from './diagnosis-colors.mjs';

const COLORS = {
  green: 'green',
  red: 'red',
  yellow: 'yellow',
  dim: 'dim',
};

test('diagnosisStatusColor maps top-level diagnosis statuses', () => {
  assert.equal(diagnosisStatusColor('healthy', COLORS), 'green');
  assert.equal(diagnosisStatusColor('needs_attention', COLORS), 'yellow');
  assert.equal(diagnosisStatusColor('unknown', COLORS), 'dim');
});

test('healthCheckStatusColor maps per-check health statuses', () => {
  assert.equal(healthCheckStatusColor('pass', COLORS), 'green');
  assert.equal(healthCheckStatusColor('fail', COLORS), 'red');
  assert.equal(healthCheckStatusColor('warn', COLORS), 'yellow');
  assert.equal(healthCheckStatusColor('info', COLORS), 'dim');
  assert.equal(healthCheckStatusColor('unknown', COLORS), 'dim');
});
