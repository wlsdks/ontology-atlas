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
  /* One locale line, on one of the two roles that declare a sentence, so the fixture also proves
     the untranslated role and the role with no sentence at all keep behaving as before. */
  summary_views_ko: '라우트가 열 수 있는 화면 하나마다 모듈 하나입니다.',
  dependency_policy: 'lower-only',
  dependency_usages: ['value'],
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
  dependency_usages: ['value'],
  evidence: ['docs/architecture/payments.md'],
});

/**
 * ⚠️ **Several roles at one rank.** Every other fixture is a chain — one role per rank — and a
 * chain can always be made to fit by turning it, which is why the drawing turns down when it stops
 * fitting across. A fan cannot: three siblings between a shell and a core are three lanes wide
 * whichever way the chain runs, so this is the shape that keeps the covered-edge affordances
 * necessary. It exists because a claim about "the drawing is never cut" was true of the chains on
 * hand and not of every profile someone can write.
 */
export const FAN_PROFILE_FRONTMATTER = Object.freeze({
  architecture_schema: 'architecture-profile/v1',
  profile_uid: 'b1d4f0c2-9e77-4a51-9f3b-2c6a8e5d7f10',
  profile_slug: 'storefront-fan',
  project_uid: 'e91d8a44-a95b-4faf-840d-e71c8b2d935c',
  title: 'Storefront Fan',
  patterns: ['dependency:layered'],
  scope_paths: ['src/**'],
  role_shell: ['src/shell/**'],
  role_billing: ['src/billing/**'],
  role_catalog: ['src/catalog/**'],
  role_shipping: ['src/shipping/**'],
  role_core: ['src/core/**'],
  allow_shell: ['billing', 'catalog', 'shipping'],
  allow_billing: ['core'],
  allow_catalog: ['core'],
  allow_shipping: ['core'],
  allow_core: [],
  summary_shell: 'The one way in, which hands the request to whichever area owns it.',
  summary_core: 'What every area depends on and which depends on none of them.',
  evidence: ['docs/architecture/fan.md'],
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
  { from: 'app/[locale]/topology/page.tsx', to: 'src/views/home/index.ts', kind: 'static', importUsage: 'value' },
  { from: 'src/app/providers/AppShell.tsx', to: 'src/views/home/index.ts', kind: 'static', importUsage: 'value' },
  { from: 'src/views/home/ui/HomePage.tsx', to: 'src/widgets/app-nav-rail/index.ts', kind: 'static', importUsage: 'value' },
  { from: 'src/widgets/app-nav-rail/ui/AppNavRail.tsx', to: 'src/shared/lib/nav-destination.ts', kind: 'static', importUsage: 'value' },
  { from: 'src/features/project-edit/model/use-project-edit.ts', to: 'src/entities/project/index.ts', kind: 'static', importUsage: 'value' },
  { from: 'src/entities/project/model/project.ts', to: 'src/shared/lib/date.ts', kind: 'static', importUsage: 'value' },
]);

export const FSD_FORBIDDEN_EDGE = Object.freeze({
  from: 'src/shared/lib/date.ts',
  to: 'src/entities/project/model/project.ts',
  kind: 'static',
  importUsage: 'value',
});

export const HEXAGONAL_ALLOWED_EDGES = Object.freeze([
  { from: 'src/payments/adapters/http.ts', to: 'src/payments/ports/charge.ts', kind: 'static', importUsage: 'value' },
  { from: 'src/payments/application/charge.ts', to: 'src/payments/domain/payment.ts', kind: 'static', importUsage: 'value' },
]);

export const HEXAGONAL_FORBIDDEN_EDGE = Object.freeze({
  from: 'src/payments/domain/payment.ts',
  to: 'src/payments/adapters/postgres.ts',
  kind: 'static',
  importUsage: 'value',
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

/**
 * ⚠️ **Every way `summary_<role>_<locale>` can be wrong, in one place both parsers read.**
 *
 * A locale is matched by shape, not by the application's locale list, so the last underscore is
 * only a locale boundary when what follows is two letters. That single rule produces all four
 * rows: a translated role that does not exist, a translation with no canonical sentence to
 * restate, an empty value, and a suffix that is not a locale at all — which falls back to the
 * role-id reading and is refused as the unknown role `views_kor`, not accepted as Korean.
 */
export const LOCALIZED_SUMMARY_REJECT_CASES = Object.freeze([
  Object.freeze({
    name: 'a localized summary for a role that does not exist',
    frontmatter: Object.freeze({ ...FSD_PROFILE_FRONTMATTER, summary_ghost_ko: '없는 역할입니다.' }),
    message: /summary_ghost_ko describes a role that does not exist\./,
  }),
  Object.freeze({
    name: 'a translation of a sentence the profile never wrote',
    frontmatter: Object.freeze({
      ...Object.fromEntries(
        Object.entries(FSD_PROFILE_FRONTMATTER).filter(([key]) => key !== 'summary_views'),
      ),
      summary_views_ko: '라우트가 열 수 있는 화면 하나마다 모듈 하나입니다.',
    }),
    message: /summary_views_ko translates summary_views, which this profile does not declare\./,
  }),
  Object.freeze({
    name: 'an empty localized summary',
    frontmatter: Object.freeze({ ...FSD_PROFILE_FRONTMATTER, summary_views_ko: '   ' }),
    message: /summary_views_ko must be a non-empty string\./,
  }),
  Object.freeze({
    name: 'a suffix that is not a locale, read as the role id it spells',
    frontmatter: Object.freeze({ ...FSD_PROFILE_FRONTMATTER, summary_views_kor: 'Not a locale.' }),
    message: /Invalid architecture role id: views_kor\./,
  }),
]);
