import { parseBoundedPositiveIntegerFlag, parseCsvListFlag } from './cli-args.mjs';

export const DIAGNOSIS_OPTION_FLAGS = [
  '--component-limit',
  '--cycle-limit',
  '--recommendation-limit',
  '--order-limit',
  '--node-limit',
  '--dependency-types',
  '--component-types',
];

const LIMIT_OPTIONS = {
  '--component-limit': 'componentLimit',
  '--cycle-limit': 'cycleLimit',
  '--recommendation-limit': 'recommendationLimit',
  '--order-limit': 'orderLimit',
  '--node-limit': 'nodeLimit',
};

const TYPE_OPTIONS = {
  '--dependency-types': 'dependencyTypes',
  '--component-types': 'componentTypes',
};

export function parseDiagnosisOption(options, flag, value) {
  if (Object.hasOwn(LIMIT_OPTIONS, flag)) {
    const parsed = parseBoundedPositiveIntegerFlag(flag, value, { max: 500 });
    if (parsed instanceof Error) return parsed;
    options[LIMIT_OPTIONS[flag]] = parsed;
    return null;
  }

  if (Object.hasOwn(TYPE_OPTIONS, flag)) {
    const parsed = parseRelationTypeListFlag(flag, value);
    if (parsed instanceof Error) return parsed;
    options[TYPE_OPTIONS[flag]] = parsed;
    return null;
  }

  return new Error(`unsupported diagnosis option: ${flag}`);
}

function parseRelationTypeListFlag(flag, value) {
  return parseCsvListFlag(flag, value, { itemName: 'relation type' });
}
