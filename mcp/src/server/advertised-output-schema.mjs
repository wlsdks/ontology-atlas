/**
 * The output schema a tool advertises is its contract cut to the top level:
 * the root keeps its type, `required` and `additionalProperties`, and each
 * property keeps only its type. Nested objects and arrays become open shapes,
 * so every result that satisfies the contract also satisfies the advertised
 * schema a host validates `structuredContent` against. The full contract stays
 * in the tool definition, and the tests check real results against it.
 *
 * A property description survives only where it decides what an agent does
 * next with the result.
 */

const KEPT_DESCRIPTIONS = new Set(['canConfirm']);

function isObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function typeOfValue(value) {
  if (value === null) return 'null';
  if (Array.isArray(value)) return 'array';
  if (Number.isInteger(value)) return 'integer';
  return typeof value;
}

/** The JSON types a property schema admits, or null when it admits any. */
function admittedTypes(schema) {
  if (!isObject(schema)) return null;
  if (schema.type !== undefined) return [schema.type].flat();
  if ('const' in schema) return [typeOfValue(schema.const)];
  if (Array.isArray(schema.enum)) return [...new Set(schema.enum.map(typeOfValue))];
  for (const key of ['anyOf', 'oneOf']) {
    if (!Array.isArray(schema[key])) continue;
    const branches = schema[key].map(admittedTypes);
    if (branches.some((types) => types === null)) return null;
    return [...new Set(branches.flat())];
  }
  return null;
}

function shallowProperty(name, schema) {
  const types = admittedTypes(schema);
  // An integer branch beside a number branch is already a number.
  const merged = types?.includes('number') ? types.filter((type) => type !== 'integer') : types;
  const out = merged ? { type: merged.length === 1 ? merged[0] : merged } : {};
  if (KEPT_DESCRIPTIONS.has(name) && typeof schema?.description === 'string') {
    out.description = schema.description;
  }
  return out;
}

/** The advertised form of a tool's output schema. */
export function advertisedOutputSchema(outputSchema) {
  if (!isObject(outputSchema?.properties)) return outputSchema;
  return {
    type: 'object',
    properties: Object.fromEntries(Object.entries(outputSchema.properties)
      .map(([name, child]) => [name, shallowProperty(name, child)])),
    ...(Array.isArray(outputSchema.required) ? { required: outputSchema.required } : {}),
    ...(outputSchema.additionalProperties === false ? { additionalProperties: false } : {}),
  };
}
