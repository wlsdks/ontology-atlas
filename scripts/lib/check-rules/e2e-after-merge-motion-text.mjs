export const rules = [
  {
    order: 5100,
    command: 'pnpm exec playwright test tests/e2e/acp-working-shimmer.spec.ts',
    reason: 'the working shimmer on in-flight ACP rows changed',
    matches: [
      /^src\/widgets\/acp-chat-panel\/ui\/working-ink\.ts$/,
      /^app\/styles\/base-foundation\.css$/,
    ],
  },
  {
    order: 5101,
    command: 'pnpm exec playwright test tests/e2e/cjk-font-fallback.spec.ts',
    reason: 'the Japanese and Chinese font stack changed',
    matches: [
      /^app\/styles\/lang-cjk\.css$/,
    ],
  },
  {
    order: 5102,
    command: 'pnpm exec playwright test tests/e2e/gray-area/text-scale.spec.ts',
    reason: 'the gray-area inspector at larger text sizes changed',
    matches: [
      /^src\/features\/gray-area\/ui\/GrayAreaInspector\.tsx$/,
    ],
  },
  {
    order: 5103,
    command: 'pnpm exec playwright test tests/e2e/hangul-tracking.spec.ts',
    reason: 'caps tracking on Hangul text changed',
    matches: [
      /^app\/styles\/shell\.css$/,
      /^app\/styles\/tokens\.css$/,
    ],
  },
  {
    order: 5104,
    command: 'pnpm exec playwright test tests/e2e/insights-motion-feedback.spec.ts',
    reason: 'insights copy feedback and fill motion changed',
    matches: [
      /^src\/views\/ontology-insights\/ui\/tabs\/FlowTab\.tsx$/,
      /^src\/views\/ontology-insights\/ui\/parts\/InsightsBar\.tsx$/,
      /^src\/shared\/motion\/feedback-glyph\.tsx$/,
      /^app\/styles\/motion-feedback\.css$/,
    ],
  },
  {
    order: 5105,
    command: 'pnpm exec playwright test tests/e2e/motion-checkbox.spec.ts',
    reason: 'checkbox state motion changed',
    matches: [
      /^src\/shared\/ui\/checkbox\.tsx$/,
      /^app\/styles\/motion-checkbox\.css$/,
    ],
  },
  {
    order: 5106,
    command: 'pnpm exec playwright test tests/e2e/motion-disclosure.spec.ts',
    reason: 'disclosure open and close motion changed',
    matches: [
      /^src\/shared\/ui\/disclosure\.tsx$/,
      /^src\/shared\/ui\/row-disclosure\.tsx$/,
      /^src\/shared\/lib\/use-row-disclosure\.ts$/,
    ],
  },
  {
    order: 5107,
    command: 'pnpm exec playwright test tests/e2e/motion-press.spec.ts',
    reason: 'control press and hover motion changed',
    matches: [
      /^src\/shared\/ui\/control-class\.ts$/,
      /^src\/shared\/ui\/button\.tsx$/,
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
    order: 5109,
    command: 'pnpm exec playwright test tests/e2e/motion-selection-indicator.spec.ts',
    reason: 'the sliding selection indicator motion changed',
    matches: [
      /^src\/shared\/motion\/use-sliding-indicator\.ts$/,
      /^src\/shared\/motion\/spring\.ts$/,
      /^app\/styles\/motion-indicator\.css$/,
    ],
  },
  {
    order: 5110,
    command: 'pnpm exec playwright test tests/e2e/motion-shared-element.spec.ts',
    reason: 'the shared-element morph into detail changed',
    matches: [
      /^src\/shared\/motion\/shared-element\.ts$/,
      /^app\/styles\/motion-morph\.css$/,
      /^src\/widgets\/ontology-map\/ui\/OntologyMapDetailPanel\.tsx$/,
    ],
  },
  {
    order: 5111,
    command: 'pnpm exec playwright test tests/e2e/motion-stagger.spec.ts',
    reason: 'staggered entrance motion changed',
    matches: [
      /^src\/shared\/motion\/stagger\.ts$/,
      /^app\/styles\/motion-stagger\.css$/,
    ],
  },
  {
    order: 5112,
    command: 'pnpm exec playwright test tests/e2e/motion-surfaces.spec.ts',
    reason: 'tooltip fade motion changed',
    matches: [
      /^src\/shared\/ui\/tooltip\.tsx$/,
      /^app\/styles\/motion-surface\.css$/,
    ],
  },
  {
    order: 5113,
    command: 'pnpm exec playwright test tests/e2e/motion-work-status.spec.ts',
    reason: 'work-status and scan progress motion changed',
    matches: [
      /^src\/shared\/motion\/work-status\.tsx$/,
      /^src\/shared\/motion\/work-progress\.tsx$/,
      /^app\/styles\/motion-work\.css$/,
      /^src\/views\/architecture\/ui\/HarnessScanProgressPanel\.tsx$/,
    ],
  },
  {
    order: 5114,
    command: 'pnpm exec playwright test tests/e2e/prose-measure-calibration.spec.ts',
    reason: 'the prose line measure changed',
    matches: [
      /^src\/shared\/ui\/reading-measure\.ts$/,
      /^app\/styles\/tokens\.css$/,
    ],
  },
  {
    order: 5115,
    command: 'pnpm exec playwright test tests/e2e/settings-text-size.spec.ts',
    reason: 'the text size setting changed',
    matches: [
      /^src\/shared\/lib\/preferences\/text-size\.ts$/,
      /^app\/styles\/base-responsive\.css$/,
    ],
  },
  {
    order: 5116,
    command: 'pnpm exec playwright test tests/e2e/text-zoom-ramp.spec.ts',
    reason: 'the root-relative type ramp changed',
    matches: [
      /^app\/styles\/tokens\.css$/,
      /^app\/styles\/base-responsive\.css$/,
    ],
  },
];
