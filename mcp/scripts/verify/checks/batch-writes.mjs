import { WRITE_RELATION_TYPE_VALUES } from '../../../src/ontology-engine.mjs';

import { sameArray } from '../value-checks.mjs';
import { structuredErrorFailure } from './strict-arguments.mjs';
import { structuredContentFailure } from './structured-content.mjs';

const ADD_CONCEPT_KIND_VALUES = Object.freeze(['project', 'domain', 'capability', 'element', 'document']);

export function batchRowIsolationFailure(response, key, label) {
  if (!response || !response.result) {
    return `no ${label} row-isolation response`;
  }
  if (response.result.isError === true) {
    return `${label} row-isolation smoke returned top-level tool error`;
  }
  let parsed = null;
  try {
    parsed = JSON.parse(response.result.content?.[0]?.text || '{}');
  } catch (err) {
    return `failed to parse ${label} row-isolation response: ${err.message}`;
  }
  const rows = parsed?.[key];
  const expectedRows = key === 'relations' ? 4 : 5;
  if (!Array.isArray(rows) || rows.length !== expectedRows) {
    return `${label} row-isolation response missing ${expectedRows} result rows`;
  }
  const writeSummary = ['findings', 'coverage', 'postWriteMaintenance']
    .find((keyName) => Object.prototype.hasOwnProperty.call(parsed, keyName));
  if (writeSummary) {
    return `${label} row-isolation response unexpectedly included ${writeSummary}`;
  }
  const [nonObjectRow, unknownFieldRow, thirdRow, fourthRow, fifthRow] = rows;
  const writeMetadataKeys = ['changed', 'alreadyExists', 'mtime', 'findings'];
  for (const [index, row] of rows.entries()) {
    if (row?.ok !== false) continue;
    const present = writeMetadataKeys.filter((keyName) => Object.prototype.hasOwnProperty.call(row || {}, keyName));
    if (present.length > 0) {
      return `${label} row-isolation failed row ${index} unexpectedly included write metadata: ${present.join(', ')}`;
    }
  }
  const singleUnknownFieldRow = key === 'relations' ? fourthRow : fifthRow;
  if (nonObjectRow?.ok !== false || typeof nonObjectRow.error !== 'string' || !/must be an object/i.test(nonObjectRow.error)) {
    return `${label} row-isolation response missing non-object row error`;
  }
  if (!rowErrorMentionsIndex(nonObjectRow, 0)) {
    return `${label} row-isolation response missing non-object row index`;
  }
  if (nonObjectRow.errorCode !== 'invalid_arguments') {
    return `${label} row-isolation response missing non-object row errorCode`;
  }
  if (unknownFieldRow?.ok !== false || typeof unknownFieldRow.error !== 'string' || !/Unknown field/i.test(unknownFieldRow.error)) {
    return `${label} row-isolation response missing unknown-field row error`;
  }
  if (!rowErrorMentionsIndex(unknownFieldRow, 1)) {
    return `${label} row-isolation response missing unknown-field row index`;
  }
  if (key === 'concepts' && !/Unknown fields in concepts\[1\]/i.test(unknownFieldRow.error)) {
    return `${label} row-isolation response missing concept multi-field error`;
  }
  if (key === 'concepts' && !/"titel" \(did you mean "title"\?\)/i.test(unknownFieldRow.error)) {
    return `${label} row-isolation response missing concept typo field error`;
  }
  if (key === 'concepts' && !/"domian" \(did you mean "domain"\?\)/i.test(unknownFieldRow.error)) {
    return `${label} row-isolation response missing concept domain field suggestion`;
  }
  if (key === 'concepts' && !/Received fields: domian, kind, slug, titel, title/i.test(unknownFieldRow.error)) {
    return `${label} row-isolation response missing concept received fields`;
  }
  if (key === 'concepts' && unknownFieldRow.errorCode !== 'invalid_arguments') {
    return `${label} row-isolation response missing concept unknown-field row errorCode`;
  }
  if (
    key === 'concepts' &&
    (
      unknownFieldRow.rowName !== 'concepts[1]' ||
      !sameUnknownFields(unknownFieldRow.unknownFields, [
        ['titel', 'title'],
        ['domian', 'domain'],
      ]) ||
      !sameArray(unknownFieldRow.allowedFields, ['slug', 'kind', 'title', 'domain', 'domains', 'capabilities', 'elements', 'path', 'body', 'labels']) ||
      !sameArray(unknownFieldRow.receivedFields, ['domian', 'kind', 'slug', 'titel', 'title'])
    )
  ) {
    return `${label} row-isolation response missing concept structured field repair`;
  }
  if (
    key === 'concepts' &&
    (
      singleUnknownFieldRow?.ok !== false ||
      typeof singleUnknownFieldRow.error !== 'string' ||
      !/Unknown field "titel" in concepts\[4\]/i.test(singleUnknownFieldRow.error) ||
      singleUnknownFieldRow.errorCode !== 'invalid_arguments' ||
      singleUnknownFieldRow.rowName !== 'concepts[4]' ||
      singleUnknownFieldRow.receivedField !== 'titel' ||
      !sameUnknownFields(singleUnknownFieldRow.unknownFields, [['titel', 'title']]) ||
      !sameArray(singleUnknownFieldRow.allowedFields, ['slug', 'kind', 'title', 'domain', 'domains', 'capabilities', 'elements', 'path', 'body', 'labels']) ||
      !sameArray(singleUnknownFieldRow.receivedFields, ['kind', 'slug', 'titel', 'title'])
    )
  ) {
    return `${label} row-isolation response missing concept single-field structured repair`;
  }
  if (
    key === 'concepts' &&
    (
      thirdRow?.ok !== false ||
      typeof thirdRow.error !== 'string'
    )
  ) {
    return `${label} row-isolation response missing duplicate seed row error`;
  }
  if (
    key === 'concepts' &&
    (
      thirdRow.errorCode !== 'invalid_arguments' ||
      thirdRow.valueName !== 'kind' ||
      thirdRow.receivedValue !== 'capabilty' ||
      thirdRow.suggestion !== 'capability' ||
      !sameArray(thirdRow.allowedValues, ADD_CONCEPT_KIND_VALUES)
    )
  ) {
    return `${label} row-isolation response missing duplicate seed structured repair`;
  }
  if (
    key === 'concepts' &&
    (
      fourthRow?.ok !== false ||
      typeof fourthRow.error !== 'string' ||
      !rowErrorMentionsIndex(fourthRow, 3) ||
      !/duplicate slug in input batch/i.test(fourthRow.error) ||
      !/first seen at concepts\[2\]/i.test(fourthRow.error)
    )
  ) {
    return `${label} row-isolation response missing duplicate slug row guidance`;
  }
  if (
    key === 'concepts' &&
    (
      fourthRow.errorCode !== 'conflict' ||
      fourthRow.rowName !== 'concepts[3]' ||
      fourthRow.conflictSlug !== 'verify-duplicate-slug' ||
      fourthRow.firstSeenAt !== 'concepts[2]'
    )
  ) {
    return `${label} row-isolation response missing duplicate slug structured repair`;
  }
  if (key === 'relations' && !/Unknown fields in relations\[1\]/i.test(unknownFieldRow.error)) {
    return `${label} row-isolation response missing relation multi-field error`;
  }
  if (key === 'relations' && !/"relation" \(did you mean "type"\?\)/i.test(unknownFieldRow.error)) {
    return `${label} row-isolation response missing relation typo field error`;
  }
  if (key === 'relations' && !/"frm" \(did you mean "from"\?\)/i.test(unknownFieldRow.error)) {
    return `${label} row-isolation response missing relation from field suggestion`;
  }
  if (key === 'relations' && !/Received fields: frm, from, relation, to, type/i.test(unknownFieldRow.error)) {
    return `${label} row-isolation response missing relation received fields`;
  }
  if (key === 'relations' && unknownFieldRow.errorCode !== 'invalid_arguments') {
    return `${label} row-isolation response missing relation unknown-field row errorCode`;
  }
  if (
    key === 'relations' &&
    (
      unknownFieldRow.rowName !== 'relations[1]' ||
      !sameUnknownFields(unknownFieldRow.unknownFields, [
        ['relation', 'type'],
        ['frm', 'from'],
      ]) ||
      !sameArray(unknownFieldRow.allowedFields, ['from', 'to', 'type', 'why', 'expected_mtime']) ||
      !sameArray(unknownFieldRow.receivedFields, ['frm', 'from', 'relation', 'to', 'type'])
    )
  ) {
    return `${label} row-isolation response missing relation structured field repair`;
  }
  if (
    key === 'relations' &&
    (
      singleUnknownFieldRow?.ok !== false ||
      typeof singleUnknownFieldRow.error !== 'string' ||
      !/Unknown field "relation" in relations\[3\]/i.test(singleUnknownFieldRow.error) ||
      singleUnknownFieldRow.errorCode !== 'invalid_arguments' ||
      singleUnknownFieldRow.rowName !== 'relations[3]' ||
      singleUnknownFieldRow.receivedField !== 'relation' ||
      !sameUnknownFields(singleUnknownFieldRow.unknownFields, [['relation', 'type']]) ||
      !sameArray(singleUnknownFieldRow.allowedFields, ['from', 'to', 'type', 'why', 'expected_mtime']) ||
      !sameArray(singleUnknownFieldRow.receivedFields, ['from', 'relation', 'to', 'type'])
    )
  ) {
    return `${label} row-isolation response missing relation single-field structured repair`;
  }
  if (
    key === 'relations' &&
    (
      thirdRow?.ok !== false ||
      typeof thirdRow.error !== 'string' ||
      !rowErrorMentionsIndex(thirdRow, 2) ||
      !/Received: "depend_on"/i.test(thirdRow.error) ||
      !/Did you mean "depends_on"\?/i.test(thirdRow.error)
    )
  ) {
    return `${label} row-isolation response missing relation type suggestion`;
  }
  if (
    key === 'relations' &&
    (
      thirdRow.errorCode !== 'invalid_arguments' ||
      thirdRow.valueName !== 'type' ||
      thirdRow.receivedValue !== 'depend_on' ||
      thirdRow.suggestion !== 'depends_on' ||
      !sameArray(thirdRow.allowedValues, WRITE_RELATION_TYPE_VALUES)
    )
  ) {
    return `${label} row-isolation response missing relation type structured repair`;
  }
  const structuredFailure = structuredContentFailure(response, parsed, `${label} row isolation`);
  if (structuredFailure) {
    return structuredFailure;
  }
  return null;
}

export function batchCapFailure(response, label, expectedNoun) {
  if (!response || !response.result) {
    return `no ${label} batch-cap response`;
  }
  if (response.result.isError !== true) {
    return `${label} batch-cap smoke did not reject over-cap batch`;
  }
  const text = response.result.content?.[0]?.text || '';
  if (!new RegExp(`Too many ${expectedNoun}: 51`, 'i').test(text) || !/Max 50 per call/i.test(text)) {
    return `${label} batch-cap response missing max-50 guidance`;
  }
  return structuredErrorFailure(response, `${label} batch cap`, { errorCode: 'invalid_arguments' });
}

function rowErrorMentionsIndex(row, index) {
  return typeof row?.error === 'string' && new RegExp(`\\[${index}\\]`).test(row.error);
}

function sameUnknownFields(actual, expectedPairs) {
  if (!Array.isArray(actual) || actual.length !== expectedPairs.length) return false;
  return expectedPairs.every(([name, suggestion], index) => (
    actual[index]?.name === name && actual[index]?.suggestion === suggestion
  ));
}
