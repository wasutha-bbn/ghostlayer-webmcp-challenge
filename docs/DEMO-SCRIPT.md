# GhostLayer challenge demo script

## Production target

- Runtime: **2:45–2:52**, never 3:00 or longer after YouTube processing
- Format: **16:9, 1920×1080, 30 fps**
- Destination: public YouTube link for the WebMCP Challenge submission
- Style: show the real public Site and real WebMCP interaction; use short title cards only to clarify the story
- Audio: clear English narration throughout the core demo; music is optional and should remain well below the voice
- Core message: **Agent speed. Human authority.**

Use a clean browser profile with no personal bookmarks, accounts, notifications, tokens, local paths, or private staging tabs visible. Record the final public challenge URL, not the owner-only pilot.

## Exact judge prompt

Use this text without changing its meaning or values:

> Use GhostLayer's tools to find the fictional customer with phone +1-202-555-0120. Then prepare a $125 invoice draft for “September accessibility audit”. Stop and let me approve before anything is created.

## Timed shot and narration plan

### 0:00–0:10 — Open on the thesis

**Picture**

- Full-screen GhostLayer social card or the Site hero.
- On-screen text: `GhostLayer` and `Agent speed. Human authority.`

**Narration**

> Browser agents are fast, but websites still make them guess how the interface works. GhostLayer replaces that guesswork with explicit WebMCP tools—and keeps the human in control of consequential actions.

### 0:10–0:27 — Establish the problem and the surface

**Picture**

- Reveal the public challenge homepage.
- Slowly frame the three principles: Discover, Collaborate, Control.
- Land on the WebMCP status and the two tool names.

**Narration**

> This fictional CRM publishes two page-owned tools. `find_customer` is a structured read. `create_invoice_draft` is consequential, so the site—not the agent—owns validation and approval.

### 0:27–0:42 — Show discoverability, not UI guessing

**Picture**

- Show the agent's discovered tool list with `find_customer` and `create_invoice_draft`.
- Keep the Site visible enough that viewers can connect the tool surface to the page.

**Narration**

> The agent discovers names, descriptions, and schemas directly from the website. It does not need the visual position of a button or a brittle DOM recipe.

### 0:42–0:58 — Give the exact prompt

**Picture**

- Click **Copy agent prompt**.
- Paste the exact prompt into the agent.
- Briefly highlight the fictional phone number, $125 amount, and instruction to stop for approval.

**Narration**

> I ask it to find fictional customer plus-one 202-555-0120, prepare a 125-dollar draft for a September accessibility audit, and stop before anything is created.

### 0:58–1:15 — Execute the read tool

**Picture**

- Show the agent call `find_customer`.
- Show the Site populate `CUS-2001`, Araya Niran, phone, and status.
- Briefly show the “Structured read” audit event.

**Narration**

> The read returns a small, validated result: customer CUS-2001. No credential or real customer record is involved.

### 1:15–1:38 — Make the consequential boundary visible

**Picture**

- Show the agent call `create_invoice_draft`.
- Keep the invoice count at zero in frame.
- Show the approval panel with customer, description, amount, and two-minute window.
- Pause for one beat before moving the pointer.

**Narration**

> The second tool does not create immediately. Its promise stays pending while GhostLayer shows the exact effect. The invoice count is still zero, and the human can reject without a write.

### 1:38–1:53 — Demonstrate rejection

**Picture**

- Click **Reject — create nothing**.
- Show the zero invoice count and “Human rejected” audit event.
- Use a clean cut to a second invocation of the same $125 request.

**Narration**

> I reject the first attempt. The call ends and nothing is created. Then I ask the agent to prepare the same draft again.

### 1:53–2:13 — Approve once

**Picture**

- Show the approval panel again.
- Click **Approve and create once**.
- Show `INV-DEMO-0001`, one table row, and the returned structured tool result.

**Narration**

> This time I approve. The tool returns only after my decision, and one tab-local demo invoice appears.

### 2:13–2:28 — Replay without a duplicate

**Picture**

- Invoke `create_invoice_draft` again with the same customer, description, and amount.
- Show the returned `INV-DEMO-0001` with `replayed: true`.
- Hold on the invoice count of one and a single table row.

**Narration**

> Replaying the same normalized request returns the same demo invoice. The table still has one row. This replay protection is intentionally scoped to the current tab—not presented as a global exactly-once guarantee.

### 2:28–2:41 — Put the human kill switch in control

**Picture**

- Click **Pause agent tools**.
- Show “Paused by human” and an empty discovered-tool list.
- Click **Resume agent tools** and show both tools return.

**Narration**

> The human can remove the complete agent surface at any time, then restore the same bounded contract when ready.

### 2:41–2:52 — Close on safety and impact

**Picture**

- Click **Reset sandbox** and show the invoice count return to zero.
- End on the GhostLayer title card with the public Site and repository URLs.
- On-screen text: `Fictional data · isolated tab · no credentials`.

**Narration**

> The public sandbox is fictional, client-only, and cleared by reset, reload, or closing the tab. GhostLayer shows how WebMCP can give agents speed without giving up human authority.

## Required proof shots

Do not cut these so quickly that a judge cannot verify them:

- the public URL in the address bar;
- both discovered WebMCP tool names;
- the exact prompt;
- structured customer ID `CUS-2001`;
- invoice count `0` while approval is pending;
- reject followed by zero drafts;
- approve followed by `INV-DEMO-0001` and one row;
- replay returning the same ID with one row still visible;
- pause with the discovered tool list empty;
- reset returning the sandbox to zero.

## Recording notes

- Record one clean browser interaction pass first, then add narration; this makes the two-minute approval UI easy to time without rushing.
- Keep the cursor still while key evidence is on screen.
- Use cuts between rejection and the second invocation; do not fake tool results or replace the real interaction with a mockup.
- If a browser permission or experimental warning appears, explain it once in a small caption and keep the demo moving.
- Do not show the private `/pilot`, `/pilot/admin`, extension popup, D1 console, secret settings, or owner identity in the challenge video.
- Do not claim that the challenge sandbox writes to a server. Say “tab-local demo draft.”
- Do not claim global exactly-once behavior. Say “the same normalized request replays the same invoice in this tab.”
- Keep captions inside title-safe margins and ensure the code/tool names remain readable at 1080p.

## Final export and upload check

- [ ] Final duration is below 3:00, including the last frame and any platform-added slate.
- [ ] Voice is audible on a phone speaker and no music masks it.
- [ ] Captions match the narration and spell `WebMCP`, `find_customer`, and `create_invoice_draft` correctly.
- [ ] No private URL, email, token, account avatar, local filesystem path, or notification is visible.
- [ ] The displayed Site URL is the final public challenge deployment.
- [ ] The end card includes the public source repository URL.
- [ ] The YouTube visibility is Public and playback works while signed out.
- [ ] The uploaded link is copied into `README.md` and `docs/CHALLENGE-SUBMISSION.md`.
