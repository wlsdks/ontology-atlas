---
slug: elements/locale-switch
kind: element
title: Locale Switch
domain: onboarding-ux
---

# Locale Switch

`src/features/locale-switch/ui/LocaleSwitch.tsx` renders the compact EN / KO language toggle used in the public landing and other top-level chrome.

The switch persists the selected locale in `omot:locale`, rewrites the current locale-prefixed URL without a full reload, and keeps each language button at a 32px minimum target. The control should feel quiet in the header while still being easy to hit in the first viewport on phone-sized Context Atlas windows.
