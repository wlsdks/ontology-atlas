const HTML_SENSITIVE = /[<>&\u2028\u2029]/gu;

const HTML_ESCAPE: Record<string, string> = {
  '<': '\\u003c',
  '>': '\\u003e',
  '&': '\\u0026',
  '\u2028': '\\u2028',
  '\u2029': '\\u2029',
};

/**
 * JSON을 HTML의 raw-text `<script>` 안에 넣을 수 있는 문자열로 만든다.
 *
 * `JSON.stringify`만 쓰면 데이터의 `</script>`가 태그를 닫고 다음 HTML을
 * 실행 가능한 형제로 만들 수 있다. JSON 문자열의 의미는 그대로 두고 HTML이
 * 경계로 해석하는 문자만 JSON 유니코드 escape로 바꾼다.
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

/** HTML script 경계를 중앙에서 지키는 JSON-LD 표면. */
export function JsonLd({ data }: JsonLdProps) {
  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: serializeJsonForHtml(data) }}
    />
  );
}
