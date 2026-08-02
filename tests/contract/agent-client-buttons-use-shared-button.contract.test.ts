import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * 도구 연결 버튼 열은 **프리미티브를 통과한다** (2026-08-02, 디자인 카운슬 S3).
 *
 * ## 무엇이 있었나 (전수 실측)
 *
 * `src/shared/ui/button.tsx` 에 `variant: primary | ghost | outline` cva 가
 * 이미 있고 `primary` 는 불투명 `--color-indigo-brand`(#5e6ad2)를 쓴다. 그런데
 * `AgentClientButtons` 는 그걸 안 쓰고 **자체 재구현**에 반투명
 * `--color-indigo-a24` 워시를 썼다. 그 워시는 24건/19파일인데 `Button`
 * 프리미티브를 거친 곳은 **0건**이었다 — 규격이 있는데 아무도 안 쓰면 그건
 * 규격이 아니라 문서다.
 *
 * 같은 재구현이 **focus-visible 링도 빠뜨렸다**: 이 화면 버튼들만
 * `focus-visible:ring` 이 하나도 없어 브라우저 기본
 * `outline: rgb(208,214,224) auto 1px` 이 떴고, 앱 나머지 아홉 곳 이상은 인디고
 * 링 토큰을 썼다. 프리미티브를 쓰면 그것이 자동으로 따라온다.
 *
 * ## 이 게이트가 잠그는 것
 *
 * 값 lint 는 이 결함을 못 본다 — 재구현이 쓴 것도 전부 정당한 토큰이라 어떤
 * 값 규칙도 안 어긴다. 그리고 **없는 것은 리터럴도 안 남긴다**: 빠진 포커스
 * 링은 하드코딩 검사의 시야 밖이다. 그래서 「어느 토큰을 썼는가」가 아니라
 * 「프리미티브를 통과했는가」를 잰다.
 *
 * 렌더 결과(넷이 같은 무게인지 · 상태 없는 글리프가 없는지)는 자매 단위 테스트
 * `src/features/docs-vault-local/ui/AgentClientButtons.test.tsx` 가 잰다.
 */

const SOURCE = "src/features/docs-vault-local/ui/AgentClientButtons.tsx";
const source = readFileSync(SOURCE, "utf8");

/**
 * 주석을 뺀 본문. **왜 필요한가**: 이 파일의 주석이 «무엇을 없앴는지» 를 그
 * 토큰 이름으로 적고 있어서, 안 지운 채로 재면 «치웠다는 기록» 이 «위반» 으로
 * 읽힌다. 값 게이트가 산문을 재면 다음 사람은 설명을 지우는 것으로 통과한다.
 */
const code = source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

describe("AgentClientButtons 는 shared/ui/button 을 통과한다", () => {
  it("imports the shared button primitive", () => {
    expect(source).toMatch(/from ["']@\/shared\/ui\/button["']/);
    expect(source).toMatch(/\bbuttonVariants\b/);
  });

  it("no longer declares the bespoke ClientButton reimplementation", () => {
    expect(code).not.toMatch(/function\s+ClientButton\b/);
    expect(code).not.toMatch(/<ClientButton\b/);
  });

  it("carries no translucent indigo wash imitating the primitive's filled variant", () => {
    // 실제 결함은 이름이 아니라 이 값이다 — 이름만 바뀌고 워시가 남으면
    // 위 검사는 통과하는데 화면은 그대로다.
    expect(code).not.toContain("--color-indigo-a24");
    expect(code).not.toContain("--color-indigo-a32");
  });

  it("gets the app's focus ring from the primitive rather than the browser default", () => {
    const primitive = readFileSync("src/shared/ui/button.tsx", "utf8");
    expect(primitive).toContain("focus-visible:ring-2");
    expect(primitive).toContain("--color-indigo-accent");
    // 소비처가 자기 포커스 스타일을 다시 쓰면 프리미티브를 통과한 의미가 없다.
    expect(code).not.toContain("focus-visible:outline-none");
  });
});
