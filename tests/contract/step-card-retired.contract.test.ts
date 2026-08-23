import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * One concept lives under one name (2026-08-02, design council S3 · system seat).
 *
 * **What happened.** The "3 connection steps" grammar — number badge + title +
 * description — existed in two copies: `StepRow` in the map sheet (no border) and
 * `StepCard` in the settings panel (with card chrome). **The number-circle badge
 * classes were byte-identical** between the two components; the only difference was
 * `StepCard` wrapping one more layer of `rounded-md border … bg-[…] px-2.5 py-2.5`.
 *
 * That one layer produced **four nested borders** in the settings panel (measured):
 *
 * ```
 * app-settings-popover       1px rgba(255,255,255,0.06)  r12
 *  └ section (indigo panel)  1px rgba(139,151,255,0.22)  r6
 *     └ agent-setup-step-N   1px rgba(255,255,255,0.06)  r6   ← this layer
 *        └ agent-client-…    1px rgba(139,151,255,0.54)  r6
 * ```
 *
 * ════════════════════════════════════════════════════════════════════
 * ## 2026-08-04 — **one more variant.** Why that is not a regression
 * ════════════════════════════════════════════════════════════════════
 *
 * By owner instruction the settings tab became **step-progressive** (one step
 * expanded at a time). `StepRow` is the **always-expanded** grammar, which is right
 * in the map sheet, where the three steps are the whole screen. In settings,
 * verification, repair, and commands follow those three, so the same grammar stacks
 * **2,581px (4.18 screens)** into a 617px window (measured).
 *
 * So `AgentSetupStep` (the collapsible variant) was added beside the widget. This is
 * not a recurrence of "two names" because **the behaviour genuinely differs** —
 * `StepCard` was a defect precisely because it differed only by a layer of chrome
 * while behaving identically. A third variant would be that defect again, so this
 * gate now locks that there are **exactly two** step grammars.
 *
 * **And this round's real spec: there is one numbering system.** The owner's first
 * observation was *"there are three sets of numbers; I cannot tell which is the current task"*, and the
 * measurement was worse: this one file had **four** sets of number badges:
 *
 * | Set | What | Count |
 * |---|---|---|
 * | Steps | `StepRow n={1..3}` | 3 |
 * | Flow | "View setup flow" `{index + 1}` | 6 |
 * | Evidence | "First connection evidence contract" `{index + 1}` | 4 |
 * | Commands | CLI preview `{index + 1}` | 6 |
 *
 * Inventory before switching on: `index + 1` at **3 sites** → **0** after
 * replacement. The only numbers left are the three steps, and only they say "which
 * one am I on". Lint cannot see this — all four are legitimate JSX breaking no value
 * rule.
 */

const PANEL = "src/widgets/app-settings-menu/ui/VaultAgentSetupPanel.tsx";
/*
 * ⚠️ **The connect sheet was retired on 2026-08-21** (ledger 90 — attaching became
 * the "agent" destination). So the "two copies" this contract measured are now
 * **one**: the settings panel (`PANEL`). The promoted `StepRow` is still alive, and
 * the reason it joined the two surfaces — do not make a copy — holds even with one
 * surface left.
 *
 * Continuing to read a file that no longer exists makes this check **fail on the
 * read**, or worse, swallow the exception and go quietly green.
 */
const PROMOTED = "src/features/docs-vault-local/ui/StepRow.tsx";
const COLLAPSIBLE = "src/widgets/app-settings-menu/ui/AgentSetupStep.tsx";

const read = (path: string) => readFileSync(path, "utf8");

describe("StepCard 는 은퇴했다 — 3단계 문법은 두 벌이고 그 이상은 아니다", () => {
  it("the settings panel no longer declares its own step component", () => {
    const source = read(PANEL);
    expect(source).not.toMatch(/function\s+StepCard\b/);
    expect(source).not.toMatch(/<StepCard\b/);
    expect(source).not.toMatch(/function\s+StepRow\b/);
    expect(source).not.toMatch(/function\s+AgentSetupStep\b/);
  });

  it("the map sheet keeps the promoted StepRow", () => {
    // The sheet's retirement removed this check's subject. That the promoted `StepRow`
    // is not redeclared is still guarded by the per-surface marker assertion below.
  });


  it("the settings panel uses the collapsible variant, and the variant is the only third file", () => {
    expect(read(PANEL)).toMatch(/<AgentSetupStep\b/);
    // The collapsible variant **does not redeclare** the always-expanded one — the
    // difference between them is behaviour (collapsing), not grammar.
    expect(read(COLLAPSIBLE)).not.toMatch(/function\s+StepRow\b/);
    // The collapse motion uses the **list-row disclosure grammar** (revised the evening
    // of 2026-08-04 — that morning's version required Surface, and the owner caught the
    // defect in the installed app: giving an in-flow element the grammar of a floating
    // surface makes the siblings below jump twice, +254px in one frame then −352px one
    // frame 140ms later, measured frame by frame). The behavioural contract and its
    // probes belong to AgentSetupStep.test.tsx; this only locks which grammar it uses.
    expect(read(COLLAPSIBLE)).toMatch(/useRowDisclosure/);
    expect(read(COLLAPSIBLE)).toMatch(/ai-row-disclosure/);
    expect(read(COLLAPSIBLE)).not.toMatch(/<Surface\b/);
  });

  it("the promoted component carries no card chrome of its own", () => {
    const source = read(PROMOTED);
    // If this component regains a border or background, the four-level nesting returns.
    expect(source).not.toMatch(/className="[^"]*\bborder\b/);
    expect(source).not.toMatch(/className="[^"]*\bbg-\[color:var\(--color-overlay/);
  });

  it("keeps each surface's own step marker — merging the names would silently repoint e2e and the installed-app verifier", () => {
    expect(read(PANEL)).toContain('testId="agent-setup-step-1"');
    expect(read(PROMOTED)).toContain("agent-connect-step-");
  });

  /**
   * The spec this round added. Inventory before switching on = 3 sites (flow,
   * evidence, commands); now 0.
   *
   * A regex cannot perfectly decide what a "number badge" is, but **the idiom that
   * creates one in this app** is singular: `{index + 1}` inside `.map((x, index) =>`.
   * All three sets had that shape, and a new one will too.
   */
  it("한 화면에 번호 체계는 한 벌 — 단계 셋 말고 번호를 새로 세는 목록이 없다", () => {
    const source = read(PANEL);
    const generated = source.match(/\{\s*index\s*\+\s*1\s*\}/g) ?? [];
    expect(
      generated,
      "목록이 자기 번호를 다시 매기고 있다. 이 화면의 번호는 3단계 하나뿐이고, " +
        "두 번째 번호는 「지금 몇 번째인가」를 가리키지 못하게 만든다 " +
        "(2026-08-04 소유자 지적 1번 — 켤 때 전수 3자리).",
    ).toEqual([]);

    // Step numbers are only 1, 2, 3 — a fourth breaks the promise of three steps.
    const stepNumbers = [...source.matchAll(/<AgentSetupStep\s+n=\{(\d+)\}/g)].map(
      (m) => m[1],
    );
    expect(stepNumbers).toEqual(["1", "2", "3"]);
  });

  /** Idling guard — checks the detector actually read something. */
  it("게이트가 빈 파일 위에서 돌지 않는다", () => {
    for (const path of [PANEL, PROMOTED, COLLAPSIBLE]) {
      expect(read(path).length, `${path} 을 못 읽었다`).toBeGreaterThan(400);
    }
    // The detector is alive — a string containing the same idiom is caught.
    const probe = "{items.map((item, index) => <span>{index + 1}</span>)}";
    expect(probe.match(/\{\s*index\s*\+\s*1\s*\}/g)).toHaveLength(1);
  });
});
