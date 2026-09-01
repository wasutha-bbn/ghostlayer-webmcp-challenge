import {
  adapterSchema,
  isOriginAllowed,
  objectDataSchema,
  parseSecureJson,
  validateToolInput,
  validateToolOutput,
  type Adapter,
  type AdapterTool,
  type ObjectDataSchema,
} from '@ghostlayer/adapter-schema';

export const WEBMCP_RESULT_BYTE_LIMIT = 1_536;
export const GHOSTLAYER_LEGACY_TOOL_PREFIX = 'ghostlayer_';
const WEBMCP_SCHEMA_BYTE_LIMIT = 32_000;
const WEBMCP_TOOL_LIMIT = 50;

export interface NativeToolDefinition {
  name: string;
  title?: string;
  description: string;
  inputSchema: object;
  annotations?: {
    readOnlyHint?: boolean;
    untrustedContentHint?: boolean;
  };
  execute(input: unknown, context?: { signal?: AbortSignal }): Promise<unknown>;
}

export interface RegisteredToolLike {
  name: string;
  title?: string | null;
  description: string;
  inputSchema: string | object;
  origin?: string;
  window?: WindowProxy;
  annotations?: {
    readOnlyHint?: boolean;
    untrustedContentHint?: boolean;
  };
}

export interface ModelContextLike {
  registerTool(tool: NativeToolDefinition, options?: { signal?: AbortSignal }): Promise<undefined | void>;
  getTools?(): Promise<RegisteredToolLike[]>;
  executeTool?(tool: RegisteredToolLike, input: string, options?: { signal?: AbortSignal }): Promise<string | null>;
  addEventListener?(type: 'toolchange', listener: EventListener): void;
  removeEventListener?(type: 'toolchange', listener: EventListener): void;
}

export type DocumentWithModelContext = Document & { modelContext?: ModelContextLike };

export interface WebMcpToolSummary {
  name: string;
  title?: string;
  description: string;
  inputSchema: ObjectDataSchema | null;
  origin?: string;
  annotations: {
    readOnlyHint: boolean;
    untrustedContentHint: boolean;
  };
  invokable: boolean;
  blockedReason?: string;
}

export type NativeToolHandler = (input: Record<string, unknown>, context: { signal: AbortSignal }) => Promise<unknown>;

export type WebMcpRegistrationResult =
  | { status: 'unavailable'; registeredTools: []; skippedTools: string[]; dispose(): void }
  | { status: 'registered'; registeredTools: string[]; skippedTools: string[]; dispose(): void }
  | { status: 'failed'; registeredTools: []; skippedTools: string[]; error: string; dispose(): void };

function currentDocument(): DocumentWithModelContext | undefined {
  return typeof document === 'undefined' ? undefined : document as DocumentWithModelContext;
}

function currentOrigin(): string | undefined {
  return typeof location === 'undefined' ? undefined : location.origin;
}

function byteLength(value: string): number {
  return new TextEncoder().encode(value).byteLength;
}

function abortError(): DOMException {
  return new DOMException('The WebMCP tool invocation was cancelled.', 'AbortError');
}

function assertNotAborted(signal: AbortSignal): void {
  if (signal.aborted) throw signal.reason instanceof Error ? signal.reason : abortError();
}

function validateBoundedOutput(tool: AdapterTool, value: unknown): Record<string, unknown> {
  const parsed = validateToolOutput(tool, value);
  if (!parsed.success) throw new TypeError('Tool output failed GhostLayer validation.');
  const serialized = JSON.stringify(parsed.data);
  if (byteLength(serialized) > WEBMCP_RESULT_BYTE_LIMIT) throw new RangeError('Tool output exceeds the GhostLayer WebMCP result limit.');
  return parsed.data;
}

export function supportsNativeWebMcp(documentValue: DocumentWithModelContext | undefined = currentDocument()): boolean {
  return Boolean(
    typeof globalThis.isSecureContext === 'boolean' &&
    globalThis.isSecureContext &&
    documentValue &&
    'modelContext' in documentValue &&
    typeof documentValue.modelContext?.registerTool === 'function',
  );
}

export function supportsWebMcpDiscovery(documentValue: DocumentWithModelContext | undefined = currentDocument()): boolean {
  return supportsNativeWebMcp(documentValue) && typeof documentValue?.modelContext?.getTools === 'function';
}

export function legacyWebMcpToolName(canonicalName: string): string {
  return `${GHOSTLAYER_LEGACY_TOOL_PREFIX}${canonicalName}`;
}

function toNativeTool(tool: AdapterTool, handler: NativeToolHandler, lifecycleSignal: AbortSignal, publishedName: string): NativeToolDefinition {
  return {
    name: publishedName,
    title: tool.name.replaceAll('_', ' '),
    description: tool.description,
    inputSchema: tool.inputSchema,
    annotations: {
      readOnlyHint: tool.riskLevel === 'read',
      untrustedContentHint: true,
    },
    async execute(input, context) {
      // Chromium 151 invokes providers with one argument, while the current
      // draft also supplies callback options. Keep the provider compatible
      // with both shapes without weakening validation or lifecycle disposal.
      const signal = context?.signal ?? lifecycleSignal;
      assertNotAborted(signal);
      const parsed = validateToolInput(tool, input);
      if (!parsed.success) throw new TypeError('Tool input failed GhostLayer validation.');
      const result = await handler(parsed.data, { signal });
      assertNotAborted(signal);
      return validateBoundedOutput(tool, result);
    },
  };
}

/**
 * Registers a verified adapter as native, page-owned WebMCP tools.
 * Consequential tools are opt-in because their handler must implement a visible,
 * application-owned human approval boundary before committing side effects.
 */
export async function registerAdapterWithWebMcp(
  adapterValue: unknown,
  handlers: Partial<Record<string, NativeToolHandler>>,
  options: {
    document?: DocumentWithModelContext;
    origin?: string;
    includeConsequential?: boolean;
    signal?: AbortSignal;
    toolNamePrefix?: string;
  } = {},
): Promise<WebMcpRegistrationResult> {
  const documentValue = options.document ?? currentDocument();
  const lifecycle = new AbortController();
  const onExternalAbort = () => lifecycle.abort(options.signal?.reason);
  options.signal?.addEventListener('abort', onExternalAbort, { once: true });
  if (options.signal?.aborted) onExternalAbort();
  const dispose = () => {
    options.signal?.removeEventListener('abort', onExternalAbort);
    lifecycle.abort();
  };
  const parsedAdapter = adapterSchema.safeParse(adapterValue);
  if (!parsedAdapter.success) return { status: 'failed', registeredTools: [], skippedTools: [], error: 'Adapter validation failed before WebMCP registration.', dispose };
  const adapter = parsedAdapter.data;
  const origin = options.origin ?? currentOrigin();
  if (!origin || !isOriginAllowed(adapter, origin)) return { status: 'failed', registeredTools: [], skippedTools: [], error: 'The adapter is disabled or does not allow this exact origin.', dispose };
  const toolNamePrefix = options.toolNamePrefix ?? '';
  if (toolNamePrefix && !/^[A-Za-z][A-Za-z0-9_.-]{0,63}$/.test(toolNamePrefix)) {
    return { status: 'failed', registeredTools: [], skippedTools: [], error: 'The WebMCP tool-name prefix is invalid.', dispose };
  }
  const skippedTools = adapter.tools.filter((tool) => !handlers[tool.name] || (!options.includeConsequential && tool.riskLevel !== 'read')).map((tool) => tool.name);
  if (!supportsNativeWebMcp(documentValue) || !documentValue?.modelContext) return { status: 'unavailable', registeredTools: [], skippedTools, dispose };

  const candidates = adapter.tools.filter((tool) => handlers[tool.name] && (options.includeConsequential || tool.riskLevel === 'read'));
  const registeredTools: string[] = [];
  try {
    for (const tool of candidates) {
      assertNotAborted(lifecycle.signal);
      const handler = handlers[tool.name];
      if (!handler) continue;
      const publishedName = `${toolNamePrefix}${tool.name}`;
      if (publishedName.length > 128) throw new TypeError('A prefixed WebMCP tool name exceeds the 128-character limit.');
      await documentValue.modelContext.registerTool(toNativeTool(tool, handler, lifecycle.signal, publishedName), { signal: lifecycle.signal });
      registeredTools.push(publishedName);
    }
    return { status: 'registered', registeredTools, skippedTools, dispose };
  } catch (error) {
    lifecycle.abort();
    return { status: 'failed', registeredTools: [], skippedTools, error: error instanceof Error ? error.message : 'Native WebMCP registration failed.', dispose };
  }
}

function parseRegisteredSchema(value: unknown): ObjectDataSchema | null {
  try {
    const candidate = typeof value === 'string'
      ? parseSecureJson(value, { maxBytes: WEBMCP_SCHEMA_BYTE_LIMIT, maxDepth: 12, maxNodes: 500 })
      : value;
    const parsed = objectDataSchema.safeParse(candidate);
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

export async function discoverWebMcpTools(
  documentValue: DocumentWithModelContext | undefined = currentDocument(),
): Promise<WebMcpToolSummary[]> {
  if (!supportsWebMcpDiscovery(documentValue) || !documentValue?.modelContext?.getTools) return [];
  const tools = await documentValue.modelContext.getTools();
  return tools.slice(0, WEBMCP_TOOL_LIMIT).flatMap((tool) => {
    if (!tool || typeof tool.name !== 'string' || !/^[A-Za-z][A-Za-z0-9_.-]{0,127}$/.test(tool.name)) return [];
    if (typeof tool.description !== 'string' || tool.description.length === 0 || tool.description.length > 500) return [];
    const inputSchema = parseRegisteredSchema(tool.inputSchema);
    const summary: WebMcpToolSummary = {
      name: tool.name,
      ...(typeof tool.title === 'string' && tool.title.length <= 120 ? { title: tool.title } : {}),
      description: tool.description,
      inputSchema,
      ...(typeof tool.origin === 'string' ? { origin: tool.origin } : {}),
      annotations: {
        readOnlyHint: tool.annotations?.readOnlyHint === true,
        untrustedContentHint: tool.annotations?.untrustedContentHint !== false,
      },
      invokable: inputSchema !== null,
      ...(inputSchema ? {} : { blockedReason: 'This tool uses an input schema outside GhostLayer’s bounded object subset.' }),
    };
    return [summary];
  });
}

export type { Adapter };
