import { RouterProvider } from '@tanstack/react-router';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

import 'virtual:atlas-boot.css';
import 'pretendard/dist/web/variable/pretendardvariable-dynamic-subset.css';
import '../../app/globals.css';
import './fonts.css';

import { createAtlasRouter } from './router/create-atlas-router';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <RouterProvider router={createAtlasRouter()} />
  </StrictMode>,
);
