---
slug: elements/locale-switch
kind: element
title: Locale Switch
domain: onboarding-ux
---

# Locale Switch

`src/features/locale-switch/ui/LocaleSwitch.tsx` renders the compact EN / KO language toggle used in the public landing and other top-level chrome.

The switch persists the selected locale in `ontology-atlas:locale`, rewrites
only the current URL's locale segment without a full reload, and keeps each
language button at a 32px minimum target. Raw query and hash text pass through
unchanged so duplicate key order, original encoding, selected Insights tabs,
map nodes, and other URL-addressed task state survive an EN / KO transition.
The replacement uses no new history entry and suppresses scroll reset. The
control should feel quiet in the header while still being easy to hit in the
first viewport on phone-sized Ontology Atlas windows.
