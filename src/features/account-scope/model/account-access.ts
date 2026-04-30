/**
 * Single-user 모드의 권한 표현 타입.
 *
 * multi-account / membership-based role resolver 는 Phase B-2 에서 제거됐고
 * `useScopedAccountAccess` 가 직접 분기 (loading / guest / owner) 한다.
 * 여기서는 형태만 정의해 다른 모듈이 import 해 사용.
 */

export type ScopedAccountAccessKind =
  | "loading"
  | "guest"
  | "member"
  | "viewer"
  | "editor"
  | "owner"
  | "admin";

export interface ScopedAccountAccess {
  kind: ScopedAccountAccessKind;
  canManage: boolean;
  canEditProject: boolean;
  canEditDocuments: boolean;
  canReviewAndPublish: boolean;
  hasWorkspaceAccess: boolean;
  roleLabel: string;
  description: string;
}
