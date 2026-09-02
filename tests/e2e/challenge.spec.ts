import { chromium, expect, test, type BrowserContext, type Page } from '@playwright/test';

const CHALLENGE_BASE = 'http://127.0.0.1:4176';

interface WebMcpTool {
  name: string;
}

async function toolNames(page: Page): Promise<string[]> {
  return page.evaluate(async () => {
    const modelContext = (document as unknown as { modelContext: { getTools(): Promise<WebMcpTool[]> } }).modelContext;
    return (await modelContext.getTools()).map((tool) => tool.name).sort();
  });
}

async function executeTool<T>(page: Page, name: string, input: Record<string, unknown>): Promise<T> {
  return page.evaluate(async ({ toolName, toolInput }) => {
    const modelContext = (document as unknown as {
      modelContext: {
        getTools(): Promise<WebMcpTool[]>;
        executeTool(tool: WebMcpTool, input: string): Promise<string>;
      };
    }).modelContext;
    const tool = (await modelContext.getTools()).find((candidate) => candidate.name === toolName);
    if (!tool) throw new Error(`Missing WebMCP tool: ${toolName}`);
    return JSON.parse(await modelContext.executeTool(tool, JSON.stringify(toolInput))) as T;
  }, { toolName: name, toolInput: input });
}

test.describe.serial('GhostLayer Challenge Edition', () => {
  test('is a no-network, tab-isolated fictional sandbox with bounded human approval', async ({ context, page }) => {
    const apiRequests: string[] = [];
    page.on('request', (request) => {
      if (new URL(request.url()).pathname.startsWith('/api/')) apiRequests.push(request.url());
    });
    await page.goto(CHALLENGE_BASE);
    await expect(page.getByRole('heading', { name: /Give agents tools/ })).toBeVisible();
    await expect(page.getByText('Human authority layer for agent-ready SaaS')).toBeVisible();
    await expect(page.getByTestId('challenge-integration')).toContainText('From a safe sandbox to your production API.');
    await expect(page.getByTestId('challenge-app')).toHaveAttribute('data-interactive', 'true');
    await expect(page.getByTestId('challenge-invoice-count')).toHaveText('0');

    await page.getByLabel('Customer phone number').fill('+1-202-555-0120');
    await page.getByRole('button', { name: 'Search customer' }).click();
    await expect(page.getByTestId('challenge-customer-id')).toHaveText('CUS-2001');

    await page.getByRole('button', { name: 'Prepare for human approval' }).click();
    await expect(page.getByTestId('challenge-approval')).toBeVisible();
    await expect(page.getByTestId('challenge-invoice-count')).toHaveText('0');
    await page.getByRole('button', { name: 'Reject — create nothing' }).click();
    await expect(page.getByTestId('challenge-invoice-count')).toHaveText('0');

    await page.getByRole('button', { name: 'Prepare for human approval' }).click();
    await page.getByRole('button', { name: 'Approve and create once' }).click();
    await expect(page.getByTestId('challenge-invoice-count')).toHaveText('1');
    await expect(page.getByTestId('challenge-invoice-row')).toHaveCount(1);
    expect(apiRequests).toEqual([]);

    const second = await context.newPage();
    await second.goto(CHALLENGE_BASE);
    await expect(second.getByTestId('challenge-invoice-count')).toHaveText('0');
    await second.close();
    await page.reload();
    await expect(page.getByTestId('challenge-invoice-count')).toHaveText('0');

    for (const path of ['/pilot', '/pilot/admin', '/pilot/legacy', '/api/pilot/state']) {
      expect((await context.request.get(`${CHALLENGE_BASE}${path}`)).status()).toBe(404);
    }
  });

  test('executes the real WebMCP chain, waits for the human, and replays without a duplicate', async () => {
    let context: BrowserContext | undefined;
    try {
      context = await chromium.launchPersistentContext('', {
        headless: false,
        args: ['--no-first-run', '--no-default-browser-check', '--enable-features=WebMCP'],
      });
      const page = context.pages()[0] ?? await context.newPage();
      await page.goto(CHALLENGE_BASE);
      await expect(page.getByTestId('challenge-webmcp-status')).toContainText('2 WebMCP tools live');
      expect(await toolNames(page)).toEqual(['create_invoice_draft', 'find_customer']);

      const customer = await executeTool<{ customer_id: string; name: string; status: string }>(page, 'find_customer', { phone_number: '+1-202-555-0120' });
      expect(customer).toEqual(expect.objectContaining({ customer_id: 'CUS-2001', name: 'Araya Niran', status: 'active' }));
      await expect(page.getByTestId('challenge-customer-id')).toHaveText('CUS-2001');

      const invoiceInput = { customer_id: 'CUS-2001', description: 'September accessibility audit', amount: 125 };
      const pendingCall = executeTool<{ invoice_id: string; status: string; amount: number; replayed: boolean }>(page, 'create_invoice_draft', invoiceInput);
      await expect(page.getByTestId('challenge-approval')).toBeVisible();
      await expect(page.getByTestId('challenge-invoice-count')).toHaveText('0');
      await page.getByRole('button', { name: 'Approve and create once' }).click();
      const created = await pendingCall;
      expect(created).toEqual({ invoice_id: 'INV-DEMO-0001', status: 'draft', amount: 125, replayed: false });

      const replayed = await executeTool<{ invoice_id: string; replayed: boolean }>(page, 'create_invoice_draft', invoiceInput);
      expect(replayed).toEqual(expect.objectContaining({ invoice_id: 'INV-DEMO-0001', replayed: true }));
      await expect(page.getByTestId('challenge-invoice-row')).toHaveCount(1);

      const rejectedCall = page.evaluate(async () => {
        const modelContext = (document as unknown as {
          modelContext: { getTools(): Promise<WebMcpTool[]>; executeTool(tool: WebMcpTool, input: string): Promise<string> };
        }).modelContext;
        const tool = (await modelContext.getTools()).find((candidate) => candidate.name === 'create_invoice_draft');
        if (!tool) throw new Error('Missing create_invoice_draft.');
        try {
          await modelContext.executeTool(tool, JSON.stringify({ customer_id: 'CUS-2002', description: 'Rejected draft', amount: 80 }));
          return { ok: true };
        } catch (error) {
          return { ok: false, name: error instanceof Error ? error.name : 'Error' };
        }
      });
      await expect(page.getByTestId('challenge-approval')).toBeVisible();
      await page.getByRole('button', { name: 'Reject — create nothing' }).click();
      expect(await rejectedCall).toEqual(expect.objectContaining({ ok: false }));
      await expect(page.getByTestId('challenge-invoice-row')).toHaveCount(1);

      await page.getByRole('button', { name: 'Pause agent tools' }).click();
      await expect(page.getByTestId('challenge-webmcp-status')).toContainText('Paused by human');
      await expect.poll(() => toolNames(page)).toEqual([]);
      await page.getByRole('button', { name: 'Resume agent tools' }).click();
      await expect.poll(() => toolNames(page)).toEqual(['create_invoice_draft', 'find_customer']);
    } finally {
      await context?.close();
    }
  });
});
