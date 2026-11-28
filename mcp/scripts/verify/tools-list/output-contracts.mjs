import { readFileSync } from 'node:fs';

/**
 * The full result contract of each tool, as recorded from the script server before it was deleted
 * (`output-contracts.json`). `tools/list` advertises each one cut to its top level, so this is
 * what the nested checks in this folder read, and what the advertised form is compared with.
 */
const OUTPUT_CONTRACT_BY_NAME = new Map(Object.entries(
  JSON.parse(readFileSync(new URL('./output-contracts.json', import.meta.url), 'utf8')),
));

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

/**
 * The form a tool advertises: its contract cut to the top level. The root keeps its type,
 * `required` and `additionalProperties`; each property keeps only its type, so every result that
 * satisfies the contract also satisfies what a host validates `structuredContent` against.
 */
function advertisedForm(contract) {
  if (!isObject(contract?.properties)) return contract;
  return {
    type: 'object',
    properties: Object.fromEntries(Object.entries(contract.properties)
      .map(([name, child]) => [name, shallowProperty(name, child)])),
    ...(Array.isArray(contract.required) ? { required: contract.required } : {}),
    ...(contract.additionalProperties === false ? { additionalProperties: false } : {}),
  };
}

/**
 * Names the first listed tool whose advertised schema is not exactly the cut of its contract.
 */
export function advertisedOutputSchemaFailure(tools) {
  for (const tool of tools) {
    const contract = OUTPUT_CONTRACT_BY_NAME.get(tool?.name);
    const expected = contract ? advertisedForm(contract) : undefined;
    if (JSON.stringify(tool?.outputSchema) !== JSON.stringify(expected)) {
      return `${tool?.name || '(unknown)'}.outputSchema is not the advertised form of its output contract`;
    }
  }
  return null;
}

/** The listed tools with each advertised output schema replaced by its full contract. */
export function withOutputContracts(tools) {
  return tools.map((tool) => (tool?.outputSchema ? { ...tool, outputSchema: OUTPUT_CONTRACT_BY_NAME.get(tool.name) } : tool));
}
