---
slug: elements/root-locale-redirect
kind: element
title: Root Locale Redirect Fallback
domain: onboarding-ux
---

`src/shared/ui/locale-redirect.tsx` renders the static-export root `/` locale redirect fallback.

It detects `omot:locale` or `navigator.language`, redirects to `/en/` or `/ko/`, and now keeps a dark inline fallback with direct locale links so the macOS app does not show a blank white root screen when hydration or stale bundled assets fail before the redirect completes.