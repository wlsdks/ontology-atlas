import { Suspense } from "react";
import type { Metadata } from "next";
import { ReviewHubRedirectClient } from "./ReviewHubRedirectClient";

export const metadata: Metadata = {
  title: '문서 확인',
};

/**
 * 검토 허브. 현재는 knowledge 검토 워크스페이스 한 곳뿐이라 자동 redirect.
 * 추후 추출 실패 / 새 문서 검토 / 멤버 초대 같은 다른 검토 큐가 생기면
 * 여기서 카드 형태로 분기한다.
 */
export default function Page() {
  return (
    <Suspense fallback={null}>
      <ReviewHubRedirectClient />
    </Suspense>
  );
}
