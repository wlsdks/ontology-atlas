import { test, type Page, type ConsoleMessage } from "@playwright/test";
import { mkdir } from "node:fs/promises";
import path from "node:path";

/**
 * 심층 audit. 각 라우트에서:
 *  - HTTP status
 *  - 콘솔 에러·경고 / pageerror
 *  - 네트워크 실패 (Firestore abort는 제외)
 *  - 주요 heading 텍스트 → 페이지가 실제로 기대된 콘텐츠를 렌더하는지
 *  - 상호작용 키 단축키 (Cmd+K, ?, F) 응답 (해당되는 경우)
 */

const OUT = path.resolve("output/ui-audit/deep");
const LOG = "[DEEP]";

interface Route {
  name: string;
  url: string;
  wait?: number;
  mustContain?: string[]; // 최소 한 번 보여야 하는 텍스트 신호
  mustNotContain?: string[];
}

const ROUTES: Route[] = [
  { name: "01-root", url: "/", wait: 1500 },
  {
    name: "02-login",
    url: "/login",
    wait: 800,
    mustContain: ["로그인", "Google로 로그인"],
  },
  {
    name: "03-signup",
    url: "/signup",
    wait: 800,
    mustContain: ["계정 만들기", "Google로 바로 가입"],
  },
  {
    name: "04-reset-password",
    url: "/reset-password",
    wait: 600,
    mustContain: ["비밀번호 재설정"],
  },
  {
    name: "05-account",
    url: "/account",
    wait: 800,
  },
  {
    name: "06-projects-list",
    url: "/projects/",
    wait: 1200,
  },
  {
    name: "07-project-detail-public",
    url: "/project/aslan-maps/",
    wait: 1500,
    mustContain: ["Aslan Maps"],
    mustNotContain: ["문서가 프로젝트 구조가 됩니다"],
  },
  {
    name: "08-project-view-legacy",
    url: "/project/view/?slug=aslan-maps",
    wait: 1500,
  },
  {
    name: "09-project-internal-topology",
    url: "/project/topology/?slug=aslan-maps",
    wait: 1500,
  },
  {
    name: "10-admin-gate",
    url: "/admin/dashboard/",
    wait: 800,
    mustContain: ["내 공간", "로그인"],
  },
  {
    name: "11-admin-knowledge-gate",
    url: "/admin/knowledge/",
    wait: 800,
    mustContain: ["내 공간"],
  },
  {
    name: "12-admin-login",
    url: "/admin/",
    wait: 800,
    mustContain: ["내 공간 로그인"],
  },
];

interface Finding {
  route: string;
  kind: "console-error" | "page-error" | "req-fail" | "missing-text" | "forbidden-text";
  detail: string;
}

async function snap(page: Page, name: string) {
  await page.screenshot({
    path: path.join(OUT, `${name}.png`),
    fullPage: false,
  });
}

test.beforeAll(async () => {
  await mkdir(OUT, { recursive: true });
});

test("라우트 순회 심층 점검", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  const findings: Finding[] = [];

  page.on("pageerror", (err) => {
    findings.push({
      route: "(pre-route)",
      kind: "page-error",
      detail: err.message,
    });
  });

  for (const r of ROUTES) {
    const errors: string[] = [];
    const warnings: string[] = [];
    const reqFails: string[] = [];

    const consoleHandler = (msg: ConsoleMessage) => {
      if (msg.type() === "error") errors.push(msg.text());
      if (msg.type() === "warning") warnings.push(msg.text());
    };
    const reqFailHandler = (req: import("@playwright/test").Request) => {
      const url = req.url();
      // Firestore Listen abort는 페이지 이동 시 정상 — 제외.
      if (url.includes("firestore.googleapis.com")) return;
      reqFails.push(`${req.method()} ${url} :: ${req.failure()?.errorText}`);
    };

    page.on("console", consoleHandler);
    page.on("requestfailed", reqFailHandler);

    try {
      const res = await page.goto(r.url, { waitUntil: "domcontentloaded" });
      await page.waitForTimeout(r.wait ?? 500);
      await snap(page, r.name);

      const status = res?.status();
      console.log(`${LOG} ${r.name} ${r.url} → ${status}`);

      // 텍스트 검증
      const bodyText = await page.textContent("body").catch(() => "");
      if (r.mustContain) {
        for (const needle of r.mustContain) {
          if (!bodyText?.includes(needle)) {
            findings.push({
              route: r.name,
              kind: "missing-text",
              detail: `expected to contain "${needle}"`,
            });
          }
        }
      }
      if (r.mustNotContain) {
        for (const needle of r.mustNotContain) {
          if (bodyText?.includes(needle)) {
            findings.push({
              route: r.name,
              kind: "forbidden-text",
              detail: `body should not contain "${needle}"`,
            });
          }
        }
      }
    } catch (err) {
      findings.push({
        route: r.name,
        kind: "page-error",
        detail: `goto failed: ${(err as Error).message}`,
      });
    } finally {
      page.off("console", consoleHandler);
      page.off("requestfailed", reqFailHandler);
    }

    for (const e of errors) {
      findings.push({ route: r.name, kind: "console-error", detail: e });
    }
    for (const e of reqFails) {
      findings.push({ route: r.name, kind: "req-fail", detail: e });
    }
    if (errors.length > 0 || warnings.length > 0 || reqFails.length > 0) {
      console.log(
        `${LOG}   route=${r.name} err=${errors.length} warn=${warnings.length} reqfail=${reqFails.length}`,
      );
      for (const w of warnings) console.log(`${LOG}     WARN: ${w}`);
    }
  }

  // 최종 리포트
  console.log(`${LOG} === FINDINGS (${findings.length}) ===`);
  for (const f of findings) {
    console.log(`${LOG} [${f.kind}] ${f.route}: ${f.detail}`);
  }
});
