import { RouterProvider } from '@tanstack/react-router';
import { StrictMode } from 'react';
import { createRoot, hydrateRoot } from 'react-dom/client';

import 'virtual:atlas-boot.css';
import 'pretendard/dist/web/variable/pretendardvariable-dynamic-subset.css';
import '../../app/globals.css';
import './fonts.css';

import { readEmbeddedPage, SiteDocument } from './document/SiteDocument';
import { createAtlasRouter } from './router/create-atlas-router';
import { replayBuildFacts } from './routes/-site/build-facts';

const page = readEmbeddedPage();
const router = createAtlasRouter({ buildFacts: replayBuildFacts(page?.entry?.recordedFacts ?? {}) });
const screen = <RouterProvider router={router} />;

// A prerendered page is hydrated at the address it was written for, after its routes have loaded, so the first
// render is the one the HTML holds. React adopts the whole document, not `#root` alone: ids made by `useId`
// follow a component's place in the tree, so only the same tree above `#root` makes the same ids. Anywhere else,
// as in the app's one `index.html`, the router renders fresh into `#root`.
if (page?.entry?.hydratesPath === window.location.pathname) {
  // The prerender wrote the page with no suspense boundary above the routes, as a router renders on a server.
  // Marking the router as server-rendered keeps the first client render the same shape, so React adopts the HTML.
  router.ssr = { manifest: undefined };
  await router.load();
  hydrateRoot(
    document,
    <StrictMode>
      <SiteDocument page={page}>{screen}</SiteDocument>
    </StrictMode>,
  );
} else {
  createRoot(document.getElementById('root')!).render(<StrictMode>{screen}</StrictMode>);
}
