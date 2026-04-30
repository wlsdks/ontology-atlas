"use client";

import { useCallback, useEffect, useState } from "react";
import { Trash2, UserPlus } from "lucide-react";
import { Button, Card, CardContent, CardDescription, CardHeader, CardTitle, useToast } from "@/shared/ui";
import {
  inviteAccountMember,
  listAccountMembers,
  removeAccountMember,
  type AccountMember,
} from "../model/api";

interface Props {
  /** 현재 로그인 사용자 uid — 본인 (owner) 은 제거 버튼 숨김 처리. */
  currentUid?: string | null;
  /** 대상 워크스페이스 accountId. */
  accountId: string;
}

function roleLabel(role: AccountMember["role"]): string {
  switch (role) {
    case "owner":
      return "공간 소유자";
    case "editor":
      return "편집 가능";
    case "viewer":
      return "읽기 전용";
  }
}

export function AccountMembersPanel({ accountId, currentUid }: Props) {
  const toast = useToast();
  const [members, setMembers] = useState<AccountMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<"editor" | "viewer">("editor");
  const [inviteSubmitting, setInviteSubmitting] = useState(false);
  const [inviteError, setInviteError] = useState<string | null>(null);
  const [removingId, setRemovingId] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoadError(null);
    try {
      const result = await listAccountMembers(accountId);
      setMembers(result);
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : "멤버 목록을 불러오지 못했습니다.");
    } finally {
      setLoading(false);
    }
  }, [accountId]);

  useEffect(() => {
    queueMicrotask(() => void refresh());
  }, [refresh]);

  const handleInvite = async (event: React.FormEvent) => {
    event.preventDefault();
    const email = inviteEmail.trim().toLowerCase();
    if (!email) {
      setInviteError("초대할 이메일을 입력하세요.");
      return;
    }
    setInviteSubmitting(true);
    setInviteError(null);
    try {
      const result = await inviteAccountMember({
        accountId,
        email,
        role: inviteRole,
      });
      toast.show(
        result.status === "created"
          ? `"${email}" 초대 완료 (${roleLabel(result.role)})`
          : `"${email}" 역할을 ${roleLabel(result.role)} 로 업데이트했습니다`,
        "success",
      );
      setInviteEmail("");
      await refresh();
    } catch (err) {
      setInviteError(err instanceof Error ? err.message : "초대 실패");
    } finally {
      setInviteSubmitting(false);
    }
  };

  const handleRemove = async (member: AccountMember) => {
    if (!window.confirm(`${member.email ?? member.uid ?? "이 멤버"} 를 공간에서 내보낼까요?`)) {
      return;
    }
    setRemovingId(member.id);
    try {
      await removeAccountMember({ accountId, membershipId: member.id });
      toast.show("멤버를 제거했습니다", "success");
      await refresh();
    } catch (err) {
      toast.show(
        err instanceof Error ? err.message : "제거 실패",
        "error",
      );
    } finally {
      setRemovingId(null);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>공간 멤버</CardTitle>
        <CardDescription>
          이 워크스페이스를 함께 쓰는 사용자. owner 만 초대·제거가 가능합니다.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-6">
        {/* 초대 form */}
        <form onSubmit={handleInvite} className="flex flex-col gap-2 sm:flex-row sm:items-end">
          <label className="flex min-w-0 flex-1 flex-col gap-1">
            <span className="font-mono text-[10px] uppercase tracking-[0.12em] text-[color:var(--color-text-quaternary)]">
              초대할 이메일
            </span>
            <input
              type="email"
              required
              value={inviteEmail}
              onChange={(event) => setInviteEmail(event.target.value)}
              placeholder="member@team.com"
              className="h-10 rounded-md border border-[color:var(--color-overlay-3)] bg-[color:var(--color-overlay-1)] px-3 text-sm text-[color:var(--color-text-primary)] placeholder:text-[color:var(--color-text-quaternary)] focus-visible:border-[color:rgba(94,106,210,0.5)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:rgba(94,106,210,0.3)]"
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="font-mono text-[10px] uppercase tracking-[0.12em] text-[color:var(--color-text-quaternary)]">
              역할
            </span>
            <select
              value={inviteRole}
              onChange={(event) =>
                setInviteRole(event.target.value as "editor" | "viewer")
              }
              className="h-10 rounded-md border border-[color:var(--color-overlay-3)] bg-[color:var(--color-overlay-1)] px-3 text-sm text-[color:var(--color-text-primary)] focus-visible:border-[color:rgba(94,106,210,0.5)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:rgba(94,106,210,0.3)]"
            >
              <option value="editor">편집 가능</option>
              <option value="viewer">읽기 전용</option>
            </select>
          </label>
          <Button type="submit" disabled={inviteSubmitting} size="md">
            <UserPlus size={14} />
            {inviteSubmitting ? "초대 중..." : "초대"}
          </Button>
        </form>
        {inviteError ? (
          <p className="text-sm text-[color:var(--color-status-warning)]" role="alert">
            {inviteError}
          </p>
        ) : null}

        {/* 멤버 목록 */}
        <div>
          <h3 className="mb-3 font-mono text-[10px] uppercase tracking-[0.12em] text-[color:var(--color-text-quaternary)]">
            현재 멤버 · {members.length}
          </h3>
          {loading ? (
            <p className="text-xs text-[color:var(--color-text-tertiary)]">
              불러오는 중…
            </p>
          ) : loadError ? (
            <p className="text-sm text-[color:var(--color-status-warning)]" role="alert">
              {loadError}
            </p>
          ) : members.length === 0 ? (
            <p className="text-xs text-[color:var(--color-text-tertiary)]">
              아직 등록된 멤버가 없습니다.
            </p>
          ) : (
            <ul className="flex flex-col gap-2">
              {members.map((member) => {
                const isSelf = member.uid && member.uid === currentUid;
                const isOwner = member.role === "owner";
                return (
                  <li
                    key={member.id}
                    className="flex items-center justify-between gap-3 rounded-md border border-[color:var(--color-border-soft)] bg-[color:var(--color-overlay-1)] px-3 py-2"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm text-[color:var(--color-text-primary)]">
                        {member.email ?? member.uid ?? "(비공개)"}
                        {isSelf ? (
                          <span className="ml-2 rounded-full border border-[color:rgba(139,151,255,0.32)] bg-[color:rgba(94,106,210,0.12)] px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-[0.12em] text-[color:rgba(139,151,255,0.9)]">
                            나
                          </span>
                        ) : null}
                        {member.pending ? (
                          <span className="ml-2 rounded-full border border-[color:rgba(244,183,49,0.32)] bg-[color:rgba(244,183,49,0.08)] px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-[0.12em] text-[color:var(--color-status-warning)]">
                            초대 대기
                          </span>
                        ) : null}
                      </p>
                      <p className="mt-0.5 text-[11px] text-[color:var(--color-text-quaternary)]">
                        {roleLabel(member.role)}
                        {member.invitedBy
                          ? ` · 초대한 사람 ${member.invitedBy}`
                          : ""}
                      </p>
                    </div>
                    {isOwner || isSelf ? null : (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        disabled={removingId === member.id}
                        onClick={() => void handleRemove(member)}
                        aria-label="멤버 제거"
                      >
                        <Trash2 size={14} />
                        {removingId === member.id ? "제거 중..." : "제거"}
                      </Button>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
