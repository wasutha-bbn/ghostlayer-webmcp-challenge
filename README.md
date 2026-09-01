# GhostLayer — Agent speed, human authority

GhostLayer is a human-governed WebMCP prototype. Instead of making an agent infer actions from pixels and DOM structure, the website publishes explicit, typed tools that the agent can discover and call. Fast read operations can complete immediately; a consequential operation stays pending until the person sees the exact effect and approves it.

The WebMCP Challenge edition is a deliberately safe, fictional CRM sandbox. It exposes two page-owned tools:

- `find_customer` — an exact, read-only lookup over three fictional records.
- `create_invoice_draft` — a bounded draft operation that pauses at a visible human approval boundary.

The core idea is simple: **the agent prepares; the human remains the authority**.

## Challenge links

- Live judge sandbox: **[PENDING — add the final public URL before submission]**
- Public source repository: **[PENDING — add the final public repository URL before submission]**
- Public demo video: **[PENDING — add the final public YouTube URL before submission]**
- Ready-to-paste submission copy: [docs/CHALLENGE-SUBMISSION.md](docs/CHALLENGE-SUBMISSION.md)
- Demo narration and shot plan: [docs/DEMO-SCRIPT.md](docs/DEMO-SCRIPT.md)
- License: [Apache License 2.0](LICENSE)

The public challenge deployment is a standalone, fictional, client-only Site with no private routes, database, credentials, or production integrations. A separate owner-only prototype exists outside this public package; it is not the challenge link or part of this repository.

## Try the judge flow

Open the public sandbox in a WebMCP-capable browser or agent surface and use this exact prompt:

> Use GhostLayer's tools to find the fictional customer with phone +1-202-555-0120. Then prepare a $125 invoice draft for “September accessibility audit”. Stop and let me approve before anything is created.

The intended sequence is:

1. The agent discovers `find_customer` and `create_invoice_draft` from the page's WebMCP surface.
2. `find_customer` returns the structured fictional customer `CUS-2001`.
3. `create_invoice_draft` validates the customer, description, and amount, then waits. The invoice count remains zero.
4. The human can reject and create nothing, or approve and create one tab-local draft.
5. Repeating the same normalized request returns the same demo invoice rather than adding a duplicate row.
6. The human can remove both tools with **Pause agent tools**, restore them with **Resume agent tools**, or clear all demo state with **Reset sandbox**.

If WebMCP is unavailable in the current browser, the two visible forms exercise the same lookup, validation, approval, rejection, replay, pause, and reset behavior.

## Why WebMCP matters here

Traditional browser agents often have to guess which control to click, how a page encodes state, and whether an action is safe. GhostLayer moves that contract into the website:

- the tool names and descriptions state intent;
- strict input and output schemas make the exchange machine-readable;
- read-only and consequential actions have different handling;
- the application owns the approval UX and business rule;
- tool lifecycle follows page lifecycle and a human kill switch;
- automation no longer depends on the visual position of a button.

WebMCP is not treated as an authorization boundary. GhostLayer validates inputs and outputs inside the provider and keeps the human decision inside the application.

## Public sandbox safety model

The challenge Site is designed for safe, open judge access.

| Boundary | Challenge behavior |
|---|---|
| Data | Three plainly labeled fictional customers |
| Storage | React memory in the current browser tab only |
| Network | No application API calls, D1 database, R2 bucket, or external CRM |
| Credentials | No application sign-in, application cookies, passwords, tokens, or payment data |
| Approval | Two-minute visible decision window; expiry and rejection create nothing |
| Input limits | Known customer ID, description of 1–160 characters, USD 0.01–5,000, at most two decimals |
| Replay | Same normalized request returns the already-created tab-local demo invoice |
| Volume | Maximum eight drafts per tab; reset is always available |
| Tool control | Pausing disposes both WebMCP registrations; resuming registers them again |
| Route isolation | The standalone judge Site exposes only `/`; private pilot and API paths are absent |

Reloading, resetting, closing the tab, or opening a new tab clears the challenge state. The sandbox demonstrates a governed human-agent interaction pattern; it does not claim durable or globally exactly-once execution.

## Architecture

```text
WebMCP-capable agent
        │ discover and call typed page-owned tools
        ▼
document.modelContext
        │
        ▼
GhostLayer WebMCP bridge
  ├─ exact-origin adapter check
  ├─ strict input validation
  ├─ bounded output validation
  └─ lifecycle disposal
        │
        ├─ find_customer ────────────────► structured fictional result
        │
        └─ create_invoice_draft
                   │ validate and pause
                   ▼
             visible human review
                ├─ reject / expire ─────► zero writes
                └─ approve ─────────────► one tab-local draft
```

The public repository is self-contained:

- `app/ChallengeClient.tsx` implements the visible sandbox, approval promise, replay behavior, pause control, and reset flow.
- `app/challenge-contract.ts` declares the fictional records and strict WebMCP tool contract.
- `app/challenge-contract.test.ts` includes deterministic unit coverage for validation, replay keys, and approval expiry.
- `packages/adapter-schema/` and `packages/webmcp-bridge/` provide the bounded adapter schema and native WebMCP registration bridge.
- `tests/e2e/challenge.spec.ts` covers the browser-level judge flow and native WebMCP chain.

## Run the challenge Site locally

Requirements:

- Node.js 22.13 or newer
- pnpm 11
- a WebMCP-capable Chromium build for native tool discovery

Install and start the standalone challenge Site:

```bash
pnpm install
pnpm dev -- --host 127.0.0.1 --port 4176
```

Then open [http://127.0.0.1:4176](http://127.0.0.1:4176).

Useful verification commands:

```bash
pnpm typecheck
pnpm lint
pnpm test
pnpm build
pnpm exec playwright install chromium
pnpm test:e2e
```

Vitest checks the two-minute approval expiry deterministically with fake timers. Browser E2E covers route isolation, absence of application API calls, tab isolation, zero-write rejection, approval, and the real WebMCP discovery/execution/replay/pause chain. The native scenario launches Chromium with the experimental WebMCP feature enabled and may require a graphical environment. The visible manual flow remains useful when that API is unavailable.

## Challenge requirements checklist

Before submitting through the [OpenAI WebMCP Challenge page](https://openai.com/th-TH/webmcp-challenge/) and [Devpost](https://webmcp.devpost.com/), confirm that all four public artifacts are available:

- a functioning public website URL judges can open;
- a public source repository with setup instructions and an open-source license visible;
- a public YouTube demo under three minutes with audible narration or audio;
- completed project text explaining the WebMCP use, implementation, and human-agent experience.

The provided submission draft maps the project to the published judging themes: WebMCP leverage, execution, potential impact, and creativity/ambition.

The published deadline is September 3, 2026 at 1:00 PM PDT, which is September 4, 2026 at 03:00 in Bangkok.

## Separate owner-only prototype

A deeper owner-only prototype explores authenticated server persistence, durable approval/idempotency, administration, and legacy-extension compatibility. It is intentionally not included in this public challenge repository and is not required to run or judge this sandbox.

## Scope and limitations

- WebMCP is experimental, and availability depends on a compatible browser, feature flag, or applicable origin-trial configuration.
- The challenge sandbox uses no real customer, invoice, payment, credential, or third-party system.
- It does not automate passwords, payments, CAPTCHAs, arbitrary websites, or website-protection bypasses.
- Challenge replay protection is limited to the current tab and the same normalized request; durable cross-device guarantees would require a separately reviewed server-backed product.

## License

Copyright 2026 GhostLayer contributors. Licensed under the [Apache License 2.0](LICENSE).
