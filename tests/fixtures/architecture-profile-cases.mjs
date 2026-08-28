export const FSD_PROFILE_FRONTMATTER = Object.freeze({
  architecture_schema: 'architecture-profile/v1',
  profile_uid: 'e9f5fe88-3711-4b3c-9f77-3b6f809db82c',
  profile_slug: 'atlas-web',
  project_uid: '8c48b61f-1f75-448e-87a5-6ea2a7b02cf8',
  title: 'Atlas Web Workbench',
  patterns: ['source-organization:feature-sliced-design'],
  scope_paths: ['app/**', 'src/**'],
  exclude_paths: ['**/*.test.ts', '**/*.test.tsx'],
  role_order: ['routing', 'app', 'views', 'widgets', 'features', 'entities', 'shared'],
  role_routing: ['app/**'],
  role_app: ['src/app/**'],
  role_views: ['src/views/**'],
  role_widgets: ['src/widgets/**'],
  role_features: ['src/features/**'],
  role_entities: ['src/entities/**'],
  role_shared: ['src/shared/**'],
  summary_routing: 'Locale-prefixed Next entry wrappers. Metadata and routing only, never logic.',
  summary_views: 'One module per route-level screen, assembled from the layers beneath it.',
  dependency_policy: 'lower-only',
  evidence: ['docs/ARCHITECTURE.md#fsd-layers'],
});

export const HEXAGONAL_PROFILE_FRONTMATTER = Object.freeze({
  architecture_schema: 'architecture-profile/v1',
  profile_uid: '22c86542-7512-4b6e-8c73-77be4730c772',
  profile_slug: 'payments-core',
  project_uid: 'e91d8a44-a95b-4faf-840d-e71c8b2d935c',
  title: 'Payments Core',
  patterns: ['dependency:hexagonal', 'presentation:mvp'],
  scope_paths: ['src/payments/**'],
  role_domain: ['src/payments/domain/**'],
  role_application: ['src/payments/application/**'],
  role_port: ['src/payments/ports/**'],
  role_adapter: ['src/payments/adapters/**'],
  allow_domain: [],
  allow_application: ['domain', 'port'],
  allow_port: ['domain'],
  allow_adapter: ['application', 'port', 'domain'],
  summary_domain: 'The rules the business would still have on paper. Depends on nothing.',
  type_only_dependencies: 'free',
  evidence: ['docs/architecture/payments.md'],
});

export const AMBIGUOUS_PROFILE_FRONTMATTER = Object.freeze({
  architecture_schema: 'architecture-profile/v1',
  profile_uid: '718f3b9c-a798-4bd1-8bc7-91d9d18dce7e',
  profile_slug: 'ambiguous-core',
  project_uid: '85d731ec-d2de-4a11-b7d2-9b3765a97882',
  title: 'Ambiguous Core',
  patterns: ['dependency:custom'],
  scope_paths: ['src/**'],
  role_core: ['src/core/**'],
  role_integration: ['src/integrations/**'],
  allow_core: [],
  allow_integration: ['core'],
  evidence: ['ARCHITECTURE.md'],
});

export const FSD_ALLOWED_EDGES = Object.freeze([
  { from: 'app/[locale]/topology/page.tsx', to: 'src/views/home/index.ts', kind: 'static' },
  { from: 'src/app/providers/AppShell.tsx', to: 'src/views/home/index.ts', kind: 'static' },
  { from: 'src/views/home/ui/HomePage.tsx', to: 'src/widgets/app-nav-rail/index.ts', kind: 'static' },
  { from: 'src/widgets/app-nav-rail/ui/AppNavRail.tsx', to: 'src/shared/lib/nav-destination.ts', kind: 'static' },
  { from: 'src/features/project-edit/model/use-project-edit.ts', to: 'src/entities/project/index.ts', kind: 'static' },
  { from: 'src/entities/project/model/project.ts', to: 'src/shared/lib/date.ts', kind: 'static' },
]);

export const FSD_FORBIDDEN_EDGE = Object.freeze({
  from: 'src/shared/lib/date.ts',
  to: 'src/entities/project/model/project.ts',
  kind: 'static',
});

export const HEXAGONAL_ALLOWED_EDGES = Object.freeze([
  { from: 'src/payments/adapters/http.ts', to: 'src/payments/ports/charge.ts', kind: 'static' },
  { from: 'src/payments/application/charge.ts', to: 'src/payments/domain/payment.ts', kind: 'static' },
]);

export const HEXAGONAL_FORBIDDEN_EDGE = Object.freeze({
  from: 'src/payments/domain/payment.ts',
  to: 'src/payments/adapters/postgres.ts',
  kind: 'static',
});

/**
 * Path-pattern semantics shared by the web occupant join and the MCP conformance scan.
 * One dialect: a profile must place a path identically in the app and in an agent's brief.
 */
export const PATH_MATCH_CASES = Object.freeze([
  { path: 'src/views/home/ui/HomePage.tsx', pattern: 'src/views/**', matches: true },
  { path: 'src/views', pattern: 'src/views/**', matches: false },
  { path: 'src/views/home', pattern: 'src/*/home', matches: true },
  { path: 'src/views/home', pattern: 'src/*', matches: false },
  { path: 'src/views/home', pattern: 'src/*/*', matches: true },
  { path: 'services/checkout/domain/order.ts', pattern: 'services/*/domain/**', matches: true },
  { path: 'services/checkout/nested/domain/order.ts', pattern: 'services/*/domain/**', matches: false },
  { path: 'src/shared/lib/date.ts', pattern: '**/*.test.ts', matches: false },
  { path: 'src/shared/lib/date.test.ts', pattern: '**/*.test.ts', matches: true },
  { path: './src/entities/project/', pattern: 'src/entities/**', matches: true },
  { path: 'src\\entities\\project', pattern: 'src/entities/**', matches: true },
  { path: 'app/[locale]/topology/page.tsx', pattern: 'app/**', matches: true },
  { path: 'src/views/home', pattern: '', matches: false },
]);
