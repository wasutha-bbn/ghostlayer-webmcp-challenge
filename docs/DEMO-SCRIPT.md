# GhostLayer challenge demo script

## Production target

- Runtime: **2:23.529** (143.529 seconds), safely below the three-minute limit
- Format: **16:9, 1920×1080, 30 fps**
- Destination: public YouTube link for the WebMCP Challenge submission
- Style: proof-led product tour using the real Challenge Edition and its native WebMCP interaction
- Audio: clear English narration with synchronized captions; no music or sound effects
- Core message: **Agent speed. Human authority.**

The demo contains only the standalone fictional Challenge Edition. It does not
show the owner-only pilot, an authenticated account, private routes, secrets,
notifications, or unrelated browser tabs.

## Exact judge prompt

Use this text without changing its meaning or values:

> Use GhostLayer's tools to find the fictional customer with phone +1-202-555-0120. Then prepare a $125 invoice draft for “September accessibility audit”. Stop and let me approve before anything is created.

## Final timed narration and shot plan

### 0:00.000–0:14.549 — Fast without guessing

**Picture**

- Contrast brittle UI guessing with an explicit agent-tool surface.
- Resolve on the GhostLayer thesis card: **Agent speed. Human authority.**

**Narration**

> Browser agents can move fast. But when a website makes them guess the interface, speed becomes brittle. GhostLayer replaces guessing with explicit tools, while humans retain authority over consequential actions.

### 0:14.549–0:29.866 — The page owns the contract

**Picture**

- Establish the real public sandbox.
- Tour **find_customer** as a structured read and **create_invoice_draft** as a consequential, human-governed tool.
- End on **validate → preview → approve**.

**Narration**

> This fictional C R M publishes two page-owned tools. find_customer is a structured read. create_invoice_draft is consequential, so the website, not the agent, owns validation, effect preview, and approval.

### 0:29.866–0:43.711 — Discover, do not guess

**Picture**

- Show both discovered WebMCP tool names, descriptions, and exact input schemas.
- Hold the receipt **2 PAGE-OWNED TOOLS · 0 BUTTON COORDINATES**.

**Narration**

> The agent discovers names, descriptions, and schemas directly from the page. No button coordinates. No brittle D O M recipe. Just two bounded capabilities the website intentionally published.

### 0:43.711–0:59.882 — One exact request

**Picture**

- Type the exact judge prompt in full.
- Sequentially emphasize the phone number, amount, description, and instruction to stop for approval.

**Narration**

> I ask GhostLayer to find fictional customer plus one, two oh two, five five five, zero one two zero; prepare a one hundred twenty five dollar draft for a September accessibility audit; and stop before anything is created.

### 0:59.882–1:11.487 — A bounded read

**Picture**

- Show the native **find_customer** execution.
- Resolve on **CUS-2001**, **Araya Niran**, and **active**.
- Hold the disclosure **FICTIONAL RECORD · NO CREDENTIALS**.

**Narration**

> The read returns a small, validated result: customer C U S two zero zero one, Araya Niran. No credential or real customer record is involved.

### 1:11.487–1:26.612 — Zero until approval

**Picture**

- Place agent preparation and the human review panel side by side.
- Show the exact customer, description, **$125**, and two-minute review window.
- Make **INVOICE DRAFTS 0** the dominant held proof.

**Narration**

> The second call does not create immediately. Its promise stays pending while GhostLayer shows the exact customer, description, amount, and two minute window. The invoice count is still zero, and the human has the final decision.

### 1:26.612–1:37.513 — Reject means create nothing

**Picture**

- Show the real **Reject — create nothing** interaction.
- Resolve on **HUMAN REJECTED** and **0 DRAFTS**.
- End with the same request prepared again.

**Narration**

> I reject the first attempt. The invocation ends, the audit records the decision, and zero drafts exist. Then the agent prepares the same request again.

### 1:37.513–1:51.550 — Approve once

**Picture**

- Establish the second pending approval.
- Show the real **Approve and create once** control before the state changes.
- Travel from the human decision to **INV-DEMO-0001**, **$125.00**, and one draft.

**Narration**

> This time I approve. Only then does the tool return, and one tab-local demo invoice appears: I N V demo zero zero zero one. The write happens once, after an explicit human decision.

### 1:51.550–2:08.958 — Replay and kill switch

**Picture**

- Show **replayed: true**, the same invoice ID, and one table row.
- Pause the agent surface and show discovery return no tools.
- Resume and show the same two bounded contracts return.

**Narration**

> Replaying the same normalized request returns that same invoice, with replayed true. The table still has one row. Then the human pauses the agent surface; discovery returns no tools. Resume restores the same two bounded contracts.

### 2:08.958–2:23.529 — Reset and close

**Picture**

- Show reset returning the tab-local state to zero.
- Disclose **FICTIONAL DATA**, **ISOLATED TAB**, **NO CREDENTIALS**, and **NO APPLICATION API**.
- End on the GhostLayer card with the stable Site URL and public GitHub repository.

**Narration**

> Reset clears the tab-local state. Reload or close the tab and it starts clean. Fictional data, no credentials, no application A P I. GhostLayer shows the pattern: agent speed, human authority.

## Required proof shots

The final cut must leave these readable long enough for a judge to verify them:

- both WebMCP tool names and their typed schemas;
- the complete exact judge prompt;
- structured customer ID **CUS-2001**;
- invoice count **0** while the consequential call is pending;
- rejection followed by zero drafts;
- approval followed by **INV-DEMO-0001**, **$125.00**, and one row;
- replay returning the same ID while the table remains at one row;
- pause with the discovered-tool surface empty and resume with two tools;
- reset returning the sandbox to zero;
- the stable challenge Site URL and public source repository on the end card.

## Truth and safety constraints

- Use the real captured Challenge Edition and native WebMCP proof; do not invent tool results or a fake agent chat.
- Describe created records as **tab-local demo drafts**, not server or D1 writes.
- Describe replay as scoped to the same normalized request in the current tab; do not claim global exactly-once execution.
- Do not show the private **/pilot**, **/pilot/admin**, extension popup, database console, secret settings, or owner identity.
- Do not show a local filesystem path, personal account, token, notification, or unrelated browser tab.
- Keep captions inside title-safe margins and keep tool names, values, decisions, and URLs readable at 1080p.

## Final export and upload check

- [ ] **renders/video.mp4** exists and its measured duration is 143.529 seconds.
- [ ] Voice is audible on a phone speaker; captions match the narration.
- [ ] Captions spell **WebMCP**, **find_customer**, **create_invoice_draft**, **CUS-2001**, and **INV-DEMO-0001** correctly.
- [ ] No private URL, email, token, account avatar, local path, or notification is visible.
- [ ] The end card contains the stable challenge Site URL and public source repository.
- [ ] The YouTube visibility is Public and playback works while signed out.
- [ ] The public video URL is copied into **README.md** and **docs/CHALLENGE-SUBMISSION.md**.
