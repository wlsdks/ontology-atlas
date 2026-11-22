/**
 * Checks a value against the JSON Schema subset the tool input contracts use:
 * type, enum, properties, required, additionalProperties: false, items,
 * min/maxItems, uniqueItems, min/maxLength, pattern, minimum, maximum,
 * format: date-time, anyOf and examples. A contract using oneOf or allOf is a
 * programming error here, not a pass. A tool may advertise a short schema for
 * a deep argument and keep the full one here; a call that breaks the full
 * contract is refused with a message naming the field, the rule it broke, the
 * shape of the object it sits in, one valid example of that field, and the
 * nearest documented rule, so one retry can repair it.
 */

import { closestAllowedValue } from '../suggestions.mjs';
import { closestAllowedObjectField } from './validate.mjs';
import { NON_BLANK_MULTILINE_TEXT_SCHEMA, NON_BLANK_STRING_SCHEMA } from './tool-schemas/field-primitives.mjs';

const PATTERN_TEXT = new Map([
  [NON_BLANK_STRING_SCHEMA.pattern, 'a non-empty single-line string without leading or trailing whitespace or a null byte'],
  [NON_BLANK_MULTILINE_TEXT_SCHEMA.pattern, 'non-empty text without leading or trailing whitespace or a null byte'],
  ['^sha256:[a-f0-9]{64}$', 'a digest "sha256:" followed by 64 lowercase hex digits'],
  ['^[a-f0-9]{64}$', '64 lowercase hex digits'],
]);
const PATTERN_EXAMPLE = new Map([
  ['^sha256:[a-f0-9]{64}$', `sha256:${'0'.repeat(64)}`],
  ['^[a-f0-9]{64}$', '0'.repeat(64)],
]);
const DATE_TIME = /^\d{4}-\d{2}-\d{2}[Tt]\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:[Zz]|[+-]\d{2}:\d{2})$/;
const DATE_TIME_EXAMPLE = '2026-01-31T09:00:00.000Z';
const SHAPE_MAX_CHARS = 900;
const EXAMPLE_MAX_CHARS = 900;
const DESCRIBED = Symbol('described');
/** Longest slice of a received value a refusal repeats, JSON-escaped. */
const ECHO_MAX_CHARS = 120;
/** Deeper than any checked contract; a value nested past it is refused before the walk. */
const MAX_NESTING = 64;
const SAFE_NAME = /^[A-Za-z0-9_$-]{1,64}$/;

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function typeOf(value) {
  if (value === null) return 'null';
  if (Array.isArray(value)) return 'array';
  if (typeof value === 'number') return Number.isInteger(value) ? 'integer' : 'number';
  return typeof value;
}

function matchesType(value, type) {
  const actual = typeOf(value);
  if (type === 'number') return actual === 'number' || actual === 'integer';
  return actual === type;
}

/**
 * A received value as a refusal may repeat it: a string JSON-escaped and cut to
 * ECHO_MAX_CHARS, a scalar as written, anything else by its type.
 */
function echo(value) {
  if (typeof value === 'string') {
    if (value.length <= ECHO_MAX_CHARS) return JSON.stringify(value);
    return `${JSON.stringify(value.slice(0, ECHO_MAX_CHARS))}… (${value.length} characters)`;
  }
  if (value === null || typeof value === 'number' || typeof value === 'boolean') return String(value);
  return typeText(typeOf(value));
}

/** A received key: bare when it is a plain name, else echoed. */
function echoName(key) {
  return SAFE_NAME.test(key) ? key : echo(key);
}

function typeText(type) {
  const names = { object: 'an object', array: 'an array', string: 'a string', integer: 'an integer', number: 'a number', boolean: 'a boolean', null: 'null' };
  return (Array.isArray(type) ? type : [type]).map((name) => names[name] ?? name).join(' or ');
}

/** One-line picture of a schema: `{a, b?: string, c: "x"|"y"}`, objects two levels deep. */
function describeShape(schema, depth = 2) {
  if (!schema || typeof schema !== 'object') return 'any';
  if (schema.anyOf) return schema.anyOf.map((option) => describeShape(option, depth)).join(' | ');
  if (schema.enum) return schema.enum.map((value) => JSON.stringify(value)).join('|');
  const type = Array.isArray(schema.type) ? schema.type.join('|') : schema.type;
  if (type === 'array') {
    const bounds = [
      schema.minItems !== undefined ? `≥${schema.minItems}` : '',
      schema.maxItems !== undefined ? `≤${schema.maxItems}` : '',
    ].filter(Boolean).join(' ');
    return `${describeShape(schema.items, depth)}[${bounds}]`;
  }
  if (type === 'object' && schema.properties) {
    if (depth <= 0) return '{…}';
    const required = new Set(schema.required ?? []);
    const fields = Object.entries(schema.properties)
      .map(([key, child]) => `${key}${required.has(key) ? '' : '?'}: ${describeShape(child, depth - 1)}`);
    return `{${fields.join(', ')}}`;
  }
  if ((type === 'number' || type === 'integer') && schema.minimum !== undefined) {
    return schema.maximum !== undefined ? `${type} ${schema.minimum}..${schema.maximum}` : `${type} ≥${schema.minimum}`;
  }
  if (type === 'string' && schema.format) return `string (${schema.format})`;
  return type ?? 'any';
}

function shapeOf(schema) {
  const text = describeShape(schema);
  return text.length <= SHAPE_MAX_CHARS ? text : describeShape(schema, 1);
}

/**
 * A minimal value that passes `schema`: required fields only, arrays at their
 * minimum length, strings as `<field>` placeholders.
 */
export function exampleOf(schema, key = 'value') {
  if (!schema || typeof schema !== 'object') return null;
  if (schema.examples?.length) return schema.examples[0];
  if (schema.anyOf) return exampleOf(schema.anyOf[0], key);
  if (schema.enum) return schema.enum[0];
  const type = Array.isArray(schema.type) ? schema.type[0] : schema.type;
  if (type === 'object') {
    return Object.fromEntries((schema.required ?? [])
      .map((field) => [field, exampleOf(schema.properties?.[field], field)]));
  }
  if (type === 'array') {
    return Array.from({ length: schema.minItems ?? 0 }, (_, index) => numbered(exampleOf(schema.items, key), index));
  }
  if (type === 'number' && schema.minimum !== undefined && schema.maximum !== undefined) {
    return schema.minimum + (schema.maximum - schema.minimum) * 0.8;
  }
  if (type === 'integer' || type === 'number') return schema.minimum ?? 0;
  if (type === 'boolean') return true;
  if (type === 'null') return null;
  if (type === 'string') {
    if (schema.format === 'date-time') return DATE_TIME_EXAMPLE;
    if (PATTERN_EXAMPLE.has(schema.pattern)) return PATTERN_EXAMPLE.get(schema.pattern);
    return `<${key}>`;
  }
  return null;
}

/** Gives the nth copy of an array item its own placeholders, so unique-item rules hold. */
function numbered(value, index) {
  if (index === 0) return value;
  if (typeof value === 'string') return /^<.*>$/.test(value) ? value.replace(/>$/, ` ${index + 1}>`) : value;
  if (Array.isArray(value)) return value.map((item) => numbered(item, index));
  if (isPlainObject(value)) {
    return Object.fromEntries(Object.entries(value).map(([field, child]) => [field, numbered(child, index)]));
  }
  return value;
}

function lastKey(path) {
  return path.replace(/\[\d+\]$/, '').split('.').pop();
}

/**
 * One valid example for the field at `path`. An array shows one item; an object
 * whose whole example is too long shows its first required field that fits.
 */
function exampleFor(schema, path) {
  if (!schema) return null;
  const type = Array.isArray(schema.type) ? schema.type[0] : schema.type;
  if (type === 'array' && schema.items && !schema.examples) return exampleFor(schema.items, `${path}[0]`);
  const text = JSON.stringify(exampleOf(schema, lastKey(path)));
  if (text.length <= EXAMPLE_MAX_CHARS) return { path, text };
  if (type !== 'object') return null;
  for (const field of schema.required ?? []) {
    const nested = exampleFor(schema.properties?.[field], `${path}.${field}`);
    if (nested && nested.text.startsWith('{')) return nested;
  }
  return null;
}

/** The refusal: the broken rule, the object's shape, and a valid example of the field. */
function refusal(path, rule, schema, { examplePath = path, exampleSchema = schema, repairFields = {} } = {}) {
  const shape = schema?.type === 'object' && schema.properties ? ` Expected shape of ${path}: ${shapeOf(schema)}.` : '';
  const example = exampleFor(exampleSchema, examplePath);
  const exampleSentence = example ? ` Example ${example.path}: ${example.text}.` : '';
  // rpc.mjs sends errorCode and repairFields as given instead of parsing the text.
  return Object.assign(new Error(`${rule}${shape}${exampleSentence}`), {
    errorCode: 'invalid_arguments',
    repairFields: { fieldPath: path, ...repairFields },
  });
}

function checkString(value, schema, path) {
  if (schema.minLength !== undefined && value.length < schema.minLength) {
    throw refusal(path, `${path} must be at least ${schema.minLength} character${schema.minLength === 1 ? '' : 's'} long.`, schema);
  }
  if (schema.maxLength !== undefined && value.length > schema.maxLength) {
    throw refusal(path, `${path} must be at most ${schema.maxLength} characters long; received ${value.length}.`, schema);
  }
  if (schema.pattern !== undefined && !new RegExp(schema.pattern, 'u').test(value)) {
    throw refusal(path, `${path} must be ${PATTERN_TEXT.get(schema.pattern) ?? `a string matching ${schema.pattern}`}.`, schema);
  }
  if (schema.format === 'date-time' && !DATE_TIME.test(value)) {
    throw refusal(path, `${path} must be an RFC 3339 date-time.`, schema);
  }
}

function checkNumber(value, schema, path) {
  if (schema.minimum !== undefined && value < schema.minimum) {
    throw refusal(path, `${path} must be >= ${schema.minimum}; received ${value}.`, schema);
  }
  if (schema.maximum !== undefined && value > schema.maximum) {
    throw refusal(path, `${path} must be <= ${schema.maximum}; received ${value}.`, schema);
  }
}

function checkArray(value, schema, path) {
  if (schema.minItems !== undefined && value.length < schema.minItems) {
    throw refusal(
      path,
      `${path} must contain at least ${schema.minItems} item${schema.minItems === 1 ? '' : 's'}; received ${value.length}. Each item: ${shapeOf(schema.items)}.`,
      schema,
    );
  }
  if (schema.maxItems !== undefined && value.length > schema.maxItems) {
    throw refusal(path, `${path} must contain at most ${schema.maxItems} items; received ${value.length}. Split the work across calls or keep the ${schema.maxItems} that matter.`, schema);
  }
  // Items first: a duplicate is compared only once every item has the shape it must have.
  if (schema.items) value.forEach((item, index) => checkValue(item, schema.items, `${path}[${index}]`));
  if (schema.uniqueItems) {
    const seen = new Map();
    value.forEach((item, index) => {
      const key = JSON.stringify(item);
      if (seen.has(key)) {
        throw refusal(
          path,
          `${path} must not repeat items; ${path}[${index}] repeats ${path}[${seen.get(key)}]: ${echo(item)}. Remove the duplicate.`,
          schema,
          { repairFields: { duplicateIndex: index, firstIndex: seen.get(key) } },
        );
      }
      seen.set(key, index);
    });
  }
}

function checkObject(value, schema, path) {
  const properties = schema.properties ?? {};
  for (const key of schema.required ?? []) {
    if (value[key] === undefined) {
      throw refusal(
        path,
        `${path} is missing required field "${key}"; required: ${schema.required.join(', ')}.`,
        schema,
        { examplePath: `${path}.${key}`, exampleSchema: properties[key] },
      );
    }
  }
  if (schema.additionalProperties === false) refuseUnknownKeys(value, schema, path);
  for (const [key, child] of Object.entries(properties)) {
    if (value[key] !== undefined) checkValue(value[key], child, `${path}.${key}`);
  }
}

function refuseUnknownKeys(value, schema, path) {
  const allowedFields = Object.keys(schema.properties ?? {});
  const allowed = new Set(allowedFields);
  const unknownFields = Object.keys(value).filter((key) => !allowed.has(key)).map((key) => {
    const suggestion = closestAllowedObjectField(key, allowedFields);
    return suggestion ? { name: key.slice(0, ECHO_MAX_CHARS), suggestion } : { name: key.slice(0, ECHO_MAX_CHARS) };
  });
  if (unknownFields.length === 0) return;
  const receivedFields = Object.keys(value).sort();
  const hint = ({ name, suggestion }) => (suggestion ? `${echo(name)} (did you mean "${suggestion}"?)` : echo(name));
  const head = unknownFields.length === 1
    ? `Unknown field ${echo(unknownFields[0].name)} in ${path}.${unknownFields[0].suggestion ? ` Did you mean "${unknownFields[0].suggestion}"?` : ''}`
    : `Unknown fields in ${path}: ${unknownFields.map(hint).join(', ')}.`;
  throw refusal(
    path,
    `${head} Allowed fields: ${allowedFields.join(', ')}. Received fields: ${receivedFields.map(echoName).join(', ')}.`,
    schema,
    {
      repairFields: {
        rowName: path,
        unknownFields,
        allowedFields,
        receivedFields: receivedFields.map((key) => key.slice(0, ECHO_MAX_CHARS)),
      },
    },
  );
}

function checkNode(value, schema, path) {
  if (schema.oneOf || schema.allOf) throw new TypeError(`schema-check does not enforce oneOf or allOf (at ${path}).`);
  if (schema.anyOf) {
    const reasons = [];
    for (const option of schema.anyOf) {
      try {
        checkValue(value, option, path);
        return;
      } catch (error) {
        reasons.push(error.message);
      }
    }
    throw refusal(path, `${path} must be ${schema.anyOf.map((option) => describeShape(option, 1)).join(' or ')}. ${reasons[0]}`, schema, {
      repairFields: { expectedType: schema.anyOf.map((option) => describeShape(option, 1)) },
    });
  }
  if (schema.type !== undefined) {
    const types = Array.isArray(schema.type) ? schema.type : [schema.type];
    if (!types.some((type) => matchesType(value, type))) {
      throw refusal(path, `${path} must be ${typeText(schema.type)}; received ${typeText(typeOf(value))}.`, schema, {
        repairFields: { expectedType: schema.type, receivedType: typeOf(value) },
      });
    }
  }
  if (schema.enum && !schema.enum.includes(value)) {
    const suggestion = typeof value === 'string' && value.length <= ECHO_MAX_CHARS ? closestAllowedValue(value, schema.enum) : null;
    const suggestionText = suggestion ? ` Did you mean "${suggestion}"?` : '';
    throw refusal(
      path,
      `${path} must be one of: ${schema.enum.join(', ')}. Received: ${echo(value)}.${suggestionText}`,
      { examples: [suggestion ?? schema.enum[0]] },
      {
        repairFields: {
          valueName: path,
          receivedValue: typeof value === 'string' ? value.slice(0, ECHO_MAX_CHARS) : echo(value),
          ...(suggestion ? { suggestion } : {}),
          allowedValues: schema.enum,
        },
      },
    );
  }
  if (typeof value === 'string') checkString(value, schema, path);
  else if (typeof value === 'number') checkNumber(value, schema, path);
  else if (Array.isArray(value)) checkArray(value, schema, path);
  else if (isPlainObject(value)) checkObject(value, schema, path);
}

/**
 * Throws an Error naming the first field of `value` that breaks `schema`. The
 * nearest enclosing `description` is appended once, so the refusal carries the
 * rule its field was documented with.
 */
export function checkAgainstSchema(value, schema, path) {
  if (nestsDeeperThan(value, MAX_NESTING)) {
    throw Object.assign(new Error(`${path} nests arrays or objects more than ${MAX_NESTING} levels deep; no contract here is that deep.`), {
      errorCode: 'invalid_arguments',
      repairFields: { fieldPath: path, maxNesting: MAX_NESTING },
    });
  }
  checkValue(value, schema, path);
}

/** Walks without recursion, so the guard itself cannot overflow the stack. */
function nestsDeeperThan(value, limit) {
  const stack = [[value, 0]];
  while (stack.length > 0) {
    const [node, depth] = stack.pop();
    if (node === null || typeof node !== 'object') continue;
    if (depth >= limit) return true;
    for (const child of Array.isArray(node) ? node : Object.values(node)) {
      if (child !== null && typeof child === 'object') stack.push([child, depth + 1]);
    }
  }
  return false;
}

function checkValue(value, schema, path) {
  try {
    checkNode(value, schema, path);
  } catch (error) {
    if (schema.description && !error[DESCRIBED]) {
      error.message = `${error.message} ${path}: ${schema.description}`;
      error[DESCRIBED] = true;
    }
    throw error;
  }
}
