const HTML_SENSITIVE = /[<>&\u2028\u2029]/gu;

const HTML_ESCAPE: Record<string, string> = {
  '<': '\\u003c',
  '>': '\\u003e',
  '&': '\\u0026',
  '\u2028': '\\u2028',
  '\u2029': '\\u2029',
};

/**
 * Serialise JSON into a string safe to embed in an HTML raw-text `<script>`.
 *
 * With plain `JSON.stringify`, a `</script>` inside the data closes the tag and
 * turns the following HTML into an executable sibling. This keeps the JSON string's
 * meaning intact and only rewrites the characters HTML treats as a boundary into
 * JSON unicode escapes.
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
