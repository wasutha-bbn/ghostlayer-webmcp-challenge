import { afterEach, describe, expect, it, vi } from 'vitest';
import { adapterSchema, validateToolInput } from '@ghostlayer/adapter-schema';
import {
  CHALLENGE_APPROVAL_TTL_MS,
  challengeInvoiceKey,
  createChallengeAdapter,
  normalizeChallengeInvoice,
  scheduleChallengeApprovalExpiry,
} from './challenge-contract';

afterEach(() => {
  vi.useRealTimers();
});

describe('GhostLayer Challenge contract', () => {
  it('publishes one read tool and one human-approved consequential tool', () => {
    const adapter = createChallengeAdapter('https://challenge.example');
    expect(adapterSchema.parse(adapter).tools.map((tool) => [tool.name, tool.riskLevel])).toEqual([
      ['find_customer', 'read'],
      ['create_invoice_draft', 'confirm'],
    ]);
    const invoiceTool = adapter.tools[1]!;
    expect(validateToolInput(invoiceTool, { customer_id: 'CUS-2001', description: 'Accessibility audit', amount: 125 }).success).toBe(true);
    expect(validateToolInput(invoiceTool, { customer_id: 'CUS-9999', description: 'Accessibility audit', amount: 125 }).success).toBe(true);
  });

  it('normalizes input, bounds effects, and derives a stable replay key', () => {
    const input = { customer_id: ' CUS-2001 ', description: ' Accessibility audit ', amount: 125 };
    expect(normalizeChallengeInvoice(input)).toEqual({ customer_id: 'CUS-2001', description: 'Accessibility audit', amount: 125 });
    expect(challengeInvoiceKey(input)).toBe(challengeInvoiceKey({ customer_id: 'CUS-2001', description: 'Accessibility audit', amount: 125 }));
    expect(() => normalizeChallengeInvoice({ customer_id: 'CUS-9999', description: 'No customer', amount: 10 })).toThrow(/does not exist/);
    expect(() => normalizeChallengeInvoice({ customer_id: 'CUS-2001', description: 'Too large', amount: 5_000.01 })).toThrow(/between/);
    expect(() => normalizeChallengeInvoice({ customer_id: 'CUS-2001', description: 'Precision', amount: 1.001 })).toThrow(/decimal/);
  });

  it('expires approval after exactly two minutes and supports cleanup', () => {
    vi.useFakeTimers();
    const onExpire = vi.fn();
    const cancel = scheduleChallengeApprovalExpiry(onExpire);

    vi.advanceTimersByTime(CHALLENGE_APPROVAL_TTL_MS - 1);
    expect(onExpire).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(onExpire).toHaveBeenCalledOnce();

    const cancelledExpiry = vi.fn();
    scheduleChallengeApprovalExpiry(cancelledExpiry)();
    vi.advanceTimersByTime(CHALLENGE_APPROVAL_TTL_MS);
    expect(cancelledExpiry).not.toHaveBeenCalled();

    cancel();
  });
});
