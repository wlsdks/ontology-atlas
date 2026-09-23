# Optional Jev evidence check

In the installed macOS app, open a local vault, then **Agents → Jev**. Save a TypeSafe API key once in this Mac's Keychain; Atlas displays only its last four characters and lets you remove it. Paste a specific claim and the source passage that supports or challenges it. Read the example and the exact JSON preview, then choose **Send to Jev**. The app sends that text only to `https://api.typesafe.ai/v1/systemone` with `jev-latest` after your action. The response labels the evidence `supported`, `contradicted`, or `insufficient` with a confidence estimate. It is advice for your review: Atlas does not patch the vault or accept project meaning from this answer. A local metadata receipt is reserved before the request and excludes the key and text. The Keychain protects a saved key between launches, although access to an unlocked account or a compromised process remains a security risk. Remove the key in the Jev tab when you no longer need it.

The website presents an Agents example only; it cannot store a Jev key or send a judgment. The source-only synthetic probe below remains useful when you want to test the endpoint without sharing project text.

Atlas keeps vault meaning in local Markdown and requires human review. The source example tests the same hosted choice judgment with fixed synthetic text. It is not an Atlas CLI command, automatic reviewer, or meaning-acceptance gate. It reads no vault or repository files and sends only the fixed text shown in its preview.

The example uses the [documented TypeSafe HTTP API](https://docs.typesafe.ai/api) directly, so it adds no SDK dependency or vendor code to Atlas. TypeSafe also publishes an [agent skill](https://docs.typesafe.ai/agent-skill) with API guidance. That skill runs in an agent environment; it does not itself connect Atlas to Jev. The [JavaScript SDK is MIT-licensed](https://github.com/typesafe-ai/typesafe-sdk-js/blob/main/LICENSE), while use of the hosted API is subject to TypeSafe's [separate service agreement](https://typesafe.ai/legal/mca). Sections 2.1–2.2 allow API integration into a customer's application under the agreement; Section 2.3 restricts standalone redistribution of the service and development of a similar or competing service. The agreement does not explicitly settle every open-source, independently keyed distribution scenario. Atlas distributes original client code and no credential or hosted service. Seek TypeSafe's written confirmation before presenting the built-in, bring-your-own-key distribution as contractually cleared, and review the data terms before sending real project material.

From a source checkout with Node.js 24, inspect the exact request first:

```sh
node examples/external-judgment/probe.mjs
```

The request contains one claim supported by its evidence, one contradicted by the same evidence, and one that the evidence cannot settle. All three ask Jev for `supported`, `contradicted`, or `insufficient`. The preview makes no network call and requires no key. To run the same fixed request against the hosted API later, create a key in the [TypeSafe console](https://console.typesafe.ai), set it as `TYPESAFE_API_KEY` in your local shell or secret manager, and run:

```sh
mkdir -p -m 700 "$HOME/.local/state/ontology-atlas/external-judgment"
node examples/external-judgment/probe.mjs --send --audit-dir="$HOME/.local/state/ontology-atlas/external-judgment"
```

Do not put the key in a command argument, repository file, or chat. `--send` requires an existing private audit directory and reserves a mode-0600 JSONL receipt before HTTP. The receipt records the destination, model, request byte count and SHA-256, then completion or failure; it omits the key and request text. The command prints the provider's choice distribution as advice and never writes or accepts ontology meaning. A failed or malformed response is reported as a failure. The example makes one call without automatic retries, so a transient rate limit or overload can be retried deliberately after inspection.

To judge whether Jev is useful here, compare all three returned choices with the previewed evidence. A `supported` result for the wrong-owner claim, or a definitive answer where the evidence is insufficient, is a reason to revise or stop the experiment. On 2026-09-23, one live request containing all three synthetic claims returned `supported`, `contradicted`, and `insufficient` respectively from `jev-1.13.0`, each with probability 1. This confirms the endpoint and these simple judgments, not calibration or quality on real ontology candidates. Mock tests verify the request, explicit transfer, receipt, and response handling.
