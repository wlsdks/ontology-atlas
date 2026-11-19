---
id: f3d5a661-a3a7-4806-81d3-62e65fee6846
date: 2026-11-19
category: Fixed
---
The app now runs Tauri 2.11.6, which fixes a flaw that let one window read data meant for another (GHSA-w28w-mhc8-qvjv). Atlas opens a single window, so nothing could use the flaw, but the fixed version now ships.
