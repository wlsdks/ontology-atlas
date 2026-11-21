import {
  variantRuns,
  variantVariables,
  type CatalogueEntry,
  type CatalogueVariable,
  type CatalogueVariant,
} from '@/shared/config/mcp/mcp-catalogue';
import type { ConnectorRecord } from '@/shared/lib/connectors/connector-record';

import type { SecretToStore } from './connector-draft';

export function requiredVariables(variant: CatalogueVariant): readonly CatalogueVariable[] {
  return variantVariables(variant).filter((variable) => variable.required);
}

/**
 * The first hosted address, else the first local program: a hosted address asks nothing, so a
 * single press lands there when the vendor offers both.
 */
export function primaryVariant(entry: CatalogueEntry): CatalogueVariant {
  return entry.variants.find((variant) => variant.kind === 'remote') ?? entry.variants[0];
}

export function variantKey(variant: CatalogueVariant): string {
  return variantRuns(variant);
}

export type PressOutcome = 'attaches' | 'asks';
export function pressOutcome(entry: CatalogueEntry, variant: CatalogueVariant): PressOutcome {
  return variant === primaryVariant(entry) && requiredVariables(variant).length === 0
    ? 'attaches'
    : 'asks';
}

export function secretsFromAnswers(
  record: ConnectorRecord,
  values: Record<string, string>,
): SecretToStore[] {
  const secrets = record.transport === 'http' ? record.headers : record.env;
  return secrets.flatMap((item) =>
    typeof item.secretRef === 'string' && values[item.name]?.trim()
      ? [{ ref: item.secretRef, value: values[item.name].trim() }]
      : [],
  );
}
