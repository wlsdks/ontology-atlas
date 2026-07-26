/**
 * 본문 첫 헤딩이 페이지 제목과 같으면 떼어낸다.
 *
 * vault 의 `.md` 는 대개 `# 프로젝트명` 으로 시작한다 — 파일 단독으로 읽힐 때는
 * 옳다. 그런데 상세 화면은 그 이름을 이미 히어로에 27px 로 걸어 두므로, 본문
 * 맨 위에 같은 문장이 한 번 더 나온다. 같은 정보를 두 번 그리는 잉크는
 * 지운다 (Tufte).
 *
 * **첫 헤딩 하나만** 본다. 본문 중간의 같은 이름 헤딩은 그 자리에서 뜻이 있는
 * 구획이므로 건드리지 않는다.
 */
export function stripDuplicateHeading(
  body: string | null | undefined,
  title: string | null | undefined,
): string | null {
  if (!body) return body ?? null;
  const wanted = String(title ?? "").trim();
  if (!wanted) return body;

  const lines = body.split("\n");
  // 앞쪽 빈 줄은 건너뛴다 — 파일이 개행으로 시작하는 경우가 흔하다.
  let index = 0;
  while (index < lines.length && lines[index]!.trim() === "") index += 1;
  if (index >= lines.length) return body;

  const heading = lines[index]!.match(/^#{1,2}\s+(.*)$/);
  if (!heading || heading[1]!.trim() !== wanted) return body;

  // 헤딩과 그 뒤 빈 줄까지 걷어내야 본문이 카드 위에서 뜨지 않는다.
  let after = index + 1;
  while (after < lines.length && lines[after]!.trim() === "") after += 1;
  return lines.slice(after).join("\n");
}
