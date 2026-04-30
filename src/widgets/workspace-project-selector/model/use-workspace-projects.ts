"use client";

import { useEffect, useState } from "react";
import {
  subscribeWorkspaceProjects,
  type WorkspaceProject,
} from "@/entities/workspace-project";

export interface WorkspaceProjectsState {
  projects: WorkspaceProject[];
  loading: boolean;
  error: string | null;
}

/**
 * 한 워크스페이스의 프로젝트 컨테이너 목록을 실시간 구독한다.
 *
 * - `accountId` 가 없거나 데모 세션이면 빈 배열로 즉시 resolve (엔티티 API
 *   내부 분기와 동일).
 * - 에러 시 loading=false, error 메시지만 남기고 projects 는 이전 값 유지.
 *   (일시적 네트워크 장애로 리스트가 번쩍 비는 걸 방지.)
 */
export function useWorkspaceProjects(
  accountId: string | null | undefined,
): WorkspaceProjectsState {
  const [state, setState] = useState<WorkspaceProjectsState>({
    projects: [],
    loading: true,
    error: null,
  });

  // setState-in-effect 룰을 피하기 위해 effect 진입 시 loading=true 로 직접
  // 되돌리지 않는다. 첫 callback 이 loading=false 로 덮어쓰고, accountId
  // 변경 시 이전 값의 projects 가 잠깐 유지되는 대신 다음 callback 이 fresh
  // 값을 원샷으로 반영. HomePage.subscribeProjects 패턴과 동일.
  useEffect(() => {
    const unsubscribe = subscribeWorkspaceProjects(
      accountId,
      (projects) => {
        setState({ projects, loading: false, error: null });
      },
      (error) => {
        setState((current) => ({
          projects: current.projects,
          loading: false,
          error: error.message?.trim() || "프로젝트 컨테이너를 불러오지 못했습니다.",
        }));
      },
    );
    return () => unsubscribe();
  }, [accountId]);

  return state;
}
