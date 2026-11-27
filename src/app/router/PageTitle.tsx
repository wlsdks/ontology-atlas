import { useTranslations } from 'use-intl';

interface PageTitleProps {
  namespace: string;
  messageKey: string;
  /** The title stands alone, without the site name after it. */
  absolute?: boolean;
}

/** The screen's `document.title`, written by React's own document metadata so it follows each navigation. */
export function PageTitle({ namespace, messageKey, absolute = false }: PageTitleProps) {
  const t = useTranslations(namespace);
  const tMetadata = useTranslations('metadata');
  const title = t(messageKey);
  return <title>{absolute ? title : `${title} · ${tMetadata('siteName')}`}</title>;
}
