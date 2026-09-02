# GhostLayer WebMCP Challenge submission draft

The live Site, source repository, and public demo video are final. This public package contains only the client-only challenge sandbox; the separate owner-only prototype is not included.

## Submission links

- Project name: **GhostLayer — Agent Speed, Human Authority**
- Live website: **[ghostlayer-agent-authority.humble-flea-4717.chatgpt.site](https://ghostlayer-agent-authority.humble-flea-4717.chatgpt.site/)**
- Public source repository: **[github.com/wasutha-bbn/ghostlayer-webmcp-challenge](https://github.com/wasutha-bbn/ghostlayer-webmcp-challenge)**
- Public video: **[youtube.com/watch?v=zhuwHpvbHQY](https://www.youtube.com/watch?v=zhuwHpvbHQY)** — 2:24
- License: **Apache-2.0**

## One-line tagline

GhostLayer lets websites give agents fast, typed WebMCP tools while keeping consequential actions behind a visible human decision.

## Short description

GhostLayer is a fictional CRM sandbox that publishes two page-owned WebMCP tools: a structured customer lookup and a governed invoice-draft action. The agent can prepare work quickly, but the consequential call remains pending until the human reviews the exact effect and chooses approve or reject. The public demo uses only isolated, tab-local data—no credentials, database, or real customer system.

## Full project description

Most browser agents still have to infer intent from interfaces designed for people. They guess which button matters, depend on DOM details that can move, and often struggle to distinguish a harmless read from a consequential write.

GhostLayer explores a different contract: the website declares what an agent can do.

The Challenge Edition turns a fictional CRM into a native WebMCP surface with two bounded tools. `find_customer` performs an exact lookup and returns a typed result. `create_invoice_draft` accepts the returned customer ID, a short description, and a fictional amount, but does not immediately create anything. The tool call pauses while the site displays the exact customer, description, amount, and two-minute approval window. Rejection and expiry create no draft. Approval creates one tab-local demo draft; repeating the same normalized request returns that draft instead of adding a duplicate row.

The human can also pause the entire agent surface. Pausing disposes both WebMCP tool registrations, and resuming registers the bounded contract again. Reset clears every fictional record created in the current tab.

This makes the human-agent relationship legible: the agent discovers and prepares structured work, while the application owns validation, effect preview, approval, rejection, lifecycle, and recovery.

The public judge sandbox is intentionally client-only. It has three plainly labeled fictional customers, no application API calls, no D1 or external CRM, no credentials, no application cookies, and no durable persistence. A new tab, reload, close, or reset starts clean. That isolation lets judges exercise the complete interaction safely. A separate owner-only prototype outside this public repository explores a deeper server-backed architecture, but it is not part of the challenge package or demo.

## Inspiration

WebMCP changes the unit of browser automation from “guess how to operate this screen” to “invoke a capability the website intentionally published.” We wanted to show that this is not only a reliability improvement. It is also an opportunity to redesign the handoff between agent speed and human authority.

## What it does

- Publishes `find_customer` and `create_invoice_draft` directly from the website through WebMCP.
- Gives each tool a strict description, input schema, output schema, and risk classification.
- Validates every input and output inside the provider.
- Completes a safe read immediately.
- Holds a consequential call open until the person approves or rejects the exact effect.
- Creates nothing on rejection, expiry, cancellation, pause, reset, or invalid input.
- Returns the same tab-local invoice for a replay of the same normalized approved request.
- Lets the person remove and restore the complete tool surface with a kill switch.
- Offers manual forms as a transparent fallback when the browser does not expose WebMCP.

## How we built it

GhostLayer uses Next.js/React with Vinext and the OpenAI Sites runtime. A small shared bridge registers validated page-owned tools with `document.modelContext`, feature-detects native WebMCP, validates strict adapter schemas, limits provider output, and disposes registrations through an `AbortController`.

The challenge tool contract declares exact-origin availability and two risk levels. The React application implements the handlers and owns the visible approval promise. The client normalizes amounts and descriptions, limits the demo to known fictional customer IDs and eight drafts per tab, expires pending approval after two minutes, and retains only a short on-screen audit timeline.

Vitest deterministically verifies strict validation, replay keys, and two-minute approval expiry with fake timers. Playwright browser scenarios cover route isolation, absence of application API calls, tab isolation, zero-write rejection, approval, and the native WebMCP discovery/execution/replay/pause chain in a compatible Chromium build.

## Challenge-period provenance

GhostLayer had an earlier private adapter/extension prototype. The standalone public Challenge Edition in this repository was created during the submission period as a new directly testable WebMCP application. Its challenge-period work includes the client-only judge sandbox, direct page-owned native tool registration, visible pending approval, rejection/expiry semantics, same-tab replay, Pause/Resume lifecycle control, Reset behavior, deployment isolation, and the accompanying unit, browser, and deployment verification. The dated public commit history records this package; the earlier owner-only prototype is not included or required to run the submission.

## The human-agent experience

Suggested judge prompt:

> Use GhostLayer's tools to find the fictional customer with phone +1-202-555-0120. Then prepare a $125 invoice draft for “September accessibility audit”. Stop and let me approve before anything is created.

Expected experience:

1. The agent discovers two explicit tools rather than searching the UI.
2. It calls `find_customer` and receives `CUS-2001` as structured output.
3. It calls `create_invoice_draft`; the call remains pending and the visible invoice count stays at zero.
4. The person reviews the exact effect and approves or rejects it.
5. The tool returns only after that decision.
6. A repeated approved input returns the existing demo invoice, while the table still contains one row.

## Judging-criteria mapping

### WebMCP leverage

The demo depends on native tool discovery and invocation, not simulated chat text. The website publishes typed, page-owned capabilities; the browser agent calls those capabilities; and registration lifecycle responds to the human pause control.

### Execution

The complete path is interactive and inspectable: structured read, strict validation, pending consequential call, exact-effect review, rejection or approval, bounded result, replay, kill switch, and reset. A visible manual fallback makes the underlying business behavior understandable even without an experimental browser API.

### Potential impact

The same pattern can apply to support consoles, internal operations, commerce back offices, and regulated workflows: allow agents to assemble or prepare work quickly while the product retains policy checks and human authority at the point of consequence.

### Creativity and ambition

GhostLayer treats WebMCP as a new product surface, not only an automation API. Tool availability, risk, approval, replay, pause, audit, and reset are designed as one coherent human-agent interaction model. A separate owner-only prototype—not included in this public package—explores a server-backed and extension-compatible path for sites that cannot yet adopt native WebMCP.

## Challenges we ran into

- WebMCP is experimental, so provider behavior and callback shapes can differ between a current draft and an available Chromium implementation.
- A consequential tool must wait for a human without silently committing, leaking an unresolved invocation, or creating a duplicate when retried.
- A public challenge link must be easy to test without exposing any owner-only identity, persistent state, or secret.
- The demo needed a manual path that explains the product even when a judge's browser does not expose the experimental API.

## Accomplishments we are proud of

- The real agent call stays pending across visible human review.
- Rejecting, expiring, or cancelling ends with zero draft creation.
- One control removes the complete agent surface instead of merely disabling a button.
- The judge sandbox is useful without collecting or persisting any user data.
- The project remains honest about its boundary: replay safety is tab-local, while durable semantics would require a separately reviewed server-backed architecture.

## What we learned

Structured tools remove UI ambiguity, but a good WebMCP product still needs application-owned semantics. Schema validation, effect previews, lifecycle disposal, cancellation, replay handling, and explicit human control are what turn a callable function into a trustworthy interaction.

## What's next

- Test against additional browser implementations as the WebMCP draft evolves.
- Extract the governed approval pattern into a reusable provider component.
- Add policy-generated approval UX for more consequence classes.
- Connect an opt-in deployment to a fictional server backend, then evaluate multi-tenant authorization and durable idempotency independently.
- Build conformance and accessibility tests for tool descriptions, schemas, approval dialogs, and lifecycle controls.

## Built with

- WebMCP / `document.modelContext`
- TypeScript
- React 19
- Next.js 16
- Vinext and Vite
- OpenAI Sites runtime
- Zod
- Playwright
- Vitest
- Chromium WebMCP experimental support

## Safety and data disclosure

The public challenge Site contains fictional data only. It sends no application API request, uses no D1/R2/external CRM, requires no login, reads no credentials, and stores no business state outside the current tab. It does not process payments or automate third-party websites. Reloading or closing the tab clears all challenge state.

A separate owner-only prototype uses authenticated persistence for a fictional tenant. It is not included in this public repository and is not the public judge target.

## Final pre-submission checklist

The [official challenge page](https://openai.com/th-TH/webmcp-challenge/) and [Devpost submission page](https://webmcp.devpost.com/) require the final public artifacts. Before clicking submit:

Published deadline: **September 3, 2026 at 1:00 PM PDT**, equivalent to **September 4, 2026 at 03:00 Asia/Bangkok**.

- [x] Use the functioning public judge URL shown above.
- [x] Confirm an unsigned request opens the Site without per-judge access.
- [x] Confirm `/pilot`, `/pilot/admin`, `/pilot/legacy`, and `/api/pilot/state` are absent from the challenge host.
- [x] Confirm the source repository is public while signed out.
- [x] Confirm `README.md`, setup commands, source, and `LICENSE` are visible in that public repository.
- [x] Remove or sanitize private deployment identifiers and unrelated generated artifacts from the public package.
- [x] Replace the video placeholder with a public YouTube URL.
- [x] Confirm the rendered video is shorter than three minutes and contains audible narration audio.
- [ ] Watch the uploaded video once while signed out.
- [x] Run the exact judge prompt on the final deployed build.
- [x] Confirm reject creates zero drafts, approve creates one, replay does not add a row, and pause removes both tools.
- [x] Paste the final link values into this document and the root README.
