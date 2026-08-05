"use client";

import { AnimatePresence, motion } from "framer-motion";
import { useTranslations } from "next-intl";
import { FolderOpen, HardDrive, ShieldCheck, Sparkles, X } from "lucide-react";
import { ICON_SIZE } from "@/shared/ui/icon-size";
import { Link } from "@/i18n/navigation";
import { MOTION } from "@/shared/motion";
import { useBodyScrollLock } from "@/shared/lib/use-body-scroll-lock";
import { useDialogFocusTrap } from "@/shared/lib/use-dialog-focus-trap";
import { controlClass } from "@/shared/ui/control-class";
import { IconButton } from "@/shared/ui/controls";

/**
 * 폴더 열기 사전 안내 시트 (2026-07-24 온보딩 라운드) — 첫 실행 카드의
 * 폴더 CTA 가 사전 설명 0으로 OS 폴더 선택창을 직행해, 첫 사용자가
 * "어떤 폴더를 골라야 하나 / 고르면 무슨 일이 생기나 / 파일은 안전한가"
 * 를 모른 채 겁먹고 이탈했다(라이브 답사 실측). OS 창을 띄우기 전에
 * 안심 3줄 + 기존/새로 분기 하나를 보여준다.
 *
 * 모달 골격은 AgentConnectSheet 와 동일 계약 (scrim + 중앙 카드 + 토큰,
 * Esc/scrim 닫기, 카드 클릭 전파 차단).
 */
export interface VaultOpenGuideSheetProps {
  open: boolean;
  onClose: () => void;
  /** "기존 폴더 선택" — 시트를 닫고 OS 폴더 선택창(vault.open())으로. */
  onPickExisting?: () => void;
  /** "빈 폴더로 새로 시작" — 시트를 닫고 vault 생성 플로우(스캐폴드)로. */
  onCreateNew?: () => void;
  /**
   * 진입 검수 E-1 — File System Access API 가 없는 브라우저(Safari·Firefox)
   * 에서 이 시트의 두 버튼은 **누를 수 있는데 아무 일도 일어나지 않는다**.
   * 시트가 닫히고, 왜 안 되는지도 어디로 가야 하는지도 화면에서 사라졌다.
   * true 면 두 CTA 를 걷고 정직한 고지 + macOS 앱 경로로 치환한다 — 눌러야
   * 아는 실패가 아니라 누르기 전에 아는 사실이 된다.
   */
  unsupported?: boolean;
}

const BULLETS = [
  { icon: FolderOpen, key: "bulletAnyFolder" },
  { icon: HardDrive, key: "bulletLocal" },
  { icon: Sparkles, key: "bulletStarter" },
  // 소유자 실사용 지적 (2026-07-24) — 폴더 선택 직후 브라우저의 표준
  // 허용 확인창("이 사이트에서 파일을 보고…")을 예고하지 않아 처음 보면
  // 우리 팝업/이상 동작으로 오인했다. 미리 한 줄로 안심시킨다.
  { icon: ShieldCheck, key: "bulletPermission" },
] as const;

export function VaultOpenGuideSheet({
  open,
  onClose,
  onPickExisting,
  onCreateNew,
  unsupported = false,
}: VaultOpenGuideSheetProps) {
  const t = useTranslations("vaultOpenGuide");
  // 미지원 고지 문구는 첫 실행 카드가 이미 갖고 있다 — 같은 사실을 두 벌로
  // 쓰면 한쪽만 고쳐지는 drift 가 난다. 카드와 이 시트가 같은 키를 읽는다
  // (`FirstRunStarterModule` 이 용어사전을 `searchWidgets` 에서 읽는 것과
  // 같은 재사용 패턴).
  const tUnsupported = useTranslations("firstRunStarter");
  useBodyScrollLock(open);
  const dialogRef = useDialogFocusTrap<HTMLElement>({
    open,
    onEscape: onClose,
  });

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          data-interactive-overlay="true"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={MOTION.base}
          className="pointer-events-auto fixed inset-0 z-50 flex items-center justify-center bg-[color:var(--color-backdrop-medium)] p-4 sm:p-6"
          onClick={onClose}
          data-testid="vault-guide-scrim"
        >
          <motion.section
            ref={dialogRef}
            tabIndex={-1}
            initial={{ opacity: 0, y: 12, scale: 0.985 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 12, scale: 0.985 }}
            transition={MOTION.base}
            onClick={(event) => event.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-label={t("title")}
            data-testid="vault-guide-sheet"
            // 열릴 때 이 컨테이너로 포커스를 옮긴다(스크린리더가 제목부터 읽게).
            // 그 포커스는 **알리는 용도**이지 누를 수 있다는 표시가 아니므로 링을
            // 지운다 — 안 지우면 브라우저 기본 포커스 링(시스템 하늘색)이 그려져,
            // 앱 첫 화면에서 가장 먼저 보이는 모달 둘레에 인디고 아닌 색이 얹힌다
            // (2026-08-04 감사 실측: 앱·웹 양쪽 재현. 게이트는
            //  tests/e2e/dialog-focus-ring.spec.ts).
            className="flex w-full max-w-[420px] flex-col overflow-hidden rounded-sheet border border-[color:var(--color-divider)] bg-[color:var(--color-panel)] shadow-[var(--shadow-elevation-3)] focus-visible:outline-none"
          >
            <header className="flex shrink-0 items-start justify-between gap-3 border-b border-[color:var(--color-border-soft)] px-5 py-4">
              <div>
                <h2 className="text-body-lg font-[var(--font-weight-strong)] text-[color:var(--color-text-primary)]">
                  {t("title")}
                </h2>
                <p className="mt-1 text-label leading-relaxed text-[color:var(--color-text-tertiary)]">
                  {/* 미지원 브라우저에서 "OS 폴더 선택창이 뜨기 전에" 는 오지
                      않을 창을 약속하는 문장이다 — 그 자리에 왜 안 되는지를
                      넣는다. */}
                  {unsupported ? tUnsupported("unsupportedNotice") : t("subtitle")}
                </p>
              </div>
              <IconButton
                label={t("actionCancel")}
                onClick={onClose}
                data-testid="vault-guide-close"
                size="sm"
                tone="muted"
                className="hover:text-[color:var(--color-text-primary)]"
              >
                <X size={ICON_SIZE.md} aria-hidden />
              </IconButton>
            </header>

            {/* 미지원일 때 4개 불릿은 전부 브라우저 픽커 흐름의 설명이라
                (허용 프롬프트·빈 폴더 스캐폴드) 그대로 두면 오지 않을 절차를
                가르친다. 고지 한 줄 + 갈 곳 하나로 줄인다. */}
            <ul hidden={unsupported} className="flex flex-col gap-2.5 px-5 py-4">
              {BULLETS.map(({ icon: Icon, key }) => (
                <li key={key} className="flex items-start gap-2.5">
                  <Icon
                    size={14}
                    aria-hidden
                    className="mt-0.5 shrink-0 text-[color:var(--color-indigo-accent)]"
                  />
                  <span className="text-body leading-relaxed text-[color:var(--color-text-secondary)]">
                    {t(key)}
                  </span>
                </li>
              ))}
            </ul>

            <div className="flex flex-col gap-2 border-t border-[color:var(--color-border-soft)] px-5 py-4">
              {unsupported ? (
                <Link
                  href="/download/"
                  data-testid="vault-guide-unsupported-cta"
                  className={controlClass({
                    shape: "chip",
                    size: "lg",
                    tone: "onAccent",
                    className:
                      "w-full justify-center hover:bg-[color:var(--color-indigo-brand-hover)]",
                  })}
                >
                  <HardDrive size={13} aria-hidden />
                  {tUnsupported("unsupportedCta")}
                </Link>
              ) : null}
              <button
                type="button"
                hidden={unsupported}
                onClick={onPickExisting}
                data-testid="vault-guide-pick-existing"
                /* 세로 2연 버튼은 **한 벌**이라 같이 옮긴다 — 하나만 램프로
                   보내면 둘의 키가 어긋난다(36 vs 34). 둘 다 `chip`/`lg` 라
                   34px 로 나란히 내려온다. */
                className={controlClass({
                  shape: "chip",
                  size: "lg",
                  tone: "onAccent",
                  className:
                    "w-full justify-center hover:bg-[color:var(--color-indigo-brand-hover)]",
                })}
              >
                <FolderOpen size={13} aria-hidden />
                {t("actionPickExisting")}
              </button>
              <button
                type="button"
                hidden={unsupported}
                onClick={onCreateNew}
                data-testid="vault-guide-create-new"
                className={controlClass({
                  shape: "chip",
                  size: "lg",
                  tone: "secondary",
                  className:
                    "w-full justify-center hover:border-[color:var(--color-indigo-line-a35)] hover:text-[color:var(--color-text-primary)]",
                })}
              >
                <Sparkles size={13} aria-hidden />
                {t("actionCreateNew")}
              </button>
              <button
                type="button"
                onClick={onClose}
                data-testid="vault-guide-cancel"
                className={controlClass({
                  shape: "link",
                  tone: "muted",
                  className:
                    "mt-0.5 self-center hover:text-[color:var(--color-text-secondary)]",
                })}
              >
                {t("actionCancel")}
              </button>
            </div>
          </motion.section>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
