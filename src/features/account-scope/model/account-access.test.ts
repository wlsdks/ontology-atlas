import { describe, expect, it } from "vitest";
import { resolveScopedAccountAccess } from "./account-access";

describe("resolveScopedAccountAccess", () => {
  it("전체 권한 사용자는 account 없이도 즉시 관리 권한을 가진다", () => {
    expect(
      resolveScopedAccountAccess({
        loading: false,
        isSignedIn: true,
        isAdmin: true,
        accountId: null,
      }),
    ).toMatchObject({
      kind: "admin",
      canManage: true,
      canEditProject: true,
    });
  });

  it("게스트는 읽기 전용으로 남는다", () => {
    expect(
      resolveScopedAccountAccess({
        loading: false,
        isSignedIn: false,
        isAdmin: false,
        accountId: "sandbox-lab",
      }),
    ).toMatchObject({
      kind: "guest",
      canManage: false,
      hasWorkspaceAccess: false,
    });
  });

  it("account 소유자는 공개 화면에서도 바로 수정할 수 있다", () => {
    expect(
      resolveScopedAccountAccess({
        loading: false,
        isSignedIn: true,
        isAdmin: false,
        accountId: "sandbox-lab",
        membershipRole: "owner",
      }),
    ).toMatchObject({
      kind: "owner",
      canManage: true,
      canReviewAndPublish: true,
    });
  });

  it("viewer는 workspace를 읽을 수 있지만 수정은 못 한다", () => {
    expect(
      resolveScopedAccountAccess({
        loading: false,
        isSignedIn: true,
        isAdmin: false,
        accountId: "sandbox-lab",
        membershipRole: "viewer",
      }),
    ).toMatchObject({
      kind: "viewer",
      hasWorkspaceAccess: true,
      canManage: false,
    });
  });

  it("account가 없는 로그인 사용자는 일반 회원으로 남는다", () => {
    expect(
      resolveScopedAccountAccess({
        loading: false,
        isSignedIn: true,
        isAdmin: false,
        accountId: null,
      }),
    ).toMatchObject({
      kind: "member",
      canManage: false,
    });
  });
});
