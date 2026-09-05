"use client";

import { FolderOpen } from "lucide-react";
import { useTranslations } from "next-intl";

import { Link } from "@/i18n/navigation";
import { controlClass } from "@/shared/ui";
import { ICON_SIZE } from "@/shared/ui/icon-size";

import { useLocalVault } from "@/entities/vault-session";

/**
 * The way to open the folder **from the very place that mentions it**.
 *
 * **Why it became one component** (usability audit, 2026-08-07). Measuring all 17 audited routes
 * with no vault found three places that wrote that sentence while offering **zero** ways to open a
 * folder in the same box — the insights read-only group heading, the project detail "view only"
 * badge, and the gateway. This failure already has a name: a **dead-end CTA**, where the most
 * prominent thing on screen leads nowhere.
 *
 * The same illness was fixed once on `/project/new` on 2026-08-06, but **that prescription was
 * hand-pinned to one route**, so the others survived. This time the prescription is a component —
 * whoever next writes "when you open your folder" only has to place this beside it.
 *
 * ## ⚠️ Pointing it at `/` is **another dead end on the web**
 *
 * The previous prescription was `<Link href="/">`. Measured, that link was itself a dead end on the
 * web: for a visitor with no vault, `/` is the **gateway** (the download screen), which has **zero**
 * folder-opening controls (`isGatewaySurface()`, decision 2026-07-30). In the installed app `/` is
 * the map, so it was correct there — which is why verifying only in the app hides it.
 *
 * So this component **opens in place rather than navigating**. A folder picker requires a user
 * gesture, and the button click is exactly that gesture; once opened, the screen the person was
 * reading fills with their own data — they never lose the screen.
 *
 * ## Branch on capability, not on runtime
 *
 * With FSA available it opens on the web too — the contract this repository already settled
 * (`isDocsVaultLocalSourceDisabled`: the gate looks only at capability). Only when unsupported
 * (Firefox and the like) does it send the user to the app download. "Coming soon" is not used
 * (`.claude/rules/surfaces.md`).
 */
export interface OpenVaultCtaProps {
  /** The name a gate measuring this slot will look for. Given differently per slot. */
  testId: string;
  /**
   * The value layer's ink, for the one slot where this control is **the region's primary
   * action** (2026-09-05, design council).
   *
   * On the MCP screen with no folder open, the card asked for a folder in neutral ink while the
   * secondary "Get the macOS app" beside it was the only indigo on screen — the attention
   * hierarchy read backwards. Ink is a `controlClass` axis, so it is passed rather than written:
   * the tint that pairs with `accentOnTint` goes through `className`, exactly as the connect
   * panel's own accent chip does.
   */
  tone?: "default" | "accentOnTint";
  className?: string;
}

/**
 * ⚠️ **The size is deliberately not selectable.** `sm` was opened up at first for narrow slots, but
 * measured it is **9.5px text at 24px height** — smaller than the label right beside it
 * (`text-label`, 11px). This repository has already recorded that shape as a defect: the 2026-08-02
 * settings sheet case, where «a part born in a collapsed detail row was promoted to that section's
 * main control without bringing its dimensions», produced exactly this — the hierarchy inversion of
 * «the pressable thing being smaller than its own label» (`.claude/rules/design.md`). All three
 * slots use one `md` — keeping the spec instead of adding one more choice.
 */
const CTA_SIZE = "md" as const;

export function OpenVaultCta({ testId, tone, className }: OpenVaultCtaProps) {
  const t = useTranslations("openVaultCta");
  const vault = useLocalVault();
  // `status` is the single source for the capability verdict — the runtime is not asked again.
  const unsupported = vault.status === "unsupported";
  const busy = vault.status === "opening";
  const ctaClassName = controlClass({
    shape: "chip",
    size: CTA_SIZE,
    tone,
    hoverInk: "strong",
    hoverSurface: "lift",
    hoverBorder: "strong",
    className,
  });

  if (unsupported) {
    return (
      <Link
        href="/download/"
        data-testid={testId}
        data-open-vault-cta="download"
        className={ctaClassName}
      >
        <FolderOpen size={ICON_SIZE.sm} aria-hidden />
        {t("unsupportedLabel")}
      </Link>
    );
  }

  return (
    <button
      type="button"
      data-testid={testId}
      data-open-vault-cta="picker"
      disabled={busy}
      onClick={() => {
        void vault.open();
      }}
      className={ctaClassName}
    >
      <FolderOpen size={ICON_SIZE.sm} aria-hidden />
      {busy ? t("busyLabel") : t("label")}
    </button>
  );
}
