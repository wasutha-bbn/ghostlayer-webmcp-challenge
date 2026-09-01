import { ADAPTER_SCHEMA_VERSION, type Adapter } from '@ghostlayer/adapter-schema';

export interface ChallengeCustomer {
  customer_id: string;
  name: string;
  phone_number: string;
  status: 'active' | 'review';
  company: string;
}

export interface ChallengeInvoiceInput {
  customer_id: string;
  description: string;
  amount: number;
}

export interface ChallengeInvoiceResult {
  invoice_id: string;
  status: 'draft';
  amount: number;
  replayed: boolean;
}

export const CHALLENGE_APPROVAL_TTL_MS = 120_000;

export function scheduleChallengeApprovalExpiry(onExpire: () => void): () => void {
  const timer = globalThis.setTimeout(onExpire, CHALLENGE_APPROVAL_TTL_MS);
  return () => globalThis.clearTimeout(timer);
}

export const CHALLENGE_CUSTOMERS: ChallengeCustomer[] = [
  { customer_id: 'CUS-2001', name: 'Araya Niran', phone_number: '+1-202-555-0120', status: 'active', company: 'Northstar Studio' },
  { customer_id: 'CUS-2002', name: 'Kiet Kanda', phone_number: '+1-202-555-0138', status: 'review', company: 'Lantern Works' },
  { customer_id: 'CUS-2003', name: 'Mali Prasert', phone_number: '+1-202-555-0194', status: 'active', company: 'Riverline Labs' },
];

export const CHALLENGE_PROMPT = 'Use GhostLayer\'s tools to find the fictional customer with phone +1-202-555-0120. Then prepare a $125 invoice draft for “September accessibility audit”. Stop and let me approve before anything is created.';

export function normalizeChallengeInvoice(value: ChallengeInvoiceInput): ChallengeInvoiceInput {
  const normalized = {
    customer_id: value.customer_id.trim(),
    description: value.description.trim(),
    amount: value.amount,
  };
  if (!/^CUS-[0-9]{4}$/.test(normalized.customer_id)) throw new Error('Use a customer ID returned by find_customer.');
  if (normalized.description.length < 1 || normalized.description.length > 160) throw new Error('Description must contain 1–160 characters.');
  if (!Number.isFinite(normalized.amount) || normalized.amount <= 0 || normalized.amount > 5_000) throw new Error('Sandbox invoice amount must be between $0.01 and $5,000.');
  if (Math.abs(normalized.amount * 100 - Math.round(normalized.amount * 100)) > 1e-8) throw new Error('Use at most two decimal places.');
  if (!CHALLENGE_CUSTOMERS.some((customer) => customer.customer_id === normalized.customer_id)) throw new Error('That fictional customer does not exist in this sandbox.');
  return normalized;
}

export function challengeInvoiceKey(input: ChallengeInvoiceInput): string {
  const normalized = normalizeChallengeInvoice(input);
  return JSON.stringify([normalized.customer_id, normalized.description, Math.round(normalized.amount * 100)]);
}

export function createChallengeAdapter(origin: string): Adapter {
  const timestamp = '2026-09-01T00:00:00.000Z';
  return {
    id: 'ghostlayer-challenge-sandbox',
    schemaVersion: ADAPTER_SCHEMA_VERSION,
    revision: 1,
    name: 'GhostLayer Challenge Sandbox',
    description: 'Two bounded WebMCP tools that let an agent assist with a fictional CRM while a human retains control of consequential actions.',
    enabled: true,
    allowedOrigins: [origin],
    createdAt: timestamp,
    updatedAt: timestamp,
    tools: [
      {
        name: 'find_customer',
        description: 'Find one fictional CRM customer by exact phone number. Use this read-only tool before preparing an invoice; never use it to create or modify records.',
        riskLevel: 'read',
        inputSchema: {
          type: 'object',
          properties: {
            phone_number: { type: 'string', title: 'Phone number', description: 'One fictional phone number displayed in the sandbox.', minLength: 7, maxLength: 24, format: 'tel' },
          },
          required: ['phone_number'],
          additionalProperties: false,
        },
        outputSchema: {
          type: 'object',
          properties: {
            customer_id: { type: 'string', title: 'Customer ID' },
            name: { type: 'string', title: 'Customer name' },
            phone_number: { type: 'string', title: 'Phone number' },
            status: { type: 'string', title: 'Customer status' },
          },
          required: ['customer_id', 'name', 'phone_number', 'status'],
          additionalProperties: false,
        },
        steps: [
          { type: 'fill', locator: { strategy: 'label', label: 'Customer phone number' }, inputKey: 'phone_number' },
          { type: 'click', locator: { strategy: 'role', role: 'button', name: 'Search customer' } },
          { type: 'waitFor', locator: { strategy: 'testId', testId: 'challenge-customer-result' }, timeoutMs: 3_000 },
          { type: 'extract', locator: { strategy: 'testId', testId: 'challenge-customer-id' }, outputKey: 'customer_id', source: 'text', valueType: 'string' },
          { type: 'extract', locator: { strategy: 'testId', testId: 'challenge-customer-name' }, outputKey: 'name', source: 'text', valueType: 'string' },
          { type: 'extract', locator: { strategy: 'testId', testId: 'challenge-customer-phone' }, outputKey: 'phone_number', source: 'text', valueType: 'string' },
          { type: 'extract', locator: { strategy: 'testId', testId: 'challenge-customer-status' }, outputKey: 'status', source: 'text', valueType: 'string' },
        ],
      },
      {
        name: 'create_invoice_draft',
        description: 'Prepare one fictional invoice draft for visible human review. The tool waits for explicit approval and creates nothing when rejected. Use only after find_customer returns a valid customer ID.',
        riskLevel: 'confirm',
        inputSchema: {
          type: 'object',
          properties: {
            customer_id: { type: 'string', title: 'Customer ID', description: 'The exact ID returned by find_customer.', minLength: 8, maxLength: 8, format: 'id' },
            description: { type: 'string', title: 'Description', description: 'A concise fictional invoice description.', minLength: 1, maxLength: 160, format: 'text' },
            amount: { type: 'number', title: 'Amount (USD)', description: 'A fictional amount from $0.01 to $5,000.', minimum: 0.01, maximum: 5_000 },
          },
          required: ['customer_id', 'description', 'amount'],
          additionalProperties: false,
        },
        outputSchema: {
          type: 'object',
          properties: {
            invoice_id: { type: 'string', title: 'Invoice ID' },
            status: { type: 'string', title: 'Invoice status' },
            amount: { type: 'number', title: 'Amount' },
            replayed: { type: 'boolean', title: 'Idempotent replay' },
          },
          required: ['invoice_id', 'status', 'amount', 'replayed'],
          additionalProperties: false,
        },
        steps: [
          { type: 'fill', locator: { strategy: 'label', label: 'Invoice customer ID' }, inputKey: 'customer_id' },
          { type: 'fill', locator: { strategy: 'label', label: 'Invoice description' }, inputKey: 'description' },
          { type: 'fill', locator: { strategy: 'label', label: 'Invoice amount' }, inputKey: 'amount' },
          { type: 'submit', locator: { strategy: 'role', role: 'button', name: 'Prepare for human approval' } },
          { type: 'waitFor', locator: { strategy: 'testId', testId: 'challenge-invoice-success' }, timeoutMs: 10_000 },
          { type: 'extract', locator: { strategy: 'testId', testId: 'challenge-invoice-id' }, outputKey: 'invoice_id', source: 'text', valueType: 'string' },
          { type: 'extract', locator: { strategy: 'testId', testId: 'challenge-invoice-status' }, outputKey: 'status', source: 'text', valueType: 'string' },
          { type: 'extract', locator: { strategy: 'testId', testId: 'challenge-invoice-amount' }, outputKey: 'amount', source: 'attribute', attribute: 'data-value', valueType: 'number' },
          { type: 'extract', locator: { strategy: 'testId', testId: 'challenge-invoice-replayed' }, outputKey: 'replayed', source: 'attribute', attribute: 'data-value', valueType: 'boolean' },
        ],
      },
    ],
  };
}
