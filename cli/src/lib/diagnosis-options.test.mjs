import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { DIAGNOSIS_OPTION_FLAGS, parseDiagnosisOption } from './diagnosis-options.mjs';

const errorMessage = (value) => {
  assert.ok(value instanceof Error);
  return value.message;
};

describe('diagnosis option parsers', () => {
  it('exposes the focused health and workspace-brief tuning flags', () => {
    assert.deepEqual(DIAGNOSIS_OPTION_FLAGS, [
      '--component-limit',
      '--cycle-limit',
      '--recommendation-limit',
      '--order-limit',
      '--node-limit',
      '--dependency-types',
      '--component-types',
    ]);
  });

  it('maps bounded numeric flags to query_ontology option names', () => {
    const options = {};

    assert.equal(parseDiagnosisOption(options, '--component-limit', '5'), null);
    assert.equal(parseDiagnosisOption(options, '--cycle-limit', '6'), null);
    assert.equal(parseDiagnosisOption(options, '--recommendation-limit', '7'), null);
    assert.equal(parseDiagnosisOption(options, '--order-limit', '8'), null);
    assert.equal(parseDiagnosisOption(options, '--node-limit', '9'), null);

    assert.deepEqual(options, {
      componentLimit: 5,
      cycleLimit: 6,
      recommendationLimit: 7,
      orderLimit: 8,
      nodeLimit: 9,
    });
  });

  it('maps comma-separated relation type flags without validating enum values early', () => {
    const options = {};

    assert.equal(parseDiagnosisOption(options, '--dependency-types', 'depends_on, imports '), null);
    assert.equal(parseDiagnosisOption(options, '--component-types', 'depends_on'), null);

    assert.deepEqual(options, {
      dependencyTypes: ['depends_on', 'imports'],
      componentTypes: ['depends_on'],
    });
  });

  it('rejects malformed values with the user-facing flag name', () => {
    assert.equal(errorMessage(parseDiagnosisOption({}, '--component-limit', '501')), '--component-limit must be <= 500');
    assert.equal(errorMessage(parseDiagnosisOption({}, '--node-limit', '0')), '--node-limit must be a positive integer');
    assert.equal(errorMessage(parseDiagnosisOption({}, '--dependency-types', undefined)), '--dependency-types requires a value');
    assert.equal(
      errorMessage(parseDiagnosisOption({}, '--component-types', ',')),
      '--component-types requires at least one relation type',
    );
  });

  it('rejects unsupported diagnosis flags defensively', () => {
    assert.equal(
      errorMessage(parseDiagnosisOption({}, '--unknown-diagnosis-option', '1')),
      'unsupported diagnosis option: --unknown-diagnosis-option',
    );
  });
});
