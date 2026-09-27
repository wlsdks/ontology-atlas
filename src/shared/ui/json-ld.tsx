const HTML_SENSITIVE = /[<>&\u2028\u2029]/gu;

const HTML_ESCAPE: Record<string, string> = {
  '<': '\\u003c',
  '>': '\\u003e',
  '&': '\\u0026',
  '\u2028': '\\u2028',
  '\u2029': '\\u2029',
};

/**
 * Escapes the characters HTML treats as a boundary as JSON unicode escapes, or a `</script>` in
 * the data would close the tag and run what follows.
 */
export function serializeJsonForHtml(value: unknown): string {
  const json = JSON.stringify(value);
  if (json === undefined) {
    throw new TypeError('JsonLd data must be JSON-serializable');
  }
  return json.replace(HTML_SENSITIVE, (character) => HTML_ESCAPE[character]);
}

export interface JsonLdProps {
  data: unknown;
}

/** JSON-LD surface that guards the HTML script boundary in one place. */
export function JsonLd({ data }: JsonLdProps) {
  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: serializeJsonForHtml(data) }}
    />
  );
}
