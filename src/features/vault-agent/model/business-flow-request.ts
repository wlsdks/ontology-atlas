/**
 * The product-owned request for a business narrative, with rules against unsupported
 * exclusions and dropped scope qualifiers. It asks for no source reads and no saved result,
 * so the narrative stays checkable against the vault.
 */

/** Short enough to read before pressing; guards the localized string, not user input. */
const MAX_CHARS = 1200;

export interface BusinessFlowRequestLabels {
  /** Localized body. The app writes the sentence; the model does not. */
  readonly request: string;
}

/** The request, length-checked; it names no folder path, since the agent starts in the vault. */
export function buildBusinessFlowRequest(labels: BusinessFlowRequestLabels): string {
  const trimmed = labels.request.trim();
  if (trimmed.length <= MAX_CHARS) return trimmed;
  // Report overflow rather than cut a rule mid-sentence.
  throw new Error(
    `Business flow request is ${trimmed.length} characters, over the ${MAX_CHARS} a person will read before pressing.`,
  );
}
