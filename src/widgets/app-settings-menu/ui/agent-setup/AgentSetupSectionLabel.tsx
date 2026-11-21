import type { ReactNode } from 'react';
import { SETTINGS_SECTION_LABEL } from '../settings-primitives';

export function AgentSetupSectionLabel({ children }: { children: ReactNode }) {
  return <h4 className={SETTINGS_SECTION_LABEL}>{children}</h4>;
}
