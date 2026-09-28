const SCHEMA_KEYWORDS = new Set([
  'type', 'description', 'properties', 'required', 'additionalProperties', 'items', 'enum', 'const',
  'minimum', 'maximum', 'minLength', 'maxLength', 'pattern', 'format', 'minItems', 'maxItems',
  'uniqueItems', 'minProperties', 'propertyNames', 'oneOf', 'anyOf', 'allOf', 'not', 'if', 'then',
]);

function typeOf(value) {
  if (value === null) return 'null';
  if (Array.isArray(value)) return 'array';
  if (Number.isInteger(value)) return 'integer';
  return typeof value;
}

export function schemaErrors(schema, value, path = '$') {
  if (schema === true || schema === undefined) return [];
  if (schema === false) return [`${path}: not allowed`];
  for (const key of Object.keys(schema)) {
    if (!SCHEMA_KEYWORDS.has(key)) return [`${path}: unchecked keyword ${key}`];
  }
  const errors = [];
  const actual = typeOf(value);
  if (schema.type !== undefined) {
    const allowed = [schema.type].flat();
    if (!allowed.some((type) => type === actual || (type === 'number' && actual === 'integer'))) {
      return [`${path}: ${actual} is not ${allowed.join('|')}`];
    }
  }
  if (schema.enum && !schema.enum.some((entry) => JSON.stringify(entry) === JSON.stringify(value))) errors.push(`${path}: not in enum`);
  if ('const' in schema && JSON.stringify(schema.const) !== JSON.stringify(value)) errors.push(`${path}: not the const`);
  if (typeof value === 'number') {
    if (schema.minimum !== undefined && value < schema.minimum) errors.push(`${path}: below minimum`);
    if (schema.maximum !== undefined && value > schema.maximum) errors.push(`${path}: above maximum`);
  }
  if (typeof value === 'string') {
    if (schema.minLength !== undefined && [...value].length < schema.minLength) errors.push(`${path}: too short`);
    if (schema.maxLength !== undefined && [...value].length > schema.maxLength) errors.push(`${path}: too long`);
    if (schema.pattern !== undefined && !new RegExp(schema.pattern, 'u').test(value)) errors.push(`${path}: pattern`);
    if (schema.format === 'date-time' && Number.isNaN(Date.parse(value))) errors.push(`${path}: not a date-time`);
  }
  if (Array.isArray(value)) {
    if (schema.minItems !== undefined && value.length < schema.minItems) errors.push(`${path}: too few items`);
    if (schema.maxItems !== undefined && value.length > schema.maxItems) errors.push(`${path}: too many items`);
    if (schema.uniqueItems && new Set(value.map((entry) => JSON.stringify(entry))).size !== value.length) errors.push(`${path}: duplicate items`);
    if (schema.items) value.forEach((entry, index) => errors.push(...schemaErrors(schema.items, entry, `${path}[${index}]`)));
  }
  if (actual === 'object') {
    const keys = Object.keys(value);
    if (schema.minProperties !== undefined && keys.length < schema.minProperties) errors.push(`${path}: too few properties`);
    for (const key of schema.required ?? []) if (!(key in value)) errors.push(`${path}: missing ${key}`);
    for (const key of keys) {
      if (schema.propertyNames) errors.push(...schemaErrors(schema.propertyNames, key, `${path}{${key}}`));
      if (schema.properties && key in schema.properties) {
        errors.push(...schemaErrors(schema.properties[key], value[key], `${path}.${key}`));
      } else if (schema.additionalProperties !== undefined) {
        errors.push(...schemaErrors(schema.additionalProperties, value[key], `${path}.${key}`));
      }
    }
  }
  if (schema.allOf) for (const part of schema.allOf) errors.push(...schemaErrors(part, value, path));
  if (schema.anyOf && !schema.anyOf.some((part) => schemaErrors(part, value, path).length === 0)) errors.push(`${path}: no anyOf branch`);
  if (schema.oneOf && schema.oneOf.filter((part) => schemaErrors(part, value, path).length === 0).length !== 1) errors.push(`${path}: not exactly one oneOf branch`);
  if (schema.not && schemaErrors(schema.not, value, path).length === 0) errors.push(`${path}: matches not`);
  if (schema.if && schemaErrors(schema.if, value, path).length === 0 && schema.then) errors.push(...schemaErrors(schema.then, value, path));
  return errors;
}
