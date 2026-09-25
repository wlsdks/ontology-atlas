---
id: ac02840d-c96d-45d0-83d4-8ebf11daa06c
date: 2026-09-25
---
## 2026-09-25 — Each settings pane opens with its own head, and the nav steps down to the row size

**Why**: measured in the settings sheet at 1512 and 1920: the left nav at 14px was the loudest type in the sheet, louder than every setting it led to (row titles 12.5px, captions 11px), and nothing on the right said which pane you were in. Five panes opened five ways: a free-floating 11px intro (Update, Expand, Footprint), a dot-joined 12.5px fragment (API Key), or straight into a card (Screen, Workspace).
**Prior**: overturns the 2026-08-02 "settings sheet is outside the scale-lock contract" clause that set the nav to `text-body-lg` as the attention winner, by its own falsifier (the 14px nav competed with the 12.5px pane, so "where to go" read before "what to change"). Overturns the code-level rule from 2026-07-29 that a pane does not repeat its section title. Keeps the 2026-07-29 fixed sheet size (880 by 672) and the 2026-08-02 derivation of 672.
**Decision**: every pane opens with one `SettingsPaneHead`: the section name at the title step (16px) and one finished sentence saying what the pane decides, on the same text start line as the row labels. The nav steps down to `text-body` (12.5px). A pane that had its own intro line gives it to the head, and nothing below the head says its sentence again. The Screen pane must still fit 672 with its bottom padding visible, so its two guide rows become one.
**Dissent**: the 2026-07-29 rule: the nav already names the pane, so the head's title is the same word twice side by side, and it costs about 50px of a fixed-height sheet.
**Falsifier**: a person reads the nav label and the head title as a stutter, or a pane stops fitting the 672 sheet at the 1040 by 720 minimum window because of the head. Either one folds the title back into the nav and keeps only the sentence.
**Owner**: stark
