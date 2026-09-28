import { render, screen, waitFor } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { expect, it, vi } from 'vitest';
import messages from '../../../../messages/en/grayArea.json';
import { GrayAreaInspector } from './GrayAreaInspector';

const runtime = vi.hoisted(() => ({ invoke: vi.fn() }));
vi.mock('@tauri-apps/api/core', () => ({ isTauri: () => true, invoke: runtime.invoke }));
vi.mock('@/i18n/navigation', () => ({ Link: (props: React.AnchorHTMLAttributes<HTMLAnchorElement>) => <a {...props}/> }));

it('a native sample without a local folder offers no download and makes no source read', async () => {
  render(<NextIntlClientProvider locale="en" messages={{grayArea:messages}}>
    <GrayAreaInspector open vaultPath={null} selection={{projectSlug:'sample',uids:['sample'],label:'Sample',key:'sample'}} onClose={()=>{}} onFocus={()=>{}} onPrepare={()=>{}}/>
  </NextIntlClientProvider>);
  await waitFor(() => expect(screen.queryByRole('status')).not.toBeInTheDocument());
  expect(screen.queryByRole('link', {name:'Get the app'})).not.toBeInTheDocument();
  expect(screen.getByTestId('gray-area-local-folder-required')).toBeVisible();
  expect(runtime.invoke).not.toHaveBeenCalled();
});
