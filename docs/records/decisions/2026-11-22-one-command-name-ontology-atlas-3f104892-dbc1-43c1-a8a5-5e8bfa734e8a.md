---
id: 3f104892-dbc1-43c1-a8a5-5e8bfa734e8a
date: 2026-11-22
---
## 2026-11-22 — The command has one name, `ontology-atlas`

**Why**: the rebuilt command needs a name before anything shows it. MongoDB's Atlas CLI is common among tier-1 developers and installs `atlas` through Homebrew and npm. Shipping `atlas` beside `ontology-atlas` would put a command in docs, screenshots and agent instructions that some readers do not have, and a global npm install would collide with the existing file (EEXIST). Checked on 2026-11-22: `npm view` returned E404 for `ontology-atlas` and `@ontology-atlas/cli`, so both are free; `atlas` is taken (`1.0.0-alpha.0`).
**Prior**: narrows 2026-11-22 "The Atlas command is rebuilt as a door into the app, and it is published" (`e64b4ebe-ea86-48bc-a629-6cc1b8a3dd30`), whose first draft shipped both names. `cli/package.json`'s two `bin` entries go with the old command.
**Decision**: the package, the command, the plugin and the Homebrew formula are all named `ontology-atlas`. There is no `atlas` command and no fallback when another program holds that name. The app's install row never writes over an existing file. Printed lines name the command literally. A person who wants it shorter makes their own alias. The npm name is not reserved until the first publish, which still needs the owner's yes at that moment.
**Dissent**: `atlas` is five characters and reads like `git`; fourteen characters on every line a person types is a cost paid daily. The first draft's seat held this.
**Falsifier**: a probe participant calls the name too long to type; then revisit it with a short name that the npm registry and Homebrew both show is free.
**Owner**: jinan (decided through the lead, 2026-11-22)
