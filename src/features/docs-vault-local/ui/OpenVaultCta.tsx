"use client";

import { FolderOpen } from "lucide-react";
import { useTranslations } from "next-intl";

import { Link } from "@/i18n/navigation";
import { controlClass } from "@/shared/ui";
import { ICON_SIZE } from "@/shared/ui/icon-size";

import { useLocalVault } from "../model/LocalVaultProvider";

/**
 * 「내 폴더를 열면 …」이라고 **말한 자리에서** 그 폴더를 여는 길.
 *
 * ## 왜 부품 하나로 만들었나 (2026-08-07 사용성 감사)
 *
 * 감사 대상 17개 라우트를 볼트 없는 상태로 전수 측정하니, 그 문장을 그리면서
 * 그 상자 안에 폴더를 여는 길이 **0개**인 자리가 셋이었다 — 인사이트의 읽기
 * 전용 묶음 머리, 프로젝트 상세의 「보기 전용」 배지, 그리고 관문. 이건 이미
 * 이름이 붙은 실패형이다(**막다른 CTA**: 화면에서 가장 눈에 띄는 것이 아무
 * 데도 없는 곳으로 보낸다).
 *
 * 2026-08-06 에 `/project/new` 에서 같은 병을 한 번 고쳤는데, **그 처방이
 * 라우트 하나에만 손으로 박혀 있어서** 나머지가 살아남았다. 그래서 이번에는
 * 처방을 부품으로 만든다 — 다음에 「폴더를 열면」이라고 쓰는 사람이 옆에 이걸
 * 놓기만 하면 된다.
 *
 * ## ⚠️ 갈 곳을 `/` 로 두면 웹에서 **또 막다른 길**이다
 *
 * 종전 처방은 `<Link href="/">` 였다. 실측하니 그 링크는 웹에서 자기도 막다른
 * 길이었다 — 볼트를 안 고른 웹 방문자에게 `/` 는 **관문**(내려받기 화면)이고,
 * 거기 폴더를 여는 컨트롤은 **0개**다(`isGatewaySurface()`, 2026-07-30 결정).
 * 설치된 앱에서는 `/` 가 지도라서 맞았고, 그래서 앱에서만 검증하면 안 보인다.
 *
 * 그래서 이 부품은 **주소로 보내지 않고 그 자리에서 연다.** 폴더 선택기는
 * 사용자 제스처가 있어야 열리는데 버튼 클릭이 바로 그 제스처이고, 열고 나면
 * 사람이 읽던 화면이 그대로 자기 데이터로 채워진다 — 한 번도 화면을 잃지
 * 않는다.
 *
 * ## 능력으로 가른다, 런타임으로 가르지 않는다
 *
 * FSA(브라우저가 로컬 폴더를 열게 해 주는 API)를 지원하면 웹에서도 연다 —
 * 이 저장소가 이미 정한 계약이다(`isDocsVaultLocalSourceDisabled`: *"게이트는
 * 능력만 본다"*). 미지원(Firefox 등)일 때만 앱 내려받기로 보낸다. 「곧 됩니다」
 * 는 쓰지 않는다(`surfaces.md`).
 */
export interface OpenVaultCtaProps {
  /** 이 자리를 재는 게이트가 찾을 이름. 자리마다 다르게 준다. */
  testId: string;
  className?: string;
}

/**
 * ⚠️ **크기를 고를 수 있게 두지 않는다.** 처음엔 좁은 자리를 위해 `sm` 을
 * 열어 뒀는데, 재 보니 그게 **9.5px 글자 · 높이 24px** 이라 바로 옆 라벨
 * (`text-label` 11px)보다 작았다. 이 저장소는 그 모양을 이미 결함으로
 * 기록해 뒀다 — 2026-08-02 설정 시트에서 «접힌 세부 항목에서 태어난 부품이
 * 그 절의 주 컨트롤 자리로 올라가며 치수를 안 들고 왔다»가 정확히 이것이고,
 * 결과는 «눌리는 것이 자기 라벨보다 작은» 위계 뒤집힘이었다(`design.md`).
 * 세 자리 모두 `md` 하나로 간다 — 고를 항목을 하나 늘리는 대신 규격을 지킨다.
 */
const CTA_SIZE = "md" as const;

export function OpenVaultCta({ testId, className }: OpenVaultCtaProps) {
  const t = useTranslations("openVaultCta");
  const vault = useLocalVault();
  // 능력 판정의 단일 출처는 `status` 다 — 런타임을 다시 묻지 않는다.
  const unsupported = vault.status === "unsupported";
  const busy = vault.status === "opening";

  if (unsupported) {
    return (
      <Link
        href="/download/"
        data-testid={testId}
        data-open-vault-cta="download"
        className={controlClass({ shape: "chip", size: CTA_SIZE, className })}
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
      className={controlClass({ shape: "chip", size: CTA_SIZE, className })}
    >
      <FolderOpen size={ICON_SIZE.sm} aria-hidden />
      {busy ? t("busyLabel") : t("label")}
    </button>
  );
}
