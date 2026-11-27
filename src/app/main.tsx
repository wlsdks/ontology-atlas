import { RouterProvider } from '@tanstack/react-router';
import { StrictMode } from 'react';
import { createRoot, hydrateRoot } from 'react-dom/client';

import 'virtual:atlas-boot.css';
import 'pretendard/dist/web/variable/pretendardvariable-dynamic-subset.css';
import '../../app/globals.css';
import './fonts.css';

import { createAtlasRouter } from './router/create-atlas-router';
import { readEmbeddedFacts } from './routes/-site/build-facts';

const root = document.getElementById('root')!;
const router = createAtlasRouter({ buildFacts: readEmbeddedFacts() });
const screen = (
  <StrictMode>
    <RouterProvider router={router} />
  </StrictMode>
);

// A prerendered page is hydrated at the address it was written for, after its routes have loaded, so the
// first render is the one the HTML holds. Anywhere else, as in the app's one `index.html`, the router renders fresh.
if (root.dataset.prerendered === window.location.pathname) {
  await router.load();
  hydrateRoot(root, screen);
} else {
  createRoot(root).render(screen);
}
