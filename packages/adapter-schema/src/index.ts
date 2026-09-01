import { z } from 'zod';

export const ADAPTER_SCHEMA_VERSION = '1.1.0' as const;
export const LEGACY_ADAPTER_SCHEMA_VERSIONS = ['1.0.0'] as const;
export const STEP_TYPES = ['navigate', 'click', 'fill', 'select', 'waitFor', 'extract', 'submit'] as const;
export const RISK_LEVELS = ['read', 'draft', 'confirm', 'destructive'] as const;

const identifier = z.string().min(1).max(128).regex(/^[A-Za-z][A-Za-z0-9_.-]*$/, 'Use letters, numbers, dot, dash, or underscore.');
const fieldIdentifier = z.string().min(1).max(64).regex(/^[A-Za-z][A-Za-z0-9_]*$/);
const safeDescription = z.string().trim().min(1).max(500);
const credentialLikeName = /password|passwd|secret|token|cookie|authorization|credential|api[_-]?key/i;

/** Conservative linear-time subset: no groups, alternation, dot, backreferences, or unbounded quantifiers. */
export function isSafeRegexPattern(value: string): boolean {
  if (value.length === 0 || value.length > 120 || /[()*+.|]/.test(value) || /\\(?:[1-9]|k[<{]|[pP]{)/.test(value)) return false;
  let remainder = value.replace(/^\^/, '').replace(/\$$/, '');
  remainder = remainder.replace(/\\[dDsSwWtnrfv\\\-\[\]{}^$?]/g, 'x');
  remainder = remainder.replace(/\[(?:\\.|[^\]\\])*\]/g, 'x');
  remainder = remainder.replace(/\{(\d+)(?:,(\d+))?\}/g, (_match, minimum: string, maximum?: string) => {
    const min = Number(minimum);
    const max = maximum === undefined ? min : Number(maximum);
    return min <= max && max <= 1_000 ? '' : '!';
  });
  remainder = remainder.replaceAll('?', '');
  return !/[\\\[\]{}^$!]/.test(remainder);
}

export function isExactHttpOrigin(value: string): boolean {
  try {
    const url = new URL(value);
    return (
      (url.protocol === 'http:' || url.protocol === 'https:') &&
      url.origin === value &&
      url.pathname === '/' &&
      url.search === '' &&
      url.hash === '' &&
      url.username === '' &&
      url.password === ''
    );
  } catch {
    return false;
  }
}

export function isSafeCssSelector(value: string): boolean {
  const selector = value.trim();
  if (selector.length === 0 || selector.length > 160) return false;
  if (selector.includes(',') || selector.includes('>>>')) return false;
  if (/:has\(|:nth-(?:child|of-type)\(/i.test(selector)) return false;
  if (/(?:^|\s)(?:script|style|iframe|object|embed)(?:$|[.#[:\s>+~])/i.test(selector)) return false;
  if (/\*|javascript:/i.test(selector)) return false;
  return /^(?:[#.\[]|[a-zA-Z])[a-zA-Z0-9_#.[\]="'~|^$*+>:\-\s]*$/.test(selector);
}

export const locatorSchema = z.discriminatedUnion('strategy', [
  z.object({ strategy: z.literal('role'), role: z.enum(['button', 'textbox', 'combobox', 'link', 'heading', 'status']), name: z.string().trim().min(1).max(120) }).strict(),
  z.object({ strategy: z.literal('label'), label: z.string().trim().min(1).max(120) }).strict(),
  z.object({ strategy: z.literal('testId'), testId: z.string().min(1).max(100).regex(/^[A-Za-z0-9_.:-]+$/) }).strict(),
  z.object({ strategy: z.literal('css'), selector: z.string().refine(isSafeCssSelector, 'Use one stable, non-positional CSS selector.') }).strict(),
]);

const stringPropertySchema = z.object({
  type: z.literal('string'),
  title: z.string().trim().min(1).max(80).optional(),
  description: z.string().trim().min(1).max(240).optional(),
  minLength: z.number().int().min(0).max(10_000).optional(),
  maxLength: z.number().int().min(1).max(10_000).optional(),
  pattern: z.string().max(120).refine(isSafeRegexPattern, 'pattern must use the bounded GhostLayer regex subset.').optional(),
  format: z.enum(['tel', 'text', 'id']).optional(),
}).strict().superRefine((value, context) => {
  if (value.minLength !== undefined && value.maxLength !== undefined && value.minLength > value.maxLength) {
    context.addIssue({ code: 'custom', message: 'minLength cannot exceed maxLength.' });
  }
  if (value.pattern) {
    try { new RegExp(value.pattern); } catch { context.addIssue({ code: 'custom', message: 'pattern must be a valid regular expression.' }); }
  }
});

const numberPropertySchema = z.object({
  type: z.literal('number'),
  title: z.string().trim().min(1).max(80).optional(),
  description: z.string().trim().min(1).max(240).optional(),
  minimum: z.number().finite().optional(),
  maximum: z.number().finite().optional(),
}).strict().superRefine((value, context) => {
  if (value.minimum !== undefined && value.maximum !== undefined && value.minimum > value.maximum) {
    context.addIssue({ code: 'custom', message: 'minimum cannot exceed maximum.' });
  }
});

const booleanPropertySchema = z.object({
  type: z.literal('boolean'),
  title: z.string().trim().min(1).max(80).optional(),
  description: z.string().trim().min(1).max(240).optional(),
}).strict();

export const dataPropertySchema = z.discriminatedUnion('type', [stringPropertySchema, numberPropertySchema, booleanPropertySchema]);

export const objectDataSchema = z.object({
  type: z.literal('object'),
  properties: z.record(fieldIdentifier, dataPropertySchema),
  required: z.array(fieldIdentifier).max(50),
  additionalProperties: z.literal(false),
}).strict().superRefine((schema, context) => {
  const seen = new Set<string>();
  for (const key of schema.required) {
    if (seen.has(key)) context.addIssue({ code: 'custom', path: ['required'], message: `Duplicate required field: ${key}` });
    seen.add(key);
    if (!(key in schema.properties)) context.addIssue({ code: 'custom', path: ['required'], message: `Unknown required field: ${key}` });
  }
  for (const key of Object.keys(schema.properties)) {
    if (credentialLikeName.test(key)) context.addIssue({ code: 'custom', path: ['properties', key], message: 'Credential-like fields are not supported in this MVP.' });
  }
});

const sameOriginPath = z.string().min(1).max(300).superRefine((path, context) => {
  if (!path.startsWith('/') || path.startsWith('//') || path.includes('\\') || /[\u0000-\u001f\u007f]/.test(path)) {
    context.addIssue({ code: 'custom', message: 'Navigation must use a canonical same-origin path.' });
  }
});
const navigateStepSchema = z.object({ type: z.literal('navigate'), path: sameOriginPath }).strict();
const clickStepSchema = z.object({ type: z.literal('click'), locator: locatorSchema }).strict();
const fillStepSchema = z.object({ type: z.literal('fill'), locator: locatorSchema, inputKey: fieldIdentifier }).strict();
const selectStepSchema = z.object({ type: z.literal('select'), locator: locatorSchema, inputKey: fieldIdentifier }).strict();
const waitForStepSchema = z.object({ type: z.literal('waitFor'), locator: locatorSchema, timeoutMs: z.number().int().min(100).max(10_000).default(5_000) }).strict();
const extractStepSchema = z.object({
  type: z.literal('extract'),
  locator: locatorSchema,
  outputKey: fieldIdentifier,
  source: z.enum(['text', 'value', 'attribute']).default('text'),
  attribute: z.string().min(1).max(80).regex(/^(?:data-[a-z0-9-]+|aria-[a-z0-9-]+)$/).optional(),
  valueType: z.enum(['string', 'number', 'boolean']).default('string'),
}).strict().superRefine((step, context) => {
  if ((step.source === 'attribute') !== Boolean(step.attribute)) {
    context.addIssue({ code: 'custom', message: 'attribute is required only when source is attribute.' });
  }
});
const submitStepSchema = z.object({ type: z.literal('submit'), locator: locatorSchema }).strict();

export const adapterStepSchema = z.discriminatedUnion('type', [
  navigateStepSchema,
  clickStepSchema,
  fillStepSchema,
  selectStepSchema,
  waitForStepSchema,
  extractStepSchema,
  submitStepSchema,
]);

export const adapterToolSchema = z.object({
  name: identifier,
  description: safeDescription,
  riskLevel: z.enum(RISK_LEVELS),
  inputSchema: objectDataSchema,
  steps: z.array(adapterStepSchema).min(1).max(50),
  outputSchema: objectDataSchema,
}).strict().superRefine((tool, context) => {
  const submitIndexes = tool.steps.flatMap((step, index) => step.type === 'submit' ? [index] : []);
  if (submitIndexes.length > 1) context.addIssue({ code: 'custom', path: ['steps'], message: 'A tool may contain at most one submit step.' });
  const requiresApproval = tool.riskLevel === 'confirm' || tool.riskLevel === 'destructive';
  if (submitIndexes.length > 0 && !requiresApproval) {
    context.addIssue({ code: 'custom', path: ['riskLevel'], message: 'Tools that submit must use confirm or destructive risk.' });
  }
  if (requiresApproval && submitIndexes.length !== 1) {
    context.addIssue({ code: 'custom', path: ['steps'], message: 'Confirm and destructive tools must contain exactly one submit step.' });
  }
  const submitIndex = submitIndexes[0];
  if (submitIndex !== undefined) {
    for (let index = submitIndex + 1; index < tool.steps.length; index += 1) {
      const type = tool.steps[index]?.type;
      if (type !== 'waitFor' && type !== 'extract') {
        context.addIssue({ code: 'custom', path: ['steps', index], message: 'Only waitFor and extract may follow submit.' });
      }
    }
  }
  tool.steps.forEach((step, index) => {
    if ((step.type === 'fill' || step.type === 'select') && !(step.inputKey in tool.inputSchema.properties)) {
      context.addIssue({ code: 'custom', path: ['steps', index, 'inputKey'], message: `Unknown input field: ${step.inputKey}` });
    }
    if (step.type === 'extract' && !(step.outputKey in tool.outputSchema.properties)) {
      context.addIssue({ code: 'custom', path: ['steps', index, 'outputKey'], message: `Unknown output field: ${step.outputKey}` });
    }
    if (step.type === 'click' && step.locator.strategy === 'role' && /\b(?:delete|remove|send|publish|pay|submit|create)\b/i.test(step.locator.name) && !requiresApproval) {
      context.addIssue({ code: 'custom', path: ['steps', index], message: 'Potentially consequential clicks require confirm or destructive risk.' });
    }
  });
});

export const adapterSchema = z.object({
  id: identifier,
  schemaVersion: z.literal(ADAPTER_SCHEMA_VERSION),
  revision: z.number().int().min(1).max(Number.MAX_SAFE_INTEGER),
  name: z.string().trim().min(1).max(120),
  description: safeDescription,
  enabled: z.boolean(),
  allowedOrigins: z.array(z.string().refine(isExactHttpOrigin, 'Use an exact HTTP(S) origin with no path, credentials, query, or hash.')).min(1).max(20),
  tools: z.array(adapterToolSchema).min(1).max(50),
  createdAt: z.string().datetime({ offset: true }),
  updatedAt: z.string().datetime({ offset: true }),
}).strict().superRefine((adapter, context) => {
  if (new Date(adapter.updatedAt).getTime() < new Date(adapter.createdAt).getTime()) {
    context.addIssue({ code: 'custom', path: ['updatedAt'], message: 'updatedAt cannot precede createdAt.' });
  }
  const originSet = new Set(adapter.allowedOrigins);
  if (originSet.size !== adapter.allowedOrigins.length) context.addIssue({ code: 'custom', path: ['allowedOrigins'], message: 'Origins must be unique.' });
  const toolSet = new Set<string>();
  adapter.tools.forEach((tool, index) => {
    if (toolSet.has(tool.name)) context.addIssue({ code: 'custom', path: ['tools', index, 'name'], message: `Duplicate tool name: ${tool.name}` });
    toolSet.add(tool.name);
  });
});

export type Locator = z.infer<typeof locatorSchema>;
export type DataProperty = z.infer<typeof dataPropertySchema>;
export type ObjectDataSchema = z.infer<typeof objectDataSchema>;
export type AdapterStep = z.infer<typeof adapterStepSchema>;
export type AdapterTool = z.infer<typeof adapterToolSchema>;
export type Adapter = z.infer<typeof adapterSchema>;
export type RiskLevel = AdapterTool['riskLevel'];

export const adapterJsonSchema = z.toJSONSchema(adapterSchema, {
  target: 'draft-2020-12',
  io: 'input',
});

export function validateAdapter(value: unknown) {
  return adapterSchema.safeParse(value);
}

export function isOriginAllowed(adapter: Adapter, origin: string): boolean {
  return isExactHttpOrigin(origin) && adapter.enabled && adapter.allowedOrigins.includes(origin);
}

function schemaForProperty(property: DataProperty): z.ZodType {
  if (property.type === 'string') {
    let schema = z.string();
    if (property.minLength !== undefined) schema = schema.min(property.minLength);
    if (property.maxLength !== undefined) schema = schema.max(property.maxLength);
    if (property.pattern) schema = schema.regex(new RegExp(property.pattern));
    return schema;
  }
  if (property.type === 'number') {
    let schema = z.number().finite();
    if (property.minimum !== undefined) schema = schema.min(property.minimum);
    if (property.maximum !== undefined) schema = schema.max(property.maximum);
    return schema;
  }
  return z.boolean();
}

function createDataSchema(schemaDefinition: ObjectDataSchema) {
  const shape: Record<string, z.ZodType> = {};
  const required = new Set(schemaDefinition.required);
  for (const [key, property] of Object.entries(schemaDefinition.properties)) {
    const schema = schemaForProperty(property);
    shape[key] = required.has(key) ? schema : schema.optional();
  }
  return z.object(shape).strict();
}

export function createToolInputSchema(tool: AdapterTool) {
  return createDataSchema(tool.inputSchema);
}

export function createToolOutputSchema(tool: AdapterTool) {
  return createDataSchema(tool.outputSchema);
}

export function validateToolInput(tool: AdapterTool, value: unknown) {
  return createToolInputSchema(tool).safeParse(value);
}

export function validateToolOutput(tool: AdapterTool, value: unknown) {
  return createToolOutputSchema(tool).safeParse(value);
}

const timestamp = '2026-08-31T00:00:00.000Z';

// Keep the development fixture as data rather than evaluating the schema at
// module load time. Besides making imports side-effect free, this lets the
// reviewed store build tree-shake every loopback-only fixture value.
export const sampleAdapter: Adapter = {
  id: 'demo-crm-adapter',
  schemaVersion: ADAPTER_SCHEMA_VERSION,
  revision: 1,
  name: 'Demo CRM Adapter',
  description: 'Safe, permission-scoped tools for the fictional Demo CRM included with GhostLayer.',
  enabled: true,
  allowedOrigins: ['http://localhost:4174', 'http://127.0.0.1:4174'],
  createdAt: timestamp,
  updatedAt: timestamp,
  tools: [
    {
      name: 'find_customer',
      description: 'Find a fictional customer by phone number and return a structured record.',
      riskLevel: 'read',
      inputSchema: {
        type: 'object',
        properties: {
          phone_number: { type: 'string', title: 'Phone number', description: 'A fictional Demo CRM phone number.', minLength: 7, maxLength: 24, format: 'tel' },
        },
        required: ['phone_number'],
        additionalProperties: false,
      },
      outputSchema: {
        type: 'object',
        properties: {
          customer_id: { type: 'string' },
          name: { type: 'string' },
          phone_number: { type: 'string' },
          status: { type: 'string' },
        },
        required: ['customer_id', 'name', 'phone_number', 'status'],
        additionalProperties: false,
      },
      steps: [
        { type: 'fill', locator: { strategy: 'label', label: 'Customer phone number' }, inputKey: 'phone_number' },
        { type: 'click', locator: { strategy: 'role', role: 'button', name: 'Search customers' } },
        { type: 'waitFor', locator: { strategy: 'testId', testId: 'customer-result' }, timeoutMs: 3_000 },
        { type: 'extract', locator: { strategy: 'testId', testId: 'customer-id' }, outputKey: 'customer_id', source: 'text', valueType: 'string' },
        { type: 'extract', locator: { strategy: 'testId', testId: 'customer-name' }, outputKey: 'name', source: 'text', valueType: 'string' },
        { type: 'extract', locator: { strategy: 'testId', testId: 'customer-phone' }, outputKey: 'phone_number', source: 'text', valueType: 'string' },
        { type: 'extract', locator: { strategy: 'testId', testId: 'customer-status' }, outputKey: 'status', source: 'text', valueType: 'string' },
      ],
    },
    {
      name: 'create_invoice_draft',
      description: 'Prepare an invoice draft, pause for approval, then create exactly one fictional draft.',
      riskLevel: 'confirm',
      inputSchema: {
        type: 'object',
        properties: {
          customer_id: { type: 'string', title: 'Customer ID', description: 'The exact fictional customer identifier returned by find_customer, formatted CUS-####.', minLength: 8, maxLength: 8, pattern: '^CUS-[0-9]{4}$', format: 'id' },
          description: { type: 'string', title: 'Description', description: 'A short, non-sensitive description for the fictional invoice draft.', minLength: 1, maxLength: 160, format: 'text' },
          amount: { type: 'number', title: 'Amount', description: 'Invoice total in USD with at most two decimal places; the tenant limit is enforced by the server.', minimum: 0.01, maximum: 1_000_000 },
        },
        required: ['customer_id', 'description', 'amount'],
        additionalProperties: false,
      },
      outputSchema: {
        type: 'object',
        properties: {
          invoice_id: { type: 'string' },
          status: { type: 'string' },
          amount: { type: 'number' },
        },
        required: ['invoice_id', 'status', 'amount'],
        additionalProperties: false,
      },
      steps: [
        { type: 'click', locator: { strategy: 'role', role: 'button', name: 'Invoices' } },
        { type: 'click', locator: { strategy: 'role', role: 'button', name: 'New invoice draft' } },
        { type: 'fill', locator: { strategy: 'label', label: 'Invoice customer ID' }, inputKey: 'customer_id' },
        { type: 'fill', locator: { strategy: 'label', label: 'Invoice description' }, inputKey: 'description' },
        { type: 'fill', locator: { strategy: 'label', label: 'Invoice amount' }, inputKey: 'amount' },
        { type: 'submit', locator: { strategy: 'role', role: 'button', name: 'Create invoice draft' } },
        { type: 'waitFor', locator: { strategy: 'testId', testId: 'invoice-success' }, timeoutMs: 3_000 },
        { type: 'extract', locator: { strategy: 'testId', testId: 'created-invoice-id' }, outputKey: 'invoice_id', source: 'text', valueType: 'string' },
        { type: 'extract', locator: { strategy: 'testId', testId: 'created-invoice-status' }, outputKey: 'status', source: 'text', valueType: 'string' },
        { type: 'extract', locator: { strategy: 'testId', testId: 'created-invoice-amount' }, outputKey: 'amount', source: 'attribute', attribute: 'data-value', valueType: 'number' },
      ],
    },
  ],
};

export * from './integrity.js';
export * from './migrations.js';
export * from './secure-json.js';
