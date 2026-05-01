import { test, expect } from "@playwright/test";

/**
 * 로컬 볼트 picker 회귀 차단.
 *
 * `showDirectoryPicker` 는 브라우저 native API 라 헤드리스에서 열 수 없으므로
 * `addInitScript` 로 가짜 `FileSystemDirectoryHandle` 을 주입한다. 가짜 핸들은
 * 단일 .md 파일 (sample.md) 을 가진 폴더를 흉내낸다.
 *
 * 검증 흐름:
 *  1. `/docs/` 의 source 토글을 'local' 로 미리 설정 (localStorage seed).
 *  2. 폴더 열기 버튼이 보인다.
 *  3. 클릭 → mock 핸들이 반환되며 buildLocalManifest 가 1 문서를 빌드.
 *  4. loaded 헤더가 vault 이름 (TestVault) + "1 문서" 배지를 보인다.
 *
 * 실행: 별도 dev server (`next dev -p 3100`) 가 떠 있어야 함.
 *   pnpm exec playwright test tests/e2e/local-vault-picker.spec.ts
 */

const MOCK_PICKER_SCRIPT = `
  (() => {
    const fileHandle = {
      kind: 'file',
      name: 'sample.md',
      queryPermission: async () => 'granted',
      requestPermission: async () => 'granted',
      getFile: async () => ({
        text: async () => '---\\ntitle: Sample Doc\\n---\\n\\n# Sample Doc\\n\\n로컬 볼트 e2e mock 의 본문.',
        lastModified: 1700000000000,
      }),
    };
    const root = {
      kind: 'directory',
      name: 'TestVault',
      queryPermission: async () => 'granted',
      requestPermission: async () => 'granted',
      entries: async function*() {
        yield ['sample.md', fileHandle];
      },
      getFileHandle: async () => fileHandle,
    };
    window.showDirectoryPicker = async () => root;
  })();
`;

const PRESET_LOCAL_SOURCE = `
  try { window.localStorage.setItem('demo:docs-vault:source', 'local'); }
  catch (_) { /* private mode */ }
`;

const REMOVE_SHOW_DIRECTORY_PICKER = `
  try { delete window.showDirectoryPicker; } catch (_) { /* ignore */ }
`;

test.describe("로컬 볼트 picker", () => {
  test("폴더 선택 후 매니페스트가 빌드되어 문서 1개 표시", async ({ page }) => {
    await page.addInitScript(MOCK_PICKER_SCRIPT);
    await page.addInitScript(PRESET_LOCAL_SOURCE);

    await page.goto("/docs/");

    const openButton = page.getByRole("button", {
      name: /내 PC 의 마크다운 폴더 열기/,
    });
    await expect(openButton).toBeVisible();
    await openButton.click();

    // loaded 헤더 — vault 이름 + 문서 수 배지가 함께 떠야 한다.
    await expect(page.getByText("TestVault")).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText("1 문서")).toBeVisible();
  });

  test("loaded 상태에서 닫기 클릭 시 idle 로 복귀", async ({ page }) => {
    await page.addInitScript(MOCK_PICKER_SCRIPT);
    await page.addInitScript(PRESET_LOCAL_SOURCE);

    await page.goto("/docs/");

    const openButton = page.getByRole("button", {
      name: /내 PC 의 마크다운 폴더 열기/,
    });
    await openButton.click();
    await expect(page.getByText("TestVault")).toBeVisible({ timeout: 15_000 });

    // 닫기 버튼 (aria-label) 클릭 → 다시 idle 의 폴더 열기 버튼이 나타나야.
    await page.getByRole("button", { name: "로컬 볼트 닫기" }).click();
    await expect(openButton).toBeVisible();
    await expect(page.getByText("TestVault")).not.toBeVisible();
  });

  test("File System Access API 미지원 브라우저는 안내 메시지", async ({ page }) => {
    await page.addInitScript(REMOVE_SHOW_DIRECTORY_PICKER);
    await page.addInitScript(PRESET_LOCAL_SOURCE);

    await page.goto("/docs/");

    // unsupported 상태 — Shield 아이콘 + Chrome/Edge/Safari 18.2+ 안내 텍스트.
    await expect(
      page.getByText(
        /이 브라우저는 File System Access API 를 지원하지 않아/,
      ),
    ).toBeVisible({ timeout: 15_000 });
  });
});
