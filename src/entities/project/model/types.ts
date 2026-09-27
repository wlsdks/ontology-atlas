/** A free string: an `entities/category` default or a vault taxonomy. */
export type ProjectCategory = string;

/** A free string: an `entities/status` default or a vault taxonomy. */
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

/** A `kind: project` document; any field the frontmatter omits stays undefined rather than defaulted. */
export interface Project {
  slug: string;
  /** Frontmatter `name`/`title`. */
  name: string;
  nameEn?: string;
  /** `display_<locale>` names, drawn via `projectDisplayName`. */
  displayNames?: Record<string, string>;
  category?: ProjectCategory;
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
  timeline?: ProjectTimeline;
  progress?: number;
  /** Undefined unless stated; absent is not false. */
  isHub?: boolean;
  position?: ProjectPosition;
  createdAt: Date;
  updatedAt: Date;
}

/** Form input: category, status and position are required when writing frontmatter. */
export type ProjectInput = {
  slug: string;
  name: string;
  /** Editing can keep "unset". */
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
