"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { ArrowLeft, Check, Copy, Plus, X } from "lucide-react";
import { PermissionGate, useGlobalAdmin } from "@/features/permissions";
import {
  generateApiKey,
  revokeApiKey,
  subscribeApiKeys,
  type ApiKey,
} from "@/entities/api-key";
import { Button, EmptyState, useToast } from "@/shared/ui";
import { OperationsNav } from "@/widgets/operations-nav";
import { copyText } from "@/shared/lib/copy-text";
import { formatDate } from "@/shared/lib/format-date";
import {
  ACCOUNT_QUERY_KEY,
  appendAccountQuery,
} from "@/shared/lib/account-scope";
import { useScopedAccountId } from "@/shared/lib/use-scoped-account-id";

/**
 * M2 Phase 1 — API key 발급/조회/revoke admin UI.
 *
 * 보안 UX:
 *  - 새 키 plaintext 는 발급 직후 1회만 모달에 노출. "복사 후 닫기" 강제.
 *  - 닫은 후엔 keyHash 만 남아 평문 복원 불가.
 *  - revoke 는 soft-delete (audit 보존).
 */
function ApiKeysContent() {
  const { user } = useGlobalAdmin();
  const searchParams = useSearchParams();
  const accountId = useScopedAccountId(searchParams.get(ACCOUNT_QUERY_KEY));
  const toast = useToast();

  const [keys, setKeys] = useState<ApiKey[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [name, setName] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [revealedPlaintext, setRevealedPlaintext] = useState<string | null>(null);
  const [revokingId, setRevokingId] = useState<string | null>(null);
  const [copiedToken, setCopiedToken] = useState(false);

  useEffect(() => {
    const unsub = subscribeApiKeys(
      accountId,
      (next) => {
        setKeys(next);
        setLoaded(true);
      },
      () => setLoaded(true),
    );
    return () => unsub();
  }, [accountId]);

  const dashboardHref = useMemo(
    () => appendAccountQuery("/settings/", accountId),
    [accountId],
  );
  const userEmail = user?.email ?? null;

  const handleGenerate = useCallback(async () => {
    if (!accountId || !userEmail || submitting) return;
    const trimmed = name.trim();
    if (!trimmed) {
      toast.show("키 이름을 입력해주세요", "error");
      return;
    }
    setSubmitting(true);
    try {
      const result = await generateApiKey({
        accountId,
        name: trimmed,
        createdBy: userEmail,
      });
      setRevealedPlaintext(result.plaintext);
      setName("");
      toast.show(`"${trimmed}" 키를 발급했습니다`, "success");
    } catch (err) {
      const message = err instanceof Error ? err.message : "발급 실패";
      toast.show(`발급 실패: ${message}`, "error");
    } finally {
      setSubmitting(false);
    }
  }, [accountId, userEmail, submitting, name, toast]);

  const handleCopyPlaintext = useCallback(async () => {
    if (!revealedPlaintext) return;
    const ok = await copyText(revealedPlaintext);
    if (ok) {
      setCopiedToken(true);
      toast.show("키를 복사했습니다", "success");
      window.setTimeout(() => setCopiedToken(false), 1500);
    } else {
      toast.show("복사 실패 — 수동 선택 후 Cmd+C", "error");
    }
  }, [revealedPlaintext, toast]);

  const handleRevoke = useCallback(
    async (key: ApiKey) => {
      if (!accountId) return;
      if (!window.confirm(`"${key.name}" 키를 revoke 할까요? 되돌릴 수 없습니다.`)) {
        return;
      }
      setRevokingId(key.id);
      try {
        await revokeApiKey(accountId, key.id);
        toast.show(`"${key.name}" revoke 됨`, "success");
      } catch (err) {
        const message = err instanceof Error ? err.message : "revoke 실패";
        toast.show(`revoke 실패: ${message}`, "error");
      } finally {
        setRevokingId(null);
      }
    },
    [accountId, toast],
  );

  return (
    <main className="min-h-screen">
      <h1 className="sr-only">API 키 관리</h1>
      <OperationsNav accountId={accountId} />
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-8 px-5 py-6 md:px-6 md:py-10">
      <header className="flex flex-col gap-3">
        <Link
          href={dashboardHref}
          className="inline-flex w-fit items-center gap-1.5 break-keep text-[12px] text-[color:var(--color-text-tertiary)] transition-colors hover:text-[color:var(--color-text-primary)]"
        >
          <ArrowLeft size={14} />
          정리
        </Link>
        <div>
          <h1 className="break-keep text-[28px] font-[var(--font-weight-signature)] text-[color:var(--color-text-primary)] md:text-3xl">
            API 키
          </h1>
          <p className="mt-2 break-keep text-sm leading-6 text-[color:var(--color-text-secondary)]">
            외부 클라이언트 (CLI · CI · MCP server) 가 <code>POST /api/v1/docs</code> 같은 HTTP 엔드포인트로 이 워크스페이스에 push 할 때 사용합니다. 키는 발급 직후 1회만 평문으로 보입니다 — 안전한 곳에 즉시 복사하세요.
          </p>
        </div>
      </header>

      {!accountId ? (
        <section className="rounded-xl border border-[color:var(--color-divider)] bg-[color:var(--color-elevated)] px-5 py-5">
          <p className="break-keep text-sm leading-6 text-[color:var(--color-text-secondary)]">
            먼저 작업할 공간을 골라주세요. 우상단 사용자 메뉴에서 &quot;내 공간&quot; 으로
            가거나, URL 에 <code>?a=&lt;accountId&gt;</code> 를 붙이면 해당
            공간의 API 키를 관리할 수 있어요.
          </p>
          <Link
            href={appendAccountQuery("/account", accountId)}
            className="mt-4 inline-flex h-9 items-center gap-1.5 rounded-md border border-[color:rgba(94,106,210,0.32)] bg-[color:rgba(94,106,210,0.08)] px-3 break-keep text-[13px] text-[color:var(--color-text-primary)] transition-colors hover:border-[color:var(--color-indigo-brand)] hover:bg-[color:rgba(94,106,210,0.14)]"
          >
            내 공간으로 가기
          </Link>
        </section>
      ) : (
        <>
          <section
            aria-label="키 발급"
            className="rounded-xl border border-[color:rgba(94,106,210,0.2)] bg-[color:rgba(94,106,210,0.06)] px-5 py-4"
          >
            <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-[color:rgba(139,151,255,0.9)]">
              새 키 발급
            </p>
            <p className="mt-2 text-sm text-[color:var(--color-text-secondary)]">
              키 이름은 식별용이라 자유롭게 (예: &ldquo;MCP from laptop&rdquo;, &ldquo;CI bot&rdquo;).
            </p>
            <form
              onSubmit={(event) => {
                event.preventDefault();
                void handleGenerate();
              }}
              className="mt-4 flex flex-wrap items-center gap-2"
            >
              <input
                type="text"
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder="키 이름"
                maxLength={48}
                disabled={submitting}
                data-testid="api-key-name-input"
                className="flex-1 min-w-[220px] rounded-md border border-[color:var(--color-divider)] bg-[color:var(--color-panel)] px-3 py-2 text-sm text-[color:var(--color-text-primary)] placeholder:text-[color:var(--color-text-quaternary)] focus:border-[color:rgba(94,106,210,0.46)] focus:outline-none"
              />
              <Button
                type="submit"
                disabled={submitting || !name.trim()}
                data-testid="api-key-generate-button"
              >
                <Plus size={14} />
                {submitting ? "발급 중…" : "키 발급"}
              </Button>
            </form>
          </section>

          {revealedPlaintext ? (
            <section
              aria-label="새 키 평문"
              role="dialog"
              aria-modal="false"
              data-testid="api-key-revealed"
              className="rounded-xl border border-[color:rgba(124,196,160,0.32)] bg-[color:rgba(124,196,160,0.06)] px-5 py-4"
            >
              <div className="flex items-baseline justify-between gap-3">
                <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-[color:rgba(124,196,160,0.9)]">
                  ✓ 발급된 평문 키 — 한 번만 노출
                </p>
                <button
                  type="button"
                  onClick={() => setRevealedPlaintext(null)}
                  className="text-[color:var(--color-text-tertiary)] transition-colors hover:text-[color:var(--color-text-primary)]"
                  aria-label="닫기"
                >
                  <X size={14} />
                </button>
              </div>
              <p className="mt-2 text-sm text-[color:var(--color-text-secondary)]">
                지금 복사하지 않으면 다시 볼 수 없습니다. 안전한 곳 (1Password / 환경변수 등) 에 저장하세요.
              </p>
              <div className="mt-3 flex flex-wrap items-center gap-2 rounded-md border border-[color:var(--color-divider)] bg-[color:rgba(14,16,22,0.85)] px-3 py-2">
                <code className="flex-1 break-all font-mono text-[12px] text-[color:var(--color-text-primary)]">
                  {revealedPlaintext}
                </code>
                <button
                  type="button"
                  onClick={handleCopyPlaintext}
                  className="inline-flex items-center gap-1 rounded-md border border-[color:rgba(94,106,210,0.35)] bg-[color:rgba(94,106,210,0.12)] px-2.5 py-1 font-mono text-[10px] uppercase tracking-[0.12em] text-[color:rgba(139,151,255,0.95)] transition-colors hover:bg-[color:rgba(94,106,210,0.2)]"
                  data-testid="api-key-copy-button"
                >
                  {copiedToken ? <Check size={12} /> : <Copy size={12} />}
                  {copiedToken ? "복사됨" : "복사"}
                </button>
              </div>
              <p className="mt-3 text-[11px] text-[color:var(--color-text-tertiary)]">
                사용 예: <code>curl -H &quot;Authorization: Bearer {revealedPlaintext.slice(0, 12)}…&quot; https://api.narnia.dev/api/v1/docs</code>
              </p>
            </section>
          ) : null}

          <section
            aria-label="키 목록"
            className="rounded-xl border border-[color:var(--color-divider)] bg-[color:var(--color-elevated)] px-5 py-4"
            data-testid="api-key-list"
          >
            <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-[color:var(--color-text-quaternary)]">
              발급된 키
            </p>
            {!loaded ? (
              <p className="mt-3 text-sm text-[color:var(--color-text-tertiary)]">
                불러오는 중…
              </p>
            ) : keys.length === 0 ? (
              <div className="mt-3">
                <EmptyState
                  size="compact"
                  title="아직 발급된 키가 없습니다"
                  description="위에서 첫 키를 발급해보세요."
                />
              </div>
            ) : (
              <ul className="mt-3 flex flex-col gap-2">
                {keys.map((key) => (
                  <li
                    key={key.id}
                    data-testid={`api-key-row-${key.id}`}
                    className="flex flex-col gap-2 rounded-md border border-[color:var(--color-border-soft)] bg-[color:var(--color-elevated)] px-3 py-2.5 sm:flex-row sm:items-center sm:justify-between"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm font-[var(--font-weight-signature)] text-[color:var(--color-text-primary)]">
                        {key.name}
                        {key.revokedAt ? (
                          <span className="ml-2 inline-block rounded-full border border-[color:var(--color-divider)] bg-[color:var(--color-overlay-2)] px-2 py-0.5 font-mono text-[9px] uppercase tracking-[0.12em] text-[color:var(--color-text-quaternary)]">
                            revoked
                          </span>
                        ) : null}
                      </p>
                      <p className="mt-1 font-mono text-[11px] text-[color:var(--color-text-tertiary)]">
                        <code>{key.keyPrefix}…</code> · 사용 {key.usageCount}회 · 발급 {formatDate(key.createdAt)} · {key.createdBy}
                        {key.lastUsedAt
                          ? ` · 마지막 ${formatDate(key.lastUsedAt)}`
                          : ""}
                      </p>
                    </div>
                    {key.revokedAt ? null : (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => void handleRevoke(key)}
                        disabled={revokingId === key.id}
                        data-testid={`api-key-revoke-${key.id}`}
                      >
                        {revokingId === key.id ? "revoking…" : "revoke"}
                      </Button>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </section>
        </>
      )}
      </div>
    </main>
  );
}

export function ApiKeysPage() {
  return (
    <PermissionGate>
      <ApiKeysContent />
    </PermissionGate>
  );
}
