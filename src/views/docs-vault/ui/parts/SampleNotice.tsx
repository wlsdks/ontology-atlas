import { Download, FolderOpen } from "lucide-react";
import { ICON_SIZE } from "@/shared/ui/icon-size";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { controlClass } from "@/shared/ui";

export interface SampleNoticeProps {
  /** P1b — 게이트는 런타임이 아니라 능력: FSA 지원이면 웹에서도 폴더 열기. */
  canOpenLocalVault: boolean;
  onOpenFolder: () => void;
}

/**
 * 샘플(vault 미선택) 상태에서 "왜 편집이 안 되는지 · 어떻게 켜는지" 를 평문
 * 한 줄로 안내하는 스트립. 아티클 헤더 바로 아래, 본문 전체 폭.
 *
 * 기존 `editorHeader.readOnlySample` 점 칩은 상태 인디케이터로 유지하고,
 * 이 스트립이 그 옆의 설명 + 액션을 담당 — 우상단 작은 칩만으로는 "왜/어떻게"
 * 가 전달되지 않는다는 관찰(po-pass.md §1-3)을 해소한다.
 *
 * 표시 조건(`!isLocalSourceLoaded`)은 caller 가 판단 — 이 컴포넌트는 항상
 * 렌더된 것을 전제로 한 순수 표시. P1b(N1): FSA 를 지원하면 런타임과
 * 무관하게 폴더 열기 흐름을 재사용하고, 미지원 브라우저에서만 macOS 앱
 * 다운로드로 안내한다 — 빌더와 같은 능력 기준 계약.
 */
export function SampleNotice({ canOpenLocalVault, onOpenFolder }: SampleNoticeProps) {
  const t = useTranslations("docsVault");
  return (
    <div
      data-testid="docs-vault-sample-notice"
      /*
       * **이 안내는 볼트의 사실이지 문서의 사실이 아니다** (2026-08-08).
       *
       * 종전엔 자기 띠(전체 폭 · 위아래 여백 · 왼쪽 인디고 레일)로 문서 제목
       * **위에** 앉아 있었다. 실측: 53px 을 먹고, 배포 샘플 볼트의 **112개 문서
       * 전부**에서 같은 문장을 반복하며 본문을 아래로 밀었다.
       *
       * 그런데 이 문장이 말하는 것(「이 볼트는 읽기 전용이다」)은 문서를 바꿔도
       * 안 바뀐다. 그래서 문서 헤더 줄로 들어간다 — 샘플 볼트에서는 그 줄의
       * 오른쪽이 **완전히 비어 있다**(편집 탭과 동기 표시가 둘 다 로컬 볼트
       * 전용이다. 코드와 실측 모두 확인). 세로 픽셀 0으로 같은 말을 한다.
       *
       * **지우지 않는 이유**: 샘플 문서에는 편집 컨트롤이 아예 없어서
       * (실측 0개) 「왜 편집이 안 되나」를 붙일 다른 자리가 없다. 이 줄이 그
       * 이유와 「내 폴더 열기」를 나르는 유일한 자리다 — 그것이 이 부품을 만든
       * 원래 판단(po-pass §1-3)이고 여전히 유효하다. 값만 낮춘다.
       *
       * 브레이크포인트를 새로 만들지 않는다: 헤더 줄이 `flex-wrap` 이라
       * 넓으면 한 줄에 들어가고 좁으면 자기 줄로 떨어진다 — 유지할 모양은
       * 하나이고, 좁은 폭에서도 종전보다 나빠지지 않는다.
       */
      className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1.5"
    >
      <p className="min-w-0 flex-1 text-body leading-body text-[color:var(--color-text-tertiary)]">
        {/*
         * 문서 헤더 줄로 들어오면서 **주목 승자가 둘이 됐다** — 「읽기 전용
         * 샘플이에요」가 문서 제목과 같은 굵기·같은 밝기라 한 줄에서 경쟁했다.
         * 읽는 화면의 주인공은 문서 제목이므로 이 안내를 한 단 낮춘다:
         * 잉크는 secondary(제목은 primary), 설명은 tertiary. 굵기는 남겨서
         * 「상태 라벨」로는 계속 읽힌다 — 낮춘 것은 밝기이고 지운 말은 없다.
         */}
        <span className="font-[var(--font-weight-emphasis)] text-[color:var(--color-text-secondary)]">
          {t("sampleNotice.title")}
        </span>{" "}
        — {t("sampleNotice.body")}
      </p>
      {canOpenLocalVault ? (
        <button
          type="button"
          onClick={onOpenFolder}
          className={controlClass({
            shape: "chip",
            size: "lg",
            active: true,
            className:
              "flex-none font-[var(--font-weight-signature)] hover:border-[color:var(--color-indigo-line-a54)] hover:bg-[color:var(--color-indigo-a24)]",
          })}
        >
          <FolderOpen size={ICON_SIZE.sm} aria-hidden />
          {t("sampleNotice.openFolderCta")}
        </button>
      ) : (
        <Link
          href="/download/"
          className={controlClass({ shape: "chip", className: "flex-none border-[color:var(--color-indigo-line-a42)] bg-[color:var(--color-indigo-a12)] px-2.5 py-1.5 font-mono text-label text-[color:var(--color-text-primary)] hover:border-[color:var(--color-indigo-line-a54)] hover:bg-[color:var(--color-indigo-a18)]" })}
        >
          <Download size={ICON_SIZE.sm} aria-hidden />
          {t("vaultStatus.downloadAppCta")}
        </Link>
      )}
    </div>
  );
}
