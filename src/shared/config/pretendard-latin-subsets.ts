import localFont from 'next/font/local';

/**
 * Pretendard's Latin, digits and symbols as the upstream dynamic subset ships them
 * (`pretendard/dist/web/variable/pretendardvariable-dynamic-subset.css`, the same 1.3.9 glyphs
 * as the whole file, SIL OFL 1.1), each face limited to the Latin range
 * `U+0000-024F, U+2010-2017, U+2019, U+2020-2025, U+2027-206F, U+2070-2BFF`.
 *
 * A page downloads only the subsets whose characters it renders, so a Latin page no longer
 * fetches the 2 MB whole font for its text; Hangul still comes from the whole file behind this
 * stack (`fonts.ts`). One call per file because `next/font` takes literal options and one
 * `unicode-range` per family. `pretendard-latin-subsets.test.ts` rebuilds this list from the
 * package's stylesheet and fails when it drifts. No fallback face per subset: a fallback listed
 * between two subsets would draw the characters the next subset carries.
 */

const subset68 = localFont({
  src: '../../../node_modules/pretendard/dist/web/variable/woff2-dynamic-subset/PretendardVariable.subset.68.woff2',
  display: 'swap',
  weight: '45 920',
  preload: false,
  adjustFontFallback: false,
  declarations: [{ prop: 'unicode-range', value: 'U+2541-254B, U+25A4-25A9, U+25B1, U+25B5, U+25B9, U+25BF, U+25C1, U+25C3, U+25C9-25CA, U+25CC, U+25CE, U+25D0-25D1, U+25E6, U+25EF, U+260F, U+261D, U+261F, U+262F, U+2660, U+2664, U+2667-2669, U+266D, U+266F, U+2716, U+271A, U+273D, U+2756, U+2776-277F, U+278A-2793, U+2963, U+2965, U+2AC5-2AC6, U+2ACB-2ACC' }],
});

const subset69 = localFont({
  src: '../../../node_modules/pretendard/dist/web/variable/woff2-dynamic-subset/PretendardVariable.subset.69.woff2',
  display: 'swap',
  weight: '45 920',
  preload: false,
  adjustFontFallback: false,
  declarations: [{ prop: 'unicode-range', value: 'U+2479-2487, U+249C-24D1, U+24D3-24D7, U+24D9-24E9, U+24EB-24F4, U+2500-2501, U+2503, U+250C-2513, U+2515-2516, U+2518-2540' }],
});

const subset70 = localFont({
  src: '../../../node_modules/pretendard/dist/web/variable/woff2-dynamic-subset/PretendardVariable.subset.70.woff2',
  display: 'swap',
  weight: '45 920',
  preload: false,
  adjustFontFallback: false,
  declarations: [{ prop: 'unicode-range', value: 'U+215B-215E, U+2162-2169, U+2170-2179, U+2195-2199, U+21B0-21B4, U+21BC, U+21C0, U+21C4-21C5, U+21CD, U+21CF-21D4, U+21E0-21E3, U+21E6-21E9, U+2200, U+2202-2203, U+2206-2209, U+220B-220C, U+220F, U+2211, U+2213, U+221A, U+221D-2220, U+2222, U+2225-2227, U+2229-222C, U+222E, U+2234-2237, U+223D, U+2243, U+2245, U+2248, U+2250-2253, U+225A, U+2260-2262, U+2264-2267, U+226A-226B, U+226E-2273, U+2276-2277, U+2279-227B, U+2280-2287, U+228A-228B, U+2295-2297, U+22A3-22A5, U+22BB-22BC, U+22CE-22CF, U+22DA-22DB, U+22EE-22EF, U+2306, U+2312, U+2314, U+2467-2478' }],
});

const subset71 = localFont({
  src: '../../../node_modules/pretendard/dist/web/variable/woff2-dynamic-subset/PretendardVariable.subset.71.woff2',
  display: 'swap',
  weight: '45 920',
  preload: false,
  adjustFontFallback: false,
  declarations: [{ prop: 'unicode-range', value: 'U+81-82, U+84, U+A2-A5, U+A7-A8, U+AA, U+AC, U+B1-B3, U+B6, U+B8-BA, U+BC-BE, U+C0, U+C2, U+C6-CB, U+CE-D0, U+D4, U+D8-D9, U+DB-DC, U+DE-DF, U+E6, U+EB, U+EE-F0, U+F4, U+F7-F9, U+FB, U+FE-FF, U+111, U+126-127, U+132-133, U+138, U+13F-142, U+149-14B, U+152-153, U+166-167, U+2010, U+2015-2016, U+2019, U+2020-2021, U+2025, U+2030, U+2033-2036, U+203C, U+203E, U+2042, U+2074, U+207A-207F, U+2081-2084, U+2109, U+2113, U+2116, U+2121, U+2126, U+212B, U+2153-2154' }],
});

const subset72 = localFont({
  src: '../../../node_modules/pretendard/dist/web/variable/woff2-dynamic-subset/PretendardVariable.subset.72.woff2',
  display: 'swap',
  weight: '45 920',
  preload: false,
  adjustFontFallback: false,
  declarations: [{ prop: 'unicode-range', value: 'U+E8, U+2160, U+2194' }],
});

const subset73 = localFont({
  src: '../../../node_modules/pretendard/dist/web/variable/woff2-dynamic-subset/PretendardVariable.subset.73.woff2',
  display: 'swap',
  weight: '45 920',
  preload: false,
  adjustFontFallback: false,
  declarations: [{ prop: 'unicode-range', value: 'U+2466, U+25A1, U+25A3, U+261C' }],
});

const subset74 = localFont({
  src: '../../../node_modules/pretendard/dist/web/variable/woff2-dynamic-subset/PretendardVariable.subset.74.woff2',
  display: 'swap',
  weight: '45 920',
  preload: false,
  adjustFontFallback: false,
  declarations: [{ prop: 'unicode-range', value: 'U+131, U+2032, U+2465, U+2642' }],
});

const subset75 = localFont({
  src: '../../../node_modules/pretendard/dist/web/variable/woff2-dynamic-subset/PretendardVariable.subset.75.woff2',
  display: 'swap',
  weight: '45 920',
  preload: false,
  adjustFontFallback: false,
  declarations: [{ prop: 'unicode-range', value: 'U+B4, U+20A9, U+20AC, U+2190, U+24D8, U+2502, U+2514, U+2592, U+25C7-25C8, U+2663' }],
});

const subset76 = localFont({
  src: '../../../node_modules/pretendard/dist/web/variable/woff2-dynamic-subset/PretendardVariable.subset.76.woff2',
  display: 'swap',
  weight: '45 920',
  preload: false,
  adjustFontFallback: false,
  declarations: [{ prop: 'unicode-range', value: 'U+2161, U+2228, U+2299, U+2464, U+2517, U+2640' }],
});

const subset77 = localFont({
  src: '../../../node_modules/pretendard/dist/web/variable/woff2-dynamic-subset/PretendardVariable.subset.77.woff2',
  display: 'swap',
  weight: '45 920',
  preload: false,
  adjustFontFallback: false,
  declarations: [{ prop: 'unicode-range', value: 'U+2103, U+2463, U+25C6, U+25CB, U+266C' }],
});

const subset78 = localFont({
  src: '../../../node_modules/pretendard/dist/web/variable/woff2-dynamic-subset/PretendardVariable.subset.78.woff2',
  display: 'swap',
  weight: '45 920',
  preload: false,
  adjustFontFallback: false,
  declarations: [{ prop: 'unicode-range', value: 'U+2039-203A, U+223C, U+25B3, U+25B7, U+25BD, U+25CF, U+266A' }],
});

const subset79 = localFont({
  src: '../../../node_modules/pretendard/dist/web/variable/woff2-dynamic-subset/PretendardVariable.subset.79.woff2',
  display: 'swap',
  weight: '45 920',
  preload: false,
  adjustFontFallback: false,
  declarations: [{ prop: 'unicode-range', value: 'U+B0, U+E9, U+2193, U+2462, U+260E, U+261E' }],
});

const subset80 = localFont({
  src: '../../../node_modules/pretendard/dist/web/variable/woff2-dynamic-subset/PretendardVariable.subset.80.woff2',
  display: 'swap',
  weight: '45 920',
  preload: false,
  adjustFontFallback: false,
  declarations: [{ prop: 'unicode-range', value: 'U+E0, U+E2, U+2460-2461, U+25A0' }],
});

const subset81 = localFont({
  src: '../../../node_modules/pretendard/dist/web/variable/woff2-dynamic-subset/PretendardVariable.subset.81.woff2',
  display: 'swap',
  weight: '45 920',
  preload: false,
  adjustFontFallback: false,
  declarations: [{ prop: 'unicode-range', value: 'U+24, U+60, U+2191, U+2606' }],
});

const subset82 = localFont({
  src: '../../../node_modules/pretendard/dist/web/variable/woff2-dynamic-subset/PretendardVariable.subset.82.woff2',
  display: 'swap',
  weight: '45 920',
  preload: false,
  adjustFontFallback: false,
  declarations: [{ prop: 'unicode-range', value: 'U+D7, U+EA, U+FC, U+2192, U+25BC' }],
});

const subset83 = localFont({
  src: '../../../node_modules/pretendard/dist/web/variable/woff2-dynamic-subset/PretendardVariable.subset.83.woff2',
  display: 'swap',
  weight: '45 920',
  preload: false,
  adjustFontFallback: false,
  declarations: [{ prop: 'unicode-range', value: 'U+E7, U+2022, U+203B, U+25C0, U+2605, U+2661' }],
});

const subset84 = localFont({
  src: '../../../node_modules/pretendard/dist/web/variable/woff2-dynamic-subset/PretendardVariable.subset.84.woff2',
  display: 'swap',
  weight: '45 920',
  preload: false,
  adjustFontFallback: false,
  declarations: [{ prop: 'unicode-range', value: 'U+2665' }],
});

const subset85 = localFont({
  src: '../../../node_modules/pretendard/dist/web/variable/woff2-dynamic-subset/PretendardVariable.subset.85.woff2',
  display: 'swap',
  weight: '45 920',
  preload: false,
  adjustFontFallback: false,
  declarations: [{ prop: 'unicode-range', value: 'U+5E, U+25B2, U+25B6' }],
});

const subset86 = localFont({
  src: '../../../node_modules/pretendard/dist/web/variable/woff2-dynamic-subset/PretendardVariable.subset.86.woff2',
  display: 'swap',
  weight: '45 920',
  preload: false,
  adjustFontFallback: false,
  declarations: [{ prop: 'unicode-range', value: 'U+3C-3D, U+24D2' }],
});

const subset87 = localFont({
  src: '../../../node_modules/pretendard/dist/web/variable/woff2-dynamic-subset/PretendardVariable.subset.87.woff2',
  display: 'swap',
  weight: '45 920',
  preload: false,
  adjustFontFallback: false,
  declarations: [{ prop: 'unicode-range', value: 'U+23, U+25, U+5F, U+A9' }],
});

const subset88 = localFont({
  src: '../../../node_modules/pretendard/dist/web/variable/woff2-dynamic-subset/PretendardVariable.subset.88.woff2',
  display: 'swap',
  weight: '45 920',
  preload: false,
  adjustFontFallback: false,
  declarations: [{ prop: 'unicode-range', value: 'U+26, U+2B, U+3E, U+40, U+7E' }],
});

const subset89 = localFont({
  src: '../../../node_modules/pretendard/dist/web/variable/woff2-dynamic-subset/PretendardVariable.subset.89.woff2',
  display: 'swap',
  weight: '45 920',
  preload: false,
  adjustFontFallback: false,
  declarations: [{ prop: 'unicode-range', value: 'U+D, U+7C' }],
});

const subset91 = localFont({
  src: '../../../node_modules/pretendard/dist/web/variable/woff2-dynamic-subset/PretendardVariable.subset.91.woff2',
  display: 'swap',
  weight: '45 920',
  preload: true,
  adjustFontFallback: false,
  declarations: [{ prop: 'unicode-range', value: 'U+20-22, U+27-2A, U+2C-39, U+3A-3B, U+3F, U+41-4E, U+4F-5D, U+61-7B, U+7D, U+A0-A1, U+AB, U+AD-AE, U+B7, U+BB, U+BF, U+2013-2014, U+2122' }],
});

const PRETENDARD_LATIN_SUBSETS = [subset68, subset69, subset70, subset71, subset72, subset73, subset74, subset75, subset76, subset77, subset78, subset79, subset80, subset81, subset82, subset83, subset84, subset85, subset86, subset87, subset88, subset89, subset91] as const;

export const pretendardLatinStack = PRETENDARD_LATIN_SUBSETS.map((font) => font.style.fontFamily).join(', ');
