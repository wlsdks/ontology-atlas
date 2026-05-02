"use client";

import { useSearchParams } from "next/navigation";
import { ProjectEditorPage } from "@/views/project-editor";

interface Props {
  slug: string;
}

export function ProjectEditClientPage({ slug }: Props) {
  const searchParams = useSearchParams();
  const returnTo = searchParams.get("returnTo") ?? undefined;
  const savedNotice = searchParams.get("saved") === "1";

  return (
    <ProjectEditorPage
      mode="edit"
      slug={slug}
      returnTo={returnTo}
      savedNotice={savedNotice}
    />
  );
}
