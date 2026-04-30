import { httpsCallable } from "firebase/functions";
import { getFirebaseFunctions } from "@/shared/api";

export type AccountMemberRole = "owner" | "editor" | "viewer";

export interface AccountMember {
  id: string;
  accountId: string;
  email: string | null;
  uid: string | null;
  role: AccountMemberRole;
  invitedBy: string | null;
  createdAt: number | null;
  updatedAt: number | null;
  /** uid 미연결 (이메일만 등록된 초대 대기 상태). */
  pending: boolean;
}

export interface InviteAccountMemberInput {
  accountId: string;
  email: string;
  role: "editor" | "viewer";
}

export interface InviteAccountMemberResult {
  membershipId: string;
  accountId: string;
  email: string;
  role: AccountMemberRole;
  status: "created" | "updated";
}

export async function inviteAccountMember(
  input: InviteAccountMemberInput,
): Promise<InviteAccountMemberResult> {
  const callable = httpsCallable<
    InviteAccountMemberInput,
    InviteAccountMemberResult
  >(getFirebaseFunctions(), "inviteAccountMember");
  const response = await callable(input);
  return response.data;
}

export interface RemoveAccountMemberInput {
  accountId: string;
  membershipId: string;
}

export async function removeAccountMember(
  input: RemoveAccountMemberInput,
): Promise<{ membershipId: string; status: "removed" }> {
  const callable = httpsCallable<
    RemoveAccountMemberInput,
    { membershipId: string; status: "removed" }
  >(getFirebaseFunctions(), "removeAccountMember");
  const response = await callable(input);
  return response.data;
}

export async function listAccountMembers(
  accountId: string,
): Promise<AccountMember[]> {
  const callable = httpsCallable<
    { accountId: string },
    { members: AccountMember[] }
  >(getFirebaseFunctions(), "listAccountMembers");
  const response = await callable({ accountId });
  return response.data.members ?? [];
}
