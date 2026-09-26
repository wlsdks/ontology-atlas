/** Playwright specs that drive the map and its ontology panels. */

export const rules = [
  {
    order: 740,
    command: 'pnpm exec playwright test tests/e2e/map-viewport-reframe.spec.ts',
    reason: 'camera free-area measurement or its selected-inspector owner changed',
    matches: [
      /^src\/widgets\/ontology-map\/interaction\/free-area\.ts$/,
      /^src\/views\/home\/ui\/HomePage\.tsx$/,
    ],
  },
  {
    order: 790,
    command: 'pnpm exec playwright test tests/e2e/ontology-ui.spec.ts',
    reason: 'topology route-state and legacy redirect behavior changed',
    matches: [/^src\/views\/home\/ui\/HomePage\.tsx$/],
  },
  {
    order: 800,
    command: 'pnpm exec playwright test tests/e2e/contextual-meaning-editor.spec.ts',
    reason: 'ontology change-review rendering changed',
    matches: [
      /^src\/features\/ontology-change-review\/ui\/OntologyChangeReview\.tsx$/,
    ],
  },
  {
    order: 810,
    command: 'pnpm exec playwright test tests/e2e/touch-target-contract.spec.ts',
    reason: 'selected-node panel touch targets changed',
    matches: [/^src\/widgets\/ontology-map\/ui\/OntologyMapDetailPanel\.tsx$/],
  },
];
