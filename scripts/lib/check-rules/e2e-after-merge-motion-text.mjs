export const rules = [
  {
    order: 5102,
    command: 'pnpm exec playwright test tests/e2e/gray-area/text-scale.spec.ts',
    reason: 'the gray-area inspector at larger text sizes changed',
    matches: [
      /^src\/features\/gray-area\/ui\/GrayAreaInspector\.tsx$/,
    ],
  },
  {
    order: 5101,
    command: 'pnpm exec playwright test tests/e2e/typography/cjk-font-fallback.spec.ts',
    reason: 'the Japanese and Chinese font stack changed',
    matches: [
      /^app\/styles\/lang-cjk\.css$/,
    ],
  },
  {
    order: 5106,
    command: 'pnpm exec playwright test tests/e2e/motion/motion-disclosure.spec.ts',
    reason: 'disclosure open and close motion changed',
    matches: [
      /^src\/shared\/ui\/controls\/disclosure\.tsx$/,
      /^src\/shared\/ui\/controls\/row-disclosure\.tsx$/,
      /^src\/shared\/lib\/list-rows\/use-row-disclosure\.ts$/,
    ],
  },
  {
    order: 5108,
    command: 'pnpm exec playwright test tests/e2e/motion-sampler.spec.ts',
    reason: 'the motion sampler instrument changed',
    matches: [
      /^tests\/e2e\/motion-sampler\.ts$/,
    ],
  },
  {
    order: 5115,
    command: 'pnpm exec playwright test tests/e2e/settings/settings-text-size.spec.ts',
    reason: 'the text size setting changed',
    matches: [
      /^src\/shared\/lib\/preferences\/text-size\.ts$/,
      /^app\/styles\/base-responsive\.css$/,
    ],
  },
];
