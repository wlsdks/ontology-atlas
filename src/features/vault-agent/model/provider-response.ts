import type { NormalizedResponse } from './provider-adapter';

export function isResponseObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

export function readResponseObject(body: string): Record<string, unknown> | null {
  try {
    const value: unknown = JSON.parse(body);
    return isResponseObject(value) ? value : null;
  } catch {
    return null;
  }
}

export function invalidProviderResponse(path: string): NormalizedResponse {
  return {
    text: '',
    toolCalls: [],
    stop: 'error',
    raw: null,
    errorMessage: `invalid-provider-response: ${path}`,
  };
}
