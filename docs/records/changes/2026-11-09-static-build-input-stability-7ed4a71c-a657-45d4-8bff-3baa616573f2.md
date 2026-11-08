---
id: 7ed4a71c-a657-45d4-8bff-3baa616573f2
date: 2026-11-09
category: Fixed
---
Static export reuse now rejects builds whose inputs changed while compilation ran, and invalidates old reuse stamps before rebuilding. A failed or mixed-input build cannot be mistaken for current output.
