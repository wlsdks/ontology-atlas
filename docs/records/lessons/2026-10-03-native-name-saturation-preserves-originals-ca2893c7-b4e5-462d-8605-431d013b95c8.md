---
id: ca2893c7-b4e5-462d-8605-431d013b95c8
date: 2026-10-03
kind: gate-gap
status: reported
harness_area: source-import
---
**Observed**: the native Library importer documented "Never overwrites", but after the filename suffix limit its candidate could still exist. The new Rust regression populated999 names and selected different bytes; on the pre-fix source its last original read back as "new selected original" rather than "preserved original". The prior459 native tests did not cover this saturation.
**Cost**: one focused RED and one GREEN native run; compilation about10seconds per focused run, other work time unknown.
**Suspected cause**: the bounded rename loop broke without checking its final candidate. The generic atomic writer correctly replaces a target for its other callers, so atomicity did not establish import no-overwrite intent.
**Proposed change**: none. The importer now refuses an occupied final candidate before copying, paired with an exhausted-slot and last-free-slot byte-preservation regression. Concurrent name reservation remains a separate unmeasured risk; the shared replacement writer is unchanged.
