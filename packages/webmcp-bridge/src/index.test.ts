/* eslint-disable @typescript-eslint/no-explicit-any */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { sampleAdapter } from '@ghostlayer/adapter-schema';
import {
  discoverWebMcpTools,
  GHOSTLAYER_LEGACY_TOOL_PREFIX,
  legacyWebMcpToolName,
  registerAdapterWithWebMcp,
  supportsNativeWebMcp,
  type DocumentWithModelContext,
} from './index';

const originalSecureContext = Object.getOwnPropertyDescriptor(globalThis, 'isSecureContext');
const DEMO_ORIGIN = 'http://localhost:4174';

afterEach(() => {
  if (originalSecureContext) Object.defineProperty(globalThis, 'isSecureContext', originalSecureContext);
  else Reflect.deleteProperty(globalThis, 'isSecureContext');
});

function secure(): void {
  Object.defineProperty(globalThis, 'isSecureContext', { value: true, configurable: true });
}

describe('WebMCP bridge', () => {
  it('remains unavailable without document.modelContext and does not crash', async () => {
    secure();
    expect(supportsNativeWebMcp(undefined)).toBe(false);
    const result = await registerAdapterWithWebMcp(sampleAdapter, {}, { origin: DEMO_ORIGIN });
    expect(result.status).toBe('unavailable');
  });

  it('registers read tools by default with strict input, output, cancellation, and lifecycle checks', async () => {
    secure();
    const registered: Array<{ tool: any; options: any }> = [];
    const fakeDocument = {
      modelContext: {
        registerTool: vi.fn(async (tool, options) => { registered.push({ tool, options }); }),
      },
    } as unknown as DocumentWithModelContext;
    const handler = vi.fn(async () => ({ customer_id: 'CUS-1001', name: 'Mali Anan', phone_number: '081-555-0101', status: 'active' }));
    const result = await registerAdapterWithWebMcp(sampleAdapter, { find_customer: handler }, { document: fakeDocument, origin: DEMO_ORIGIN });
    expect(result.status).toBe('registered');
    expect(result.registeredTools).toEqual(['find_customer']);
    expect(result.skippedTools).toEqual(['create_invoice_draft']);
    expect(registered[0]?.tool.annotations.readOnlyHint).toBe(true);
    await expect(registered[0]!.tool.execute({ phone_number: 123 }, { signal: new AbortController().signal })).rejects.toThrow('input');
    await expect(registered[0]!.tool.execute({ phone_number: '081-555-0101' }, { signal: AbortSignal.abort() })).rejects.toMatchObject({ name: 'AbortError' });
    await expect(registered[0]!.tool.execute({ phone_number: '081-555-0101' }, { signal: new AbortController().signal })).resolves.toMatchObject({ customer_id: 'CUS-1001' });
    expect(handler).toHaveBeenCalledOnce();
    result.dispose();
    expect(registered[0]?.options.signal.aborted).toBe(true);
  });

  it('requires an explicit consequential opt-in and validates consequential output', async () => {
    secure();
    const registered: any[] = [];
    const fakeDocument = { modelContext: { registerTool: vi.fn(async (tool) => { registered.push(tool); }) } } as unknown as DocumentWithModelContext;
    const result = await registerAdapterWithWebMcp(sampleAdapter, {
      find_customer: async () => ({ customer_id: 'CUS-1001', name: 'Mali Anan', phone_number: '081-555-0101', status: 'active' }),
      create_invoice_draft: async () => ({ invoice_id: 'INV-0001', status: 'draft', amount: 1250 }),
    }, { document: fakeDocument, origin: DEMO_ORIGIN, includeConsequential: true });
    expect(result.status).toBe('registered');
    expect(result.registeredTools).toEqual(['find_customer', 'create_invoice_draft']);
    expect(registered[1].annotations.readOnlyHint).toBe(false);
    await expect(registered[1].execute({ customer_id: 'CUS-1001', description: 'Retainer', amount: 1250 }, { signal: new AbortController().signal })).resolves.toEqual({ invoice_id: 'INV-0001', status: 'draft', amount: 1250 });
  });

  it('publishes Legacy providers under the GhostLayer namespace while handlers remain canonical', async () => {
    secure();
    const registered: any[] = [];
    const fakeDocument = { modelContext: { registerTool: vi.fn(async (tool) => { registered.push(tool); }) } } as unknown as DocumentWithModelContext;
    const handler = vi.fn(async () => ({ customer_id: 'CUS-1001', name: 'Mali Anan', phone_number: '081-555-0101', status: 'active' }));
    const result = await registerAdapterWithWebMcp(sampleAdapter, { find_customer: handler }, {
      document: fakeDocument,
      origin: DEMO_ORIGIN,
      toolNamePrefix: GHOSTLAYER_LEGACY_TOOL_PREFIX,
    });
    expect(result.status).toBe('registered');
    expect(result.registeredTools).toEqual(['ghostlayer_find_customer']);
    expect(registered[0].name).toBe(legacyWebMcpToolName('find_customer'));
    await expect(registered[0].execute({ phone_number: '081-555-0101' })).resolves.toMatchObject({ customer_id: 'CUS-1001' });
    expect(handler).toHaveBeenCalledOnce();
  });

  it('supports Chromium one-argument callbacks while enforcing output shape, size, and lifecycle cancellation', async () => {
    secure();
    const registered: any[] = [];
    const fakeDocument = { modelContext: { registerTool: vi.fn(async (tool) => { registered.push(tool); }) } } as unknown as DocumentWithModelContext;
    const lifecycle = new AbortController();
    let output: unknown = { customer_id: 'CUS-1001', name: 'Mali Anan', phone_number: '081-555-0101', status: 'active' };
    const handler = vi.fn(async (_input: Record<string, unknown>, { signal }: { signal: AbortSignal }) => {
      if (signal.aborted) throw signal.reason;
      return output;
    });
    const result = await registerAdapterWithWebMcp(sampleAdapter, { find_customer: handler }, { document: fakeDocument, origin: DEMO_ORIGIN, signal: lifecycle.signal });
    expect(result.status).toBe('registered');
    await expect(registered[0].execute({ phone_number: '081-555-0101' })).resolves.toMatchObject({ customer_id: 'CUS-1001' });
    output = { customer_id: 'CUS-1001' };
    await expect(registered[0].execute({ phone_number: '081-555-0101' })).rejects.toThrow('output');
    output = { customer_id: 'CUS-1001', name: 'x'.repeat(2_000), phone_number: '081-555-0101', status: 'active' };
    await expect(registered[0].execute({ phone_number: '081-555-0101' })).rejects.toThrow('result limit');
    lifecycle.abort();
    await expect(registered[0].execute({ phone_number: '081-555-0101' })).rejects.toMatchObject({ name: 'AbortError' });
  });

  it('rejects a disabled or wrong-origin adapter before registration', async () => {
    secure();
    const registerTool = vi.fn();
    const fakeDocument = { modelContext: { registerTool } } as unknown as DocumentWithModelContext;
    const disabled = { ...sampleAdapter, enabled: false };
    const result = await registerAdapterWithWebMcp(disabled, { find_customer: vi.fn() }, { document: fakeDocument, origin: DEMO_ORIGIN });
    expect(result.status).toBe('failed');
    expect(registerTool).not.toHaveBeenCalled();
  });

  it('discovers only bounded tools with supported object schemas', async () => {
    secure();
    const fakeDocument = {
      modelContext: {
        registerTool: vi.fn(),
        getTools: vi.fn(async () => [{
          name: 'find_customer',
          title: 'Find customer',
          description: 'Find a fictional customer.',
          inputSchema: JSON.stringify(sampleAdapter.tools[0]!.inputSchema),
          origin: DEMO_ORIGIN,
          annotations: { readOnlyHint: true, untrustedContentHint: true },
        }, {
          name: 'unsafe',
          description: 'Unsupported schema stays inspect-only.',
          inputSchema: JSON.stringify({ type: 'array' }),
          origin: DEMO_ORIGIN,
        }]),
      },
    } as unknown as DocumentWithModelContext;
    const tools = await discoverWebMcpTools(fakeDocument);
    expect(tools[0]).toMatchObject({ name: 'find_customer', invokable: true, inputSchema: { type: 'object' } });
    expect(tools[1]).toMatchObject({ name: 'unsafe', invokable: false, inputSchema: null });
  });
});
