/**
 * Argument validation for every tool call — the strict-input half of the public
 * contract. Each `require*` throws the exact message `rpc.mjs` turns into a
 * recoverable error, so a rejected call always names the field and the allowed
 * values rather than failing deep inside a handler.
 */

import {
  NODE_KIND_VALUES,
  RELATION_TYPE_VALUES,
} from '../ontology-engine.mjs';
import {
  closestAllowedValue,
  formatAllowedValueError,
} from '../suggestions.mjs';
import { TOOL_BY_NAME } from './registry.mjs';
import { BODY_DELIVERY_MODES } from './tool-schemas.mjs';

function normalizeToolArguments(args, toolName) {
  if (args === undefined) return {};
  if (args === null || Array.isArray(args) || typeof args !== 'object') {
    throw new Error('tool arguments must be an object.');
  }
  const tool = TOOL_BY_NAME.get(toolName);
  if (tool) {
    const allowed = new Set(Object.keys(tool.inputSchema?.properties ?? {}));
    const unknown = Object.keys(args).filter((key) => !allowed.has(key));
    if (unknown.length > 0) {
      const allowedNames = [...allowed].sort();
      const allowedText = allowedNames.length > 0 ? allowedNames.join(', ') : 'no arguments';
      const receivedNames = Object.keys(args).sort();
      const receivedText = receivedNames.length > 0 ? receivedNames.join(', ') : 'none';
      if (unknown.length === 1) {
        const [key] = unknown;
        const suggestion = closestAllowedValue(key, allowedNames);
        const suggestionText = suggestion ? ` Did you mean "${suggestion}"?` : '';
        throw new Error(
          `Unknown argument "${key}" for ${toolName}.${suggestionText} Allowed arguments: ${allowedText}. Received arguments: ${receivedText}.`,
        );
      }
      const unknownText = unknown
        .map((key) => {
          const suggestion = closestAllowedValue(key, allowedNames);
          return suggestion ? `"${key}" (did you mean "${suggestion}"?)` : `"${key}"`;
        })
        .join(', ');
      throw new Error(
        `Unknown arguments for ${toolName}: ${unknownText}. Allowed arguments: ${allowedText}. Received arguments: ${receivedText}.`,
      );
    }
  }
  return args;
}

function requireOptionalNonNegativeNumber(value, name) {
  if (value === undefined) return;
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
    throw new Error(`${name} must be a non-negative finite number.`);
  }
}

function requireOptionalNonNegativeInteger(value, name, options = {}) {
  if (value === undefined) return;
  if (!Number.isInteger(value) || value < 0) {
    throw new Error(`${name} must be a non-negative integer.`);
  }
  if (options.max !== undefined && value > options.max) {
    throw new Error(`${name} must be <= ${options.max}.`);
  }
}

function requireOptionalPositiveInteger(value, name, options = {}) {
  if (value === undefined) return;
  if (!Number.isInteger(value) || value <= 0) {
    throw new Error(`${name} must be a positive integer.`);
  }
  if (options.max !== undefined && value > options.max) {
    throw new Error(`${name} must be <= ${options.max}.`);
  }
}

function requireOptionalDirection(value, name, allowed) {
  if (value === undefined) return;
  if (!allowed.includes(value)) {
    throw new Error(formatAllowedValueError(name, value, allowed));
  }
}

function requireOptionalEnum(value, name, allowed) {
  if (value === undefined) return;
  if (!allowed.includes(value)) {
    throw new Error(formatAllowedValueError(name, value, allowed));
  }
}

function requireOptionalBoolean(value, name) {
  if (value === undefined) return;
  if (typeof value !== 'boolean') {
    throw new Error(`${name} must be a boolean.`);
  }
}

function requireBodyMode(value, name = 'body') {
  if (value === undefined) return 'excerpt';
  if (typeof value !== 'string' || !BODY_DELIVERY_MODES.includes(value)) {
    throw new Error(`${name} must be one of: ${BODY_DELIVERY_MODES.join(', ')}.`);
  }
  return value;
}

function requireNonBlankString(value, name) {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new Error(`${name} must be a non-empty string.`);
  }
  if (value !== value.trim()) {
    throw new Error(`${name} must not have leading or trailing whitespace.`);
  }
  if (value.includes('\0')) {
    throw new Error(`${name} must not contain a null byte.`);
  }
  return value;
}

function requireOptionalNonBlankString(value, name) {
  if (value === undefined) return;
  requireNonBlankString(value, name);
}

function requireOptionalStringArray(value, name, options = {}) {
  if (value === undefined) return;
  if (!Array.isArray(value)) {
    throw new Error(`${name} must be an array of strings.`);
  }
  if (options.max !== undefined && value.length > options.max) {
    throw new Error(`${name} must contain at most ${options.max} items.`);
  }
  for (const item of value) {
    if (typeof item !== 'string') {
      throw new Error(`${name} must be an array of strings.`);
    }
    if (item.trim() === '') {
      throw new Error(`${name} items must be non-empty strings.`);
    }
    if (item !== item.trim()) {
      throw new Error(`${name} items must not have leading or trailing whitespace.`);
    }
    if (item.includes('\0')) {
      throw new Error(`${name} items must not contain a null byte.`);
    }
  }
}

function requireOptionalRelationTypeArray(value, name) {
  requireOptionalStringArray(value, name, { max: RELATION_TYPE_VALUES.length });
  if (value === undefined) return;
  for (const item of value) {
    if (!RELATION_TYPE_VALUES.includes(item)) {
      throw new Error(formatAllowedValueError(`${name} items`, item, RELATION_TYPE_VALUES));
    }
  }
}

function requireOptionalNodeKindArray(value, name) {
  requireOptionalStringArray(value, name, { max: NODE_KIND_VALUES.length });
  if (value === undefined) return;
  for (const item of value) {
    if (!NODE_KIND_VALUES.includes(item)) {
      throw new Error(formatAllowedValueError(`${name} items`, item, NODE_KIND_VALUES));
    }
  }
}

function requireOptionalPlainObject(value, name) {
  if (value === undefined) return;
  requirePlainObject(value, name);
}

function requirePlainObject(value, name) {
  if (value === null || Array.isArray(value) || typeof value !== 'object') {
    throw new Error(`${name} must be an object.`);
  }
}

function requireAllowedObjectKeys(value, name, allowedKeys) {
  const allowed = new Set(allowedKeys);
  const receivedFields = Object.keys(value).sort();
  const receivedText = receivedFields.length > 0 ? receivedFields.join(', ') : 'none';
  const unknownFields = Object.keys(value).filter((key) => !allowed.has(key));
  if (unknownFields.length === 0) return;
  if (unknownFields.length === 1) {
    const [key] = unknownFields;
    const suggestion = closestAllowedObjectField(key, allowedKeys);
    const suggestionText = suggestion ? ` Did you mean "${suggestion}"?` : '';
    throw new Error(
      `Unknown field "${key}" in ${name}.${suggestionText} Allowed fields: ${allowedKeys.join(', ')}. Received fields: ${receivedText}.`,
    );
  }
  const unknownText = unknownFields
    .map((key) => {
      const suggestion = closestAllowedObjectField(key, allowedKeys);
      return suggestion ? `"${key}" (did you mean "${suggestion}"?)` : `"${key}"`;
    })
    .join(', ');
  throw new Error(
    `Unknown fields in ${name}: ${unknownText}. Allowed fields: ${allowedKeys.join(', ')}. Received fields: ${receivedText}.`,
  );
}

function closestAllowedObjectField(key, allowedKeys) {
  if (key === 'relation' && allowedKeys.includes('type')) return 'type';
  return closestAllowedValue(key, allowedKeys);
}

export {
  normalizeToolArguments,
  requireOptionalNonNegativeNumber,
  requireOptionalNonNegativeInteger,
  requireOptionalPositiveInteger,
  requireOptionalDirection,
  requireOptionalEnum,
  requireOptionalBoolean,
  requireBodyMode,
  requireNonBlankString,
  requireOptionalNonBlankString,
  requireOptionalStringArray,
  requireOptionalRelationTypeArray,
  requireOptionalNodeKindArray,
  requireOptionalPlainObject,
  requirePlainObject,
  requireAllowedObjectKeys,
};
