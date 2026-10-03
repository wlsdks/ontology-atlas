import { absoluteUrl } from '@/shared/config';

export interface ProjectBreadcrumbLabels {
  home: string;
  projects: string;
}

export function projectBreadcrumb(
  locale: string,
  labels: ProjectBreadcrumbLabels,
  projectName: string,
) {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      {
        '@type': 'ListItem',
        position: 1,
        name: labels.home,
        item: absoluteUrl(`/${locale}/download/`),
      },
      {
        '@type': 'ListItem',
        position: 2,
        name: labels.projects,
        item: absoluteUrl(`/${locale}/projects/`),
      },
      {
        '@type': 'ListItem',
        position: 3,
        name: projectName,
      },
    ],
  };
}
