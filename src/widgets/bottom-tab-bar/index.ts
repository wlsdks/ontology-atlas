export { BottomTabBar } from './ui/BottomTabBar';
// `/download` 는 이 바가 없는 유일한 라우트라 스크롤 끝 예약고를 잡지
// 않는다. 그 결합을 그 페이지의 테스트가 고정할 수 있게 판정 함수를 공개한다.
export { shouldHideBottomTabBar } from './lib/is-tab-active';
