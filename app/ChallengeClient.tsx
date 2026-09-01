/* eslint-disable @next/next/no-html-link-for-pages -- Shared by the root app and the standalone challenge Site. */
'use client';

import { registerAdapterWithWebMcp, type WebMcpRegistrationResult } from '@ghostlayer/webmcp-bridge';
import { useCallback, useEffect, useRef, useState, useSyncExternalStore, type FormEvent } from 'react';
import {
  CHALLENGE_APPROVAL_TTL_MS,
  CHALLENGE_CUSTOMERS,
  CHALLENGE_PROMPT,
  challengeInvoiceKey,
  createChallengeAdapter,
  normalizeChallengeInvoice,
  scheduleChallengeApprovalExpiry,
  type ChallengeCustomer,
  type ChallengeInvoiceInput,
  type ChallengeInvoiceResult,
} from './challenge-contract';

interface ChallengeInvoice extends ChallengeInvoiceResult, ChallengeInvoiceInput {
  key: string;
}

interface AuditEvent {
  id: number;
  label: string;
  detail: string;
}

interface PendingApproval {
  key: string;
  input: ChallengeInvoiceInput;
  source: 'agent' | 'manual';
  expiresAt: number;
  promise: Promise<ChallengeInvoiceResult>;
  resolve(value: ChallengeInvoiceResult): void;
  reject(reason: unknown): void;
  cleanup(): void;
}

function abortError(message: string): DOMException {
  return new DOMException(message, 'AbortError');
}

function formatMoney(value: number): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(value);
}

function subscribeToHydration(): () => void {
  return () => {};
}

function hydratedClientSnapshot(): boolean {
  return true;
}

function hydratedServerSnapshot(): boolean {
  return false;
}

export function ChallengeClient() {
  const [phone, setPhone] = useState('+1-202-555-0120');
  const [customer, setCustomer] = useState<ChallengeCustomer | null>(null);
  const [invoiceInput, setInvoiceInput] = useState<ChallengeInvoiceInput>({ customer_id: 'CUS-2001', description: 'September accessibility audit', amount: 125 });
  const [invoices, setInvoices] = useState<ChallengeInvoice[]>([]);
  const [pending, setPending] = useState<PendingApproval | null>(null);
  const [audits, setAudits] = useState<AuditEvent[]>([{ id: 1, label: 'Sandbox ready', detail: 'No application API, credentials, or real customer records.' }]);
  const [paused, setPaused] = useState(false);
  const [notice, setNotice] = useState('');
  const [copied, setCopied] = useState(false);
  const [providerStatus, setProviderStatus] = useState<WebMcpRegistrationResult['status']>('unavailable');
  const [registeredTools, setRegisteredTools] = useState<string[]>([]);
  const interactive = useSyncExternalStore(subscribeToHydration, hydratedClientSnapshot, hydratedServerSnapshot);
  const invoicesRef = useRef<ChallengeInvoice[]>([]);
  const pendingRef = useRef<PendingApproval | null>(null);
  const invoiceCounter = useRef(1);
  const auditCounter = useRef(2);

  const appendAudit = useCallback((label: string, detail: string) => {
    setAudits((current) => [{ id: auditCounter.current++, label, detail }, ...current].slice(0, 8));
  }, []);

  const findCustomer = useCallback(async (phoneValue: string): Promise<Omit<ChallengeCustomer, 'company'>> => {
    if (paused) throw new Error('The human kill switch has paused agent tools.');
    const normalized = phoneValue.trim();
    const match = CHALLENGE_CUSTOMERS.find((candidate) => candidate.phone_number === normalized) ?? null;
    setPhone(normalized);
    setCustomer(match);
    if (!match) {
      appendAudit('Read blocked safely', 'No fictional customer matched the exact phone number.');
      throw new Error('No fictional customer matched that phone number.');
    }
    setInvoiceInput((current) => ({ ...current, customer_id: match.customer_id }));
    appendAudit('Structured read', `${match.customer_id} returned from in-page fictional data without credentials.`);
    return { customer_id: match.customer_id, name: match.name, phone_number: match.phone_number, status: match.status };
  }, [appendAudit, paused]);

  const prepareInvoice = useCallback((value: ChallengeInvoiceInput, signal: AbortSignal | undefined, source: 'agent' | 'manual'): Promise<ChallengeInvoiceResult> => {
    if (paused) return Promise.reject(new Error('The human kill switch has paused agent tools.'));
    let input: ChallengeInvoiceInput;
    try {
      input = normalizeChallengeInvoice(value);
    } catch (error) {
      return Promise.reject(error);
    }
    const key = challengeInvoiceKey(input);
    const completed = invoicesRef.current.find((invoice) => invoice.key === key);
    if (completed) {
      appendAudit('Idempotent replay', `${completed.invoice_id} returned; no duplicate draft was created.`);
      return Promise.resolve({ invoice_id: completed.invoice_id, status: 'draft', amount: completed.amount, replayed: true });
    }
    if (invoicesRef.current.length >= 8) return Promise.reject(new Error('This tab reached its eight-draft safety cap. Reset the sandbox to continue.'));
    const active = pendingRef.current;
    if (active) {
      if (active.key === key) return active.promise;
      return Promise.reject(new Error('Another human approval is already pending in this tab.'));
    }

    let resolvePromise!: (result: ChallengeInvoiceResult) => void;
    let rejectPromise!: (reason: unknown) => void;
    const promise = new Promise<ChallengeInvoiceResult>((resolve, reject) => {
      resolvePromise = resolve;
      rejectPromise = reject;
    });
    let cancelExpiry = () => {};
    const cancelIfCurrent = (reason: unknown, auditLabel: string, auditDetail: string) => {
      const current = pendingRef.current;
      if (!current || current.key !== key) return;
      current.cleanup();
      pendingRef.current = null;
      setPending(null);
      appendAudit(auditLabel, auditDetail);
      rejectPromise(reason);
    };
    const onAbort = () => cancelIfCurrent(
      signal?.reason ?? abortError('The agent cancelled before human approval.'),
      'Agent request cancelled',
      'The pending draft was discarded before approval.',
    );
    const expiresAt = Date.now() + CHALLENGE_APPROVAL_TTL_MS;
    const approval: PendingApproval = {
      key,
      input,
      source,
      expiresAt,
      promise,
      resolve: resolvePromise,
      reject: rejectPromise,
      cleanup: () => {
        cancelExpiry();
        signal?.removeEventListener('abort', onAbort);
      },
    };
    pendingRef.current = approval;
    setPending(approval);
    setNotice('A consequential tool is waiting for your decision. Nothing has been created yet.');
    appendAudit('Human review required', `${source === 'agent' ? 'Agent' : 'Manual'} request paused before creating a $${input.amount.toFixed(2)} draft.`);
    signal?.addEventListener('abort', onAbort, { once: true });
    cancelExpiry = scheduleChallengeApprovalExpiry(() => cancelIfCurrent(
      abortError('The two-minute human approval window expired.'),
      'Approval expired',
      'The pending request ended after two minutes without a write.',
    ));
    if (signal?.aborted) onAbort();
    return promise;
  }, [appendAudit, paused]);

  const approvePending = useCallback(() => {
    const approval = pendingRef.current;
    if (!approval) return;
    const existing = invoicesRef.current.find((invoice) => invoice.key === approval.key);
    const invoice: ChallengeInvoice = existing ?? {
      ...approval.input,
      key: approval.key,
      invoice_id: `INV-DEMO-${String(invoiceCounter.current++).padStart(4, '0')}`,
      status: 'draft',
      replayed: false,
    };
    const next = existing ? invoicesRef.current : [invoice, ...invoicesRef.current];
    invoicesRef.current = next;
    setInvoices(next);
    approval.cleanup();
    pendingRef.current = null;
    setPending(null);
    setNotice(`${invoice.invoice_id} was created once after your approval.`);
    appendAudit('Human approved', `${invoice.invoice_id} committed once; retrying the same input will replay it.`);
    approval.resolve({ invoice_id: invoice.invoice_id, status: 'draft', amount: invoice.amount, replayed: Boolean(existing) });
  }, [appendAudit]);

  const rejectPending = useCallback((reason = 'The human rejected this request.') => {
    const approval = pendingRef.current;
    if (!approval) return;
    approval.cleanup();
    pendingRef.current = null;
    setPending(null);
    setNotice('Request rejected. No invoice draft was created.');
    appendAudit('Human rejected', 'The consequential action ended without a write.');
    approval.reject(abortError(reason));
  }, [appendAudit]);

  useEffect(() => {
    if (paused) return;
    const lifecycle = new AbortController();
    let disposed = false;
    let disposeRegistration: (() => void) | undefined;
    queueMicrotask(() => {
      if (disposed) return;
      void registerAdapterWithWebMcp(createChallengeAdapter(location.origin), {
        find_customer: async (input, { signal }) => {
          if (signal.aborted) throw signal.reason ?? abortError('The read was cancelled.');
          return findCustomer(String(input.phone_number ?? ''));
        },
        create_invoice_draft: async (input, { signal }) => prepareInvoice({
          customer_id: String(input.customer_id ?? ''),
          description: String(input.description ?? ''),
          amount: Number(input.amount),
        }, signal, 'agent'),
      }, { includeConsequential: true, signal: lifecycle.signal }).then((registration) => {
        if (disposed) {
          registration.dispose();
          return;
        }
        setProviderStatus(registration.status);
        setRegisteredTools(registration.registeredTools);
        disposeRegistration = registration.dispose;
      });
    });
    return () => {
      disposed = true;
      lifecycle.abort();
      disposeRegistration?.();
    };
  }, [findCustomer, paused, prepareInvoice]);

  useEffect(() => () => {
    const approval = pendingRef.current;
    if (!approval) return;
    approval.cleanup();
    pendingRef.current = null;
    approval.reject(abortError('The sandbox closed before approval.'));
  }, []);

  function submitCustomer(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setNotice('');
    void findCustomer(phone).catch((error) => setNotice(error instanceof Error ? error.message : 'Customer search failed safely.'));
  }

  function submitInvoice(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setNotice('');
    void prepareInvoice(invoiceInput, undefined, 'manual').catch((error) => setNotice(error instanceof Error ? error.message : 'Invoice request failed safely.'));
  }

  function togglePause() {
    const next = !paused;
    if (next && pendingRef.current) rejectPending('The human kill switch cancelled the pending request.');
    if (next) {
      setProviderStatus('unavailable');
      setRegisteredTools([]);
    }
    setPaused(next);
    setNotice(next ? 'Agent tools paused by the human kill switch.' : 'Agent tools resumed.');
    appendAudit(next ? 'Tools paused' : 'Tools resumed', next ? 'Both WebMCP tools were removed from agent availability.' : 'The bounded tool contract is available again.');
  }

  function resetSandbox() {
    if (pendingRef.current) rejectPending('The sandbox was reset before approval.');
    invoicesRef.current = [];
    invoiceCounter.current = 1;
    setInvoices([]);
    setCustomer(null);
    setPhone('+1-202-555-0120');
    setInvoiceInput({ customer_id: 'CUS-2001', description: 'September accessibility audit', amount: 125 });
    setPaused(false);
    setNotice('Sandbox reset. All tab-local demo state was cleared.');
    setAudits([{ id: auditCounter.current++, label: 'Sandbox reset', detail: 'All fictional tab-local state was cleared.' }]);
  }

  async function copyPrompt() {
    try {
      await navigator.clipboard.writeText(CHALLENGE_PROMPT);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2_000);
    } catch {
      setNotice('Copy was blocked by the browser. Select the prompt text instead.');
    }
  }

  const providerLabel = paused
    ? 'Paused by human'
    : providerStatus === 'registered'
      ? `${registeredTools.length} WebMCP tools live`
      : providerStatus === 'failed'
        ? 'Registration failed closed'
        : 'Open in ChatGPT to enable tools';

  return (
    <main className="challenge-shell" data-testid="challenge-app" data-interactive={interactive ? 'true' : 'false'}>
      <header className="challenge-nav">
        <a className="challenge-brand" href="/"><span>G</span><div><strong>GhostLayer</strong><small>Challenge Edition</small></div></a>
        <div className={`challenge-provider ${paused ? 'paused' : providerStatus}`} data-testid="challenge-webmcp-status"><i />{providerLabel}</div>
      </header>

      <section className="challenge-hero">
        <div>
          <p className="challenge-eyebrow">WebMCP Challenge · safe judge sandbox</p>
          <h1>Give agents tools.<br /><em>Keep humans in control.</em></h1>
          <p>GhostLayer turns a fictional CRM into a structured agent surface. Reads are fast; consequential work stops at a visible approval boundary.</p>
          <div className="challenge-hero-actions"><button className="challenge-button primary" disabled={!interactive} onClick={() => void copyPrompt()}>{copied ? 'Prompt copied ✓' : 'Copy agent prompt'}</button><button className="challenge-button secondary" disabled={!interactive} onClick={resetSandbox}>Reset sandbox</button></div>
        </div>
        <ol className="challenge-principles">
          <li><span>01</span><div><strong>Discover</strong><p>The page publishes two typed tools directly through WebMCP.</p></div></li>
          <li><span>02</span><div><strong>Collaborate</strong><p>The agent prepares; the human sees the exact effect before deciding.</p></div></li>
          <li><span>03</span><div><strong>Control</strong><p>Reject, replay safely, pause every tool, or reset the isolated demo.</p></div></li>
        </ol>
      </section>

      <section className="challenge-prompt" aria-label="Suggested agent prompt">
        <div><span>Try with your agent</span><strong>One prompt, two structured tools, one human decision.</strong></div>
        <p>{CHALLENGE_PROMPT}</p>
        <button disabled={!interactive} onClick={() => void copyPrompt()} aria-label="Copy suggested agent prompt">{copied ? 'Copied' : 'Copy'}</button>
      </section>

      <section className="challenge-controlbar">
        <div><span className="challenge-live-dot" /> <strong>Agent surface</strong><small>{registeredTools.length > 0 ? registeredTools.join(' · ') : 'find_customer · create_invoice_draft'}</small></div>
        <button className={paused ? 'resume' : 'pause'} disabled={!interactive} onClick={togglePause}>{paused ? 'Resume agent tools' : 'Pause agent tools'}</button>
      </section>

      {notice && <div className="challenge-notice" role="status">{notice}</div>}

      <section className="challenge-workspace">
        <article className="challenge-card">
          <header><div><span>Read-only tool</span><h2>Find customer</h2></div><b>Structured output</b></header>
          <form className="challenge-form" onSubmit={submitCustomer}>
            <label htmlFor="challenge-phone">Customer phone number</label>
            <div><input id="challenge-phone" value={phone} onChange={(event) => setPhone(event.target.value)} /><button disabled={!interactive || paused} type="submit">Search customer</button></div>
            <small>Reserved fictional records: +1-202-555-0120 · +1-202-555-0138 · +1-202-555-0194</small>
          </form>
          <div className="challenge-result" data-testid="challenge-customer-result">
            {customer ? <><div className="challenge-avatar">{customer.name.split(' ').map((part) => part[0]).join('')}</div><div><strong data-testid="challenge-customer-name">{customer.name}</strong><p>{customer.company}</p><dl><div><dt>ID</dt><dd data-testid="challenge-customer-id">{customer.customer_id}</dd></div><div><dt>Phone</dt><dd data-testid="challenge-customer-phone">{customer.phone_number}</dd></div><div><dt>Status</dt><dd data-testid="challenge-customer-status">{customer.status}</dd></div></dl></div></> : <p className="challenge-empty">Ask the agent—or use the form—to retrieve a fictional customer.</p>}
          </div>
        </article>

        <article className="challenge-card consequential">
          <header><div><span>Consequential tool</span><h2>Create invoice draft</h2></div><b>Human governed</b></header>
          <form className="challenge-form invoice" onSubmit={submitInvoice}>
            <label htmlFor="challenge-customer-id-input">Invoice customer ID</label><input id="challenge-customer-id-input" value={invoiceInput.customer_id} onChange={(event) => setInvoiceInput((current) => ({ ...current, customer_id: event.target.value }))} />
            <label htmlFor="challenge-description">Invoice description</label><input id="challenge-description" maxLength={160} value={invoiceInput.description} onChange={(event) => setInvoiceInput((current) => ({ ...current, description: event.target.value }))} />
            <label htmlFor="challenge-amount">Invoice amount</label><input id="challenge-amount" type="number" min="0.01" max="5000" step="0.01" value={invoiceInput.amount || ''} onChange={(event) => setInvoiceInput((current) => ({ ...current, amount: Number(event.target.value) }))} />
            <button disabled={!interactive || paused || Boolean(pending)} type="submit">Prepare for human approval</button>
          </form>
          <div className="challenge-effect"><span>Effect boundary</span><p>Input is validated in the page. No application API request, credential, or real record leaves this isolated tab.</p></div>
        </article>
      </section>

      {pending && <section className="challenge-approval" data-testid="challenge-approval" role="dialog" aria-labelledby="challenge-approval-title">
        <div><span>Agent paused · human decision required</span><h2 id="challenge-approval-title">Review the exact effect</h2><p>Nothing has been created. Approve once or reject without a write.</p></div>
        <dl><div><dt>Customer</dt><dd>{pending.input.customer_id}</dd></div><div><dt>Description</dt><dd>{pending.input.description}</dd></div><div><dt>Amount</dt><dd>{formatMoney(pending.input.amount)}</dd></div><div><dt>Approval window</dt><dd>2 minutes · {pending.source}</dd></div></dl>
        <div><button className="challenge-button secondary" onClick={() => rejectPending()}>Reject — create nothing</button><button className="challenge-button primary" onClick={approvePending}>Approve and create once</button></div>
      </section>}

      <section className="challenge-lower-grid">
        <article className="challenge-card challenge-invoices">
          <header><div><span>Tab-local state</span><h2>Invoice drafts</h2></div><b data-testid="challenge-invoice-count">{invoices.length}</b></header>
          {invoices.length === 0 ? <p className="challenge-empty">No draft exists until a human approves one.</p> : <div className="challenge-table" data-testid="challenge-invoice-success"><table><thead><tr><th>Invoice</th><th>Customer</th><th>Description</th><th>Amount</th></tr></thead><tbody>{invoices.map((invoice) => <tr key={invoice.invoice_id} data-testid="challenge-invoice-row"><td data-testid="challenge-invoice-id">{invoice.invoice_id}</td><td>{invoice.customer_id}</td><td>{invoice.description}</td><td data-testid="challenge-invoice-amount" data-value={invoice.amount}>{formatMoney(invoice.amount)}</td></tr>)}</tbody></table><span hidden data-testid="challenge-invoice-status">draft</span><span hidden data-testid="challenge-invoice-replayed" data-value="false">false</span></div>}
        </article>
        <article className="challenge-card challenge-audit">
          <header><div><span>Human-agent timeline</span><h2>Tab-local activity log</h2></div><b>{audits.length}</b></header>
          <ol>{audits.map((event) => <li key={event.id}><i /><div><strong>{event.label}</strong><p>{event.detail}</p></div></li>)}</ol>
        </article>
      </section>

      <footer className="challenge-footer"><strong>GhostLayer Challenge Edition</strong><span>Fictional data · isolated tab state · no credentials · reset anytime</span><a href="https://github.com/webmachinelearning/webmcp" target="_blank" rel="noreferrer">Built with WebMCP ↗</a></footer>
    </main>
  );
}
