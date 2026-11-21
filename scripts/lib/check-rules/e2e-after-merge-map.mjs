export const rules = [
  {
    order: 5014,
    command: 'pnpm exec playwright test tests/e2e/map/hex-board/map-hex-relief.spec.ts',
    reason: "the hex board relief changed",
    matches: [
      /^src\/widgets\/ontology-map\/board\/relief-projection\.ts$/,
      /^src\/views\/home\/ui\/map-surfaces\/TopologyHexBoardSurface\.tsx$/,
    ],
  },
  {
    order: 5017,
    command: 'pnpm exec playwright test tests/e2e/map/labels/map-label-collision.spec.ts',
    reason: "map label collision changed",
    matches: [
      /^src\/widgets\/ontology-map\/render\/label-layout\.ts$/,
      /^src\/widgets\/ontology-map\/render\/labels\.ts$/,
    ],
  },
  {
    order: 5018,
    command: 'pnpm exec playwright test tests/e2e/map/frame-loop/map-layout-morph.spec.ts',
    reason: "the layout morph between map views changed",
    matches: [
      /^src\/widgets\/ontology-map\/morph\/layout-morph\.ts$/,
      /^src\/widgets\/ontology-map\/morph\/MapLayoutMorphOverlay\.tsx$/,
    ],
  },
  {
    order: 5019,
    command: 'pnpm exec playwright test tests/e2e/map/flat-graph/map-flat-graph-star-motion.spec.ts',
    reason: "an opened Flat star's radii, camera zoom or names in motion changed",
    matches: [
      /^src\/widgets\/ontology-map\/flat-graph\/frame\.ts$/,
      /^src\/widgets\/ontology-map\/flat-graph\/motion\.ts$/,
      /^src\/widgets\/ontology-map\/flat-graph\/open-star\.ts$/,
      /^src\/widgets\/ontology-map\/flat-graph\/names\.ts$/,
      /^src\/widgets\/ontology-map\/model\/camera\/camera-easing\.ts$/,
      /^src\/widgets\/ontology-map\/ui\/camera\/use-topology-camera-policy\.ts$/,
      /^app\/styles\/map-graph-tokens\.css$/,
    ],
  },
  {
    order: 5020,
    command: 'pnpm exec playwright test tests/e2e/map/map-open-folder-stays-named.spec.ts',
    reason: "the INDEX folder name during vault re-reads changed",
    matches: [
      /^src\/entities\/vault-session\/model\/LocalVaultProvider\.tsx$/,
      /^src\/widgets\/topology-index-panel\/ui\/TopologyIndexPanel\.tsx$/,
    ],
  },
];
