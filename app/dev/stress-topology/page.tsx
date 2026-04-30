import { notFound } from "next/navigation";
import { Suspense } from "react";
import StressTopologyClient from "./StressTopologyClient";

/**
 * 합성 프로젝트 N개로 홈 토폴로지 성능을 재현하는 개발/측정 전용 라우트.
 *
 * 실 서비스에 노출하지 않으려면 env에 `NEXT_PUBLIC_ENABLE_STRESS_TEST=1`을
 * 두어야 한다. 정적 export에서 env가 없으면 404로 떨어진다.
 *
 * 데이터 주입은 `window.__synthProjects`로 이뤄진다 (Playwright addInitScript).
 * 클라이언트가 이 값을 직접 쓰지 않아도 subscribeProjects가 우선 반환한다.
 */
export default function Page() {
  if (process.env.NEXT_PUBLIC_ENABLE_STRESS_TEST !== "1") {
    notFound();
  }

  return (
    <Suspense fallback={null}>
      <StressTopologyClient />
    </Suspense>
  );
}
