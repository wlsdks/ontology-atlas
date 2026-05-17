import { VAULT_KINDS } from './schema.mjs';
import { formatAllowedValueError } from './suggestions.mjs';

export const READABLE_KIND_VALUES = Object.freeze([...VAULT_KINDS, 'vault-readme']);

export function validateKindValue(name, value, allowedValues = READABLE_KIND_VALUES) {
  if (value && !allowedValues.includes(value)) {
    return formatAllowedValueError(name, value, allowedValues);
  }
  return null;
}

export function validateKindList(name, values, allowedValues = READABLE_KIND_VALUES) {
  for (const value of values) {
    const error = validateKindValue(`${name} items`, value, allowedValues);
    if (error) return error;
  }
  return null;
}
