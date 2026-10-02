import { JetBrains_Mono } from 'next/font/google';
import localFont from 'next/font/local';

export const pretendard = localFont({
  src: '../../../node_modules/pretendard/dist/web/variable/woff2/PretendardVariable.woff2',
  variable: '--font-pretendard',
  display: 'swap',
  weight: '45 920',
});

export const pretendardLatin = localFont({
  src: '../../../node_modules/pretendard/dist/web/variable/woff2/PretendardVariable.woff2',
  variable: '--font-pretendard-latin',
  display: 'swap',
  weight: '45 920',
  declarations: [
    {
      prop: 'unicode-range',
      value: 'U+0000-024F, U+2010-2017, U+2019, U+2020-2025, U+2027-206F, U+2070-2BFF',
    },
  ],
});

export const jetbrainsMono = JetBrains_Mono({
  subsets: ['latin'],
  variable: '--font-jetbrains',
  display: 'swap',
});
