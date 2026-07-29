export { DownloadPage } from './ui/DownloadPage';
/**
 * **같은 화면, 두 주소.** `/`(웹 방문자의 얼굴)와 `/download`(설치를 부르는
 * 딥링크)가 이 뷰 하나를 렌더한다 — `/` 와 `/topology` 가 지도 하나를 공유하는
 * 것과 같은 관례다.
 *
 * 별칭을 두는 이유는 **읽는 쪽**이다. 루트 진입 분기에서 `<DownloadPage />` 를
 * 보면 다음 사람이 "루트가 왜 다운로드 페이지지?" 로 읽는다. 이 이름이
 * 그 자리에서 하는 일을 말한다.
 */
export { DownloadPage as GatewayLandingPage } from './ui/DownloadPage';
export { downloadStructuredData } from './lib/structured-data';
