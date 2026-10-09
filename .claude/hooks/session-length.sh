#!/usr/bin/env bash
exec node -e '
const fs = require("fs");
const path = require("path");
let input = "";
process.stdin.on("data", (chunk) => { input += chunk; });
process.stdin.on("end", () => {
  let payload;
  try { payload = JSON.parse(input); } catch { return; }
  const transcript = payload.transcript_path;
  if (!transcript || !fs.existsSync(transcript)) return;
  const turns = Number(process.env.SESSION_LENGTH_TURNS || 300);
  const hours = Number(process.env.SESSION_LENGTH_HOURS || 8);
  const ids = new Set();
  let first = null;
  for (const line of fs.readFileSync(transcript, "utf8").split("\n")) {
    if (!first) first = /"timestamp":"([^"]+)"/.exec(line)?.[1] ?? null;
    if (line.includes("\"type\":\"assistant\"")) {
      const id = /"id":"(msg_[^"]+)"/.exec(line)?.[1];
      if (id) ids.add(id);
    }
  }
  const ageHours = first ? (Date.now() - Date.parse(first)) / 3600000 : 0;
  const state = path.join(process.env.TMPDIR || "/tmp", `claude-session-length-${String(payload.session_id || "unknown").replace(/[^\w-]/g, "")}`);
  const last = fs.existsSync(state) ? Number(fs.readFileSync(state, "utf8")) || 0 : 0;
  const due = ids.size >= turns || ageHours >= hours;
  if (!due || ids.size < last + turns / 2) return;
  fs.writeFileSync(state, String(ids.size));
  process.stdout.write(JSON.stringify({
    systemMessage: `This session has run ${ids.size} turns over ${Math.round(ageHours)}h, and every turn re-reads its whole context. Finish the current task, then start a fresh session with /clear.`,
  }));
});
'
