/**
 * 아직 게시되지 않은 릴리스가 **자기를 뭐라고 부를 것인가**.
 *
 * 2026-07-28 QA 실측: `/download` 한 화면에 `v1.0.0-rc.3`(제목)과
 * `v1.0.0-rc.2 는 아직 게시 전입니다`(본문)가 **동시에** 떠 있었다.
 *
 * 원인은 두 출처였다. 제목은 게시 여부로 갈라 미게시면 `RELEASE_VERSION`
 * (= `package.json`)을 쓰는데, 본문은 **게시 여부와 무관하게** 생성 파일
 * (`macos-release.generated.ts`)의 `tag` 를 썼다. 그 생성 파일은 릴리스가
 * 실제로 나갈 때만 갱신되므로, 버전을 올리고 아직 안 내보낸 구간에서는
 * **한 세대 전 태그**가 그대로 남는다.
 *
 * 규칙: **게시된 것만 생성 파일이 말한다.** 아직 안 나간 것의 이름은 지금
 * 저장소가 스스로 아는 값(`RELEASE_VERSION`)에서 나온다 — 그래야 버전을
 * 올리는 것만으로 화면이 따라오고, 두 문장이 갈라질 자리가 없다.
 */
export function resolveDisplayReleaseTag({
  published,
  publishedTag,
  releaseVersion,
}: {
  published: boolean;
  publishedTag: string;
  releaseVersion: string;
}): string {
  return published ? publishedTag : `v${releaseVersion}`;
}
