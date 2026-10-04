---
id: 944ddfed-e6c0-4083-94c1-d4bbb686f034
date: 2026-10-04
kind: gate-gap
status: reported
harness_area: desktop-release
---
**Observed**: Pages run37226465206 built and deployed1.6.0 successfully, then hosted verification rejected a visible localized title. The HTML text extractor replaced styled inline spans, including an empty underline span, with spaces, splitting adjacent letters in the actual sentence. The catalogue-derived fixture had flattened the rich markup and hid that defect. A fixture preserving real styled/empty span structure is RED with the old extractor and GREEN with the corrected extractor; the actual live site also passes.
**Cost**: One post-deploy verification failure; no release artifact was changed or rebuilt for this correction.
**Suspected cause**: The text extractor treated inline presentation boundaries as word boundaries. Fixture text and actual rich rendering were different shapes.
**Proposed change**: none; preserve adjacent text through spans while retaining section/missing-copy, updater and SEO checks. Keep a realistic rich-markup regression and verify the live page after deployment.
