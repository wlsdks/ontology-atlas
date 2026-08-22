export { BottomTabBar } from './ui/BottomTabBar';
// `/download` is the only route without this bar, so it reserves no scroll-end
// space. Exporting the decision lets that page's test pin the pair together.
export { shouldHideBottomTabBar } from './lib/is-tab-active';
