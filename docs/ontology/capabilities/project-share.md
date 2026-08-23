---
uid: 034ea9b5-5381-46c3-ae91-b1dc6ad8b184
slug: capabilities/project-share
kind: capability
title: Project Link Copy
display_ko: 프로젝트 링크 복사
domain: domains/project-portfolio
elements: []
path: src/features/project-share
created_by: "agent:unknown"
---

## Definition
The ability to generate a detail URL reflecting the current locale and basePath from the project details top bar or drawer,
copy it to the clipboard, and provide success/failure feedback.

## Inclusion / Exclusion
- Included: Project detail URL generation, clipboard copy, state/toast/aria-live feedback,
  project details top bar and project drawer entry points.
- Excluded: permissions/invitations/expiry/server storage/collaborative sharing, E2E guarantees for destination accessibility.

## Evidence
- `src/features/project-share/ui/CopyProjectLinkButton.tsx`: URL generation/copy/feedback
- `src/features/project-share/ui/CopyProjectLinkButton.test.tsx`: locale URL,
  slug serialization and copy call verification
- `src/views/project-detail/ui/ProjectDetailPage.tsx` and
  `src/widgets/project-drawer/ui/ProjectDrawer.tsx`: two user entry points

## Confidence
medium: Core URL/copy unit flows are verified, but actual clipboard/destination E2E is unverified.
