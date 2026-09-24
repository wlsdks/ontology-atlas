"use client";

import { useEffect } from "react";
import { reportWebviewError } from "@/shared/lib/report-webview-error";
import { RouteErrorScreen } from "@/views/terminal-state";

interface Props {
  error: Error & { digest?: string };
  reset: () => void;
}

/**
 * Root error boundary. It replaces the locale layout, so the screen mounts its own locale
 * provider and reads the `routeError` messages in the visitor's language.
 */
export default function RouteError({ error, reset }: Props) {
  useEffect(() => {
    console.error("[route-error]", error);
    // The installed app has no console anyone reads; the same error goes to the app log.
    reportWebviewError("render", error);
  }, [error]);

  return <RouteErrorScreen digest={error.digest} onRetry={reset} />;
}
