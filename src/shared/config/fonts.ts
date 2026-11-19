import { JetBrains_Mono } from 'next/font/google';
import localFont from 'next/font/local';

/**
 * The whole Pretendard file, listed last behind the subsets (`pretendard-latin-subsets.ts`, and on
 * Korean pages the upstream dynamic subsets in `app/styles/lang-cjk.css`), so a page fetches its
 * 2 MB only for a character no subset carries, such as an accented Latin letter. Not preloaded, so
 * a page that never needs it never downloads it.
 */
export const pretendard = localFont({
  src: '../../../node_modules/pretendard/dist/web/variable/woff2/PretendardVariable.woff2',
  variable: '--font-pretendard',
  display: 'swap',
  weight: '45 920',
  preload: false,
});

export { pretendardLatinStack } from './pretendard-latin-subsets';

export const jetbrainsMono = JetBrains_Mono({
  subsets: ['latin'],
  variable: '--font-jetbrains',
  display: 'swap',
});
