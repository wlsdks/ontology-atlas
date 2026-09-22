import type { useTopologyGraphProjection } from "./use-topology-graph-projection";

import { getProjectRuntimeDetailHref } from "@/entities/project";
import { useRouter } from "@/i18n/navigation";
import { useCallback, useEffect } from "react";

interface Options {
  prefetchedProjectHrefsRef: React.RefObject<Set<string>>;
  router: ReturnType<typeof useRouter>;
  preloadedImageUrlsRef: React.RefObject<Set<string>>;
  selectedSlug: string | null;
  topologyGraphProjection: Pick<ReturnType<typeof useTopologyGraphProjection>, "projectBySlug" | "hubs">;
}
export function useTopologyAssetPreload({ prefetchedProjectHrefsRef, router, preloadedImageUrlsRef, selectedSlug, topologyGraphProjection }: Options) {
  const { projectBySlug, hubs } = topologyGraphProjection;


  const preloadProjectAsset = useCallback(
    (slug: string) => {
      const project = projectBySlug.get(slug);
      if (!project) return;

      const href = getProjectRuntimeDetailHref(slug);
      if (!prefetchedProjectHrefsRef.current.has(href)) {
        prefetchedProjectHrefsRef.current.add(href);
        router.prefetch(href);
      }

      project.screenshots.slice(0, 2).forEach((url) => {
        if (!url || preloadedImageUrlsRef.current.has(url)) return;
        preloadedImageUrlsRef.current.add(url);
        const image = new window.Image();
        image.decoding = "async";
        image.src = url;
        image.decode?.().catch(() => { });
      });
    },
    [prefetchedProjectHrefsRef, preloadedImageUrlsRef, projectBySlug, router],
  );

  useEffect(() => {
    if (typeof window === "undefined") return;

    const candidateSlugs = new Set<string>();
    if (selectedSlug) candidateSlugs.add(selectedSlug);

    // The top five hubs are preloaded in the background so their screenshots are
    // already there if the user clicks a hub straight after arriving. Run in an idle
    // callback so it cannot disturb the current interaction.
    const addTopHubs = () => {
      hubs.slice(0, 5).forEach((hub) => candidateSlugs.add(hub.slug));
      candidateSlugs.forEach(preloadProjectAsset);
    };
    const win = window as Window & {
      requestIdleCallback?: (cb: () => void) => number;
      cancelIdleCallback?: (id: number) => void;
    };
    if (typeof win.requestIdleCallback === 'function') {
      const id = win.requestIdleCallback(addTopHubs);
      return () => win.cancelIdleCallback?.(id);
    }
    const handle = window.setTimeout(addTopHubs, 200);
    return () => window.clearTimeout(handle);
  }, [hubs, preloadProjectAsset, selectedSlug]);
}
