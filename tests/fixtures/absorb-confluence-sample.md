# Runbook: Payments Reconciliation Service

> Space: PAY-DOCS · Last updated: 2026-06-02 · Owner: payments-platform team

This page documents the reconciliation service that closes the gap between
ledger events and the payment processor's settlement reports. It replaces the
tribal knowledge scattered across three earlier pages. Structure (title,
labels line, H2 sections, a comparison table, a decision log) mirrors a
typical wiki export — this is an original demo document, not a copy of any
real Confluence page or Atlassian asset.

## Escalation Policy

On-call engineers must acknowledge a reconciliation-mismatch page within 15
minutes. Escalate to the payments lead if unresolved after 30 minutes. Do not
silence an alert without a linked incident ticket.

## Commit and Review Conventions

Reconciliation fixes require two reviewers, one of whom must be a payments
domain owner. Commit messages reference the mismatch ticket ID. Squash merges
only — no merge commits on `main`.

## Architecture Overview

The service polls the settlement feed every five minutes and diffs it against
the ledger snapshot.

| Stage | Responsible component | Data source |
|---|---|---|
| Ingest | `settlement-poller` | Processor SFTP export |
| Diff | `ledger-differ` | Internal ledger DB |
| Alert | `mismatch-notifier` | PagerDuty |

## Service Components

- `settlement-poller` — pulls the nightly SFTP export and normalizes rows
- `ledger-differ` — the core diff engine, see below for the pseudocode fence
- `mismatch-notifier` — posts to the on-call PagerDuty schedule

```python
## this looks like a heading but it is actually inside a fenced code block
def diff(ledger_rows, settlement_rows):
    return [r for r in settlement_rows if r.id not in ledger_rows]
```

## Decision Log

2026-04-11 — chose polling over a settlement webhook because the processor's
webhook SLA was unreliable in the pilot region. Revisit if SLA improves.
