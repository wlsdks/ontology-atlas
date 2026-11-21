// The values a backlink update may report: a string, an array of strings, or a
// flat string map (`relation_notes`, whose rationale follows a rename). Nesting
// is still rejected: widened, not loosened, since a gate that fires on correct
// behaviour gets switched off.

/** Is the value a clean string — leading/trailing whitespace, empty strings, and NULs are rejected. */
function isCleanNonBlankString(value) {
  return (
    typeof value === 'string'
    && value.length > 0
    && value.trim() === value
    && !value.includes('\u0000')
  );
}

/**
 * A relation slot is a scalar reference (`domain:`), an array (`dependencies:`)
 * or a rationale map (`relation_notes:`); all three are valid key-change values.
 */
export function isBacklinkKeyValue(value) {
  if (isCleanNonBlankString(value)) return true;
  if (Array.isArray(value)) {
    return value.length > 0 && value.every((item) => isCleanNonBlankString(item));
  }
  if (value && typeof value === 'object') {
    // Flat maps only: a nested value is a shape this screen cannot explain.
    const entries = Object.entries(value);
    return entries.length > 0 && entries.every(
      ([key, entry]) => isCleanNonBlankString(key) && isCleanNonBlankString(entry),
    );
  }
  return false;
}
