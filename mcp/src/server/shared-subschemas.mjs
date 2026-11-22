/**
 * Writes each repeated subschema of an output schema once. The tool files
 * spread shared shapes in place, so the post-write maintenance summary alone
 * repeated its action shape six times in every write tool. `hoistSharedSubschemas`
 * moves every subtree that appears more than once, when that saves bytes, into
 * the root `$defs` and replaces each occurrence with a bare `{ $ref }`;
 * `inlineSharedSubschemas` undoes it exactly.
 *
 * A `$ref` node never has siblings, so draft-07 and 2020-12 validators read the
 * same schema. Input schemas stay inline: hosts hand them to the model, and not
 * every model API resolves `$ref`.
 */

const SCHEMA_MAP_KEYWORDS = new Set(['properties', 'patternProperties', '$defs']);
const SCHEMA_LIST_KEYWORDS = new Set(['oneOf', 'anyOf', 'allOf', 'prefixItems']);
const SCHEMA_VALUE_KEYWORDS = new Set([
  'items', 'additionalProperties', 'propertyNames', 'not', 'if', 'then', 'else', 'contains',
]);
const REF_PREFIX = '#/$defs/';
const KEYWORD_SUFFIX = { items: 'Item', additionalProperties: 'Value', oneOf: 'Option', anyOf: 'Option', allOf: 'Part' };

function isSchemaObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

/** Rebuilds `schema` with `visit(child, label)` applied to each direct subschema. */
function mapSubschemas(schema, visit) {
  const out = {};
  for (const [key, value] of Object.entries(schema)) {
    if (SCHEMA_MAP_KEYWORDS.has(key) && isSchemaObject(value)) {
      out[key] = Object.fromEntries(Object.entries(value).map(([name, child]) => [name, isSchemaObject(child) ? visit(child, name) : child]));
    } else if (SCHEMA_LIST_KEYWORDS.has(key) && Array.isArray(value)) {
      out[key] = value.map((child) => (isSchemaObject(child) ? visit(child, null, key) : child));
    } else if (SCHEMA_VALUE_KEYWORDS.has(key) && isSchemaObject(value)) {
      out[key] = visit(value, null, key);
    } else {
      out[key] = value;
    }
  }
  return out;
}

function countSubschemas(schema, counts, names) {
  const walk = (parentName) => (node, propertyName, keyword) => {
    const name = propertyName ?? `${parentName}${KEYWORD_SUFFIX[keyword] ?? 'Shape'}`;
    const text = JSON.stringify(node);
    counts.set(text, (counts.get(text) ?? 0) + 1);
    if (!names.has(text)) names.set(text, name);
    mapSubschemas(node, walk(name));
    return node;
  };
  mapSubschemas(schema, walk('root'));
}

function uniqueName(base, taken) {
  const clean = base.replace(/[^A-Za-z0-9_]/g, '_');
  let name = clean;
  for (let index = 2; taken.has(name); index += 1) name = `${clean}${index}`;
  taken.add(name);
  return name;
}

function hoistSharedSubschemas(schema) {
  if (!isSchemaObject(schema) || schema.$defs !== undefined) return schema;
  let root = schema;
  const defs = {};
  const taken = new Set();
  for (;;) {
    const counts = new Map();
    const names = new Map();
    countSubschemas(root, counts, names);
    for (const def of Object.values(defs)) countSubschemas(def, counts, names);
    let best = null;
    for (const [text, count] of counts) {
      if (count < 2) continue;
      const name = names.get(text);
      const refBytes = `{"$ref":"${REF_PREFIX}${name}"}`.length;
      const saved = count * text.length - (count * refBytes + text.length + name.length + 4);
      if (saved > 0 && (!best || saved > best.saved)) best = { text, saved, name };
    }
    if (!best) break;
    const name = uniqueName(best.name, taken);
    const ref = { $ref: `${REF_PREFIX}${name}` };
    const replace = (node) => (JSON.stringify(node) === best.text ? ref : mapSubschemas(node, replace));
    const hoisted = JSON.parse(best.text);
    root = mapSubschemas(root, replace);
    for (const [key, def] of Object.entries(defs)) defs[key] = mapSubschemas(def, replace);
    defs[name] = mapSubschemas(hoisted, replace);
  }
  return Object.keys(defs).length === 0 ? schema : { ...root, $defs: defs };
}

function inlineSharedSubschemas(schema) {
  if (!isSchemaObject(schema) || !isSchemaObject(schema.$defs)) return schema;
  const { $defs: defs, ...root } = schema;
  const inline = (node) => {
    if (typeof node.$ref === 'string' && node.$ref.startsWith(REF_PREFIX)) {
      const target = defs[node.$ref.slice(REF_PREFIX.length)];
      if (!target) throw new Error(`unresolved ${node.$ref}`);
      return inline(target);
    }
    return mapSubschemas(node, inline);
  };
  return mapSubschemas(root, inline);
}

export { hoistSharedSubschemas, inlineSharedSubschemas };
