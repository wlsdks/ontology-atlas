import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { AgentSkillsPage } from '@/views/agent-skills';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'agentSkills' });
  return { title: t('title') };
}

export default function Page() {
  return <AgentSkillsPage />;
}
