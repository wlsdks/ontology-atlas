'use client';

import { startPreferredSampleDownload } from '@/entities/vault-session';

// Runs when this route's code loads, before the map renders, so the web sample's download
// overlaps the page's other scripts instead of following hydration by a round trip.
startPreferredSampleDownload();

export function MapSampleHead() {
  return null;
}
