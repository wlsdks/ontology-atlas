/**
 * The input schema a tool advertises is its contract minus what the server
 * already enforces in the same words: an `enum` string drops `minLength` and
 * `pattern`, which every listed value satisfies, and a top-level non-blank
 * string drops `pattern` and `minLength: 1`, which
 * `requireTopLevelNonBlankStrings` checks before the handler runs. Array items
 * and object rows keep their patterns: handlers judge them item by item, some
 * as partial results, so the server cannot refuse the whole call for them.
 */

import { NON_BLANK_STRING_SCHEMA } from './tool-schemas/field-primitives.mjs';

const NON_BLANK_PATTERN = NON_BLANK_STRING_SCHEMA.pattern;
const NON_BLANK_REGEXP = new RegExp(NON_BLANK_PATTERN, 'u');
const LINE_TERMINATOR = /[\n\r\u2028\u2029]/u;
const CHILD_MAPS = new Set(['properties', 'patternProperties']);
const CHILD_LISTS = new Set(['anyOf', 'oneOf', 'allOf']);
// Only anyOf is checked again by requireTopLevelNonBlankStrings, so only an
// anyOf branch of a top-level field may lose its pattern.
const TOP_LEVEL_LISTS = new Set(['anyOf']);
const CHILD_VALUES = new Set(['items', 'additionalProperties']);

function isObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function compactNode(schema, topLevel) {
  const out = {};
  for (const [key, value] of Object.entries(schema)) {
    if (CHILD_MAPS.has(key) && isObject(value)) {
      out[key] = Object.fromEntries(Object.entries(value)
        .map(([name, child]) => [name, isObject(child) ? compactNode(child, false) : child]));
    } else if (CHILD_LISTS.has(key) && Array.isArray(value)) {
      const branchTopLevel = topLevel && TOP_LEVEL_LISTS.has(key);
      out[key] = value.map((child) => (isObject(child) ? compactNode(child, branchTopLevel) : child));
    } else if (CHILD_VALUES.has(key) && isObject(value)) {
      out[key] = compactNode(value, false);
    } else {
      out[key] = value;
    }
  }
  if (Array.isArray(out.enum)) {
    delete out.minLength;
    delete out.pattern;
  } else if (topLevel && out.pattern === NON_BLANK_PATTERN) {
    delete out.pattern;
    if (out.minLength === 1) delete out.minLength;
  }
  return out;
}

/** The advertised form of a tool's input schema. */
export function advertisedInputSchema(inputSchema) {
  if (!isObject(inputSchema?.properties)) return inputSchema;
  return {
    ...inputSchema,
    properties: Object.fromEntries(Object.entries(inputSchema.properties)
      .map(([name, child]) => [name, isObject(child) ? compactNode(child, true) : child])),
  };
}

function isTopLevelNonBlank(schema) {
  if (!isObject(schema)) return false;
  if (schema.pattern === NON_BLANK_PATTERN && !Array.isArray(schema.enum)) return true;
  return Array.isArray(schema.anyOf) && schema.anyOf.some(isTopLevelNonBlank);
}

/**
 * Refuses a top-level string argument whose contract is non-blank and whose
 * advertised schema no longer carries the pattern: the specific messages
 * `requireNonBlankString` uses first, then the pattern itself, so a value it
 * refused (an interior line break among them) is still refused.
 */
export function requireTopLevelNonBlankStrings(args, inputSchema) {
  for (const [name, schema] of Object.entries(inputSchema?.properties ?? {})) {
    const value = args[name];
    if (typeof value === 'string' && isTopLevelNonBlank(schema)) requireNonBlank(value, name);
  }
}

function requireNonBlank(value, name) {
  if (value.trim() === '') throw new Error(`${name} must be a non-empty string.`);
  if (value !== value.trim()) {
    throw new Error(`${name} must not have leading or trailing whitespace. Example ${name}: ${JSON.stringify(value.trim())}.`);
  }
  if (value.includes('\0')) throw new Error(`${name} must not contain a null byte.`);
  if (!NON_BLANK_REGEXP.test(value)) {
    const codePoint = (LINE_TERMINATOR.exec(value)?.[0] ?? '\n').codePointAt(0).toString(16).toUpperCase().padStart(4, '0');
    throw new Error(`${name} must be a single line: it contains U+${codePoint}, a control or invisible formatting character that breaks a line.`);
  }
}
