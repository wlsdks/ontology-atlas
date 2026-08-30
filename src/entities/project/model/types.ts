/**
 * Project category id — a free string matching either an `entities/category`
 * default or a vault frontmatter taxonomy.
 */
export type ProjectCategory = string;

/**
 * Project status id — a free string matching either an `entities/status` default
 * or a vault frontmatter taxonomy.
 */
type ProjectStatus = string;

interface ProjectLink {
  label: string;
  url: string;
}

interface ProjectTimeline {
  startedAt?: Date;
  launchedAt?: Date;
}

export interface ProjectPosition {
  x: number;
  y: number;
}

/**
 * The project domain model used inside the app.
 *
 * Source of truth: the `<slug>.md` frontmatter with `kind: project` — the user's
 * vault in local mode, the build-time dogfood manifest in static mode.
 *
 * **Every field the frontmatter does not state is optional.** Derivation used to
 * stamp fabricated defaults (`category: 'uncategorized'`, `status: 'active'`,
 * `isHub: false`, `position: { x:0, y:0 }`), so the web displayed information the
 * vault does not have — a direct violation of "frontmatter is the graph". The UI
 * shows nothing for an undefined field, or says explicitly that it is a placeholder.
 *
 * `createdAt` / `updatedAt` derive from frontmatter or the file mtime; filesystem
 * metadata is not fabrication.
 */
export interface Project {
  slug: string;
  name: string;
  nameEn?: string;
  /** From vault frontmatter `category:`; undefined when absent. */
  category?: ProjectCategory;
  /** From vault frontmatter `status:`; undefined when absent. */
  status?: ProjectStatus;
  description: string;
  detail?: string;
  tags: string[];
  stack: string[];
  links: ProjectLink[];
  dependencies: string[];
  owner?: string;
  icon?: string;
  screenshots: string[];
  /** From vault frontmatter `timeline:` / `startedAt:` / `launchedAt:`; undefined when absent. */
  timeline?: ProjectTimeline;
  progress?: number;
  /** True only when the vault frontmatter states `isHub:`. Absent is undefined, which is not false. */
  isHub?: boolean;
  /** Only when frontmatter states `position:` or `positionX/Y:`; undefined otherwise. */
  position?: ProjectPosition;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * The partial type used as input when creating or editing. The form is a tool for
 * *writing vault frontmatter*, so it keeps category/status/position required
 * form-locally and records them on submit. `Project` itself stays honest about what
 * the vault may not have, and leaves them optional.
 */
export type ProjectInput = {
  slug: string;
  name: string;
  /** Editing can preserve "unset" so it never invents a typed fact the original lacked. */
  category?: ProjectCategory;
  status?: ProjectStatus;
  description: string;
  position?: ProjectPosition;
  nameEn?: string;
  detail?: string;
  tags?: string[];
  stack?: string[];
  links?: ProjectLink[];
  dependencies?: string[];
  owner?: string;
  icon?: string;
  screenshots?: string[];
  timeline?: ProjectTimeline;
  progress?: number;
  isHub?: boolean;
};
