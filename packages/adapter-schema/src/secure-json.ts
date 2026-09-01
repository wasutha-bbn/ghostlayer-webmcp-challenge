const blockedKeys = new Set(['__proto__', 'prototype', 'constructor']);

export interface SecureJsonOptions {
  maxBytes?: number;
  maxDepth?: number;
  maxNodes?: number;
}

export class SecureJsonError extends Error {
  constructor(readonly code: 'JSON_TOO_LARGE' | 'JSON_TOO_DEEP' | 'JSON_TOO_COMPLEX' | 'DUPLICATE_KEY' | 'BLOCKED_KEY' | 'INVALID_JSON', message: string) {
    super(message);
    this.name = 'SecureJsonError';
  }
}

class Parser {
  private index = 0;
  private nodes = 0;

  constructor(private readonly source: string, private readonly maxDepth: number, private readonly maxNodes: number) {}

  parse(): unknown {
    const value = this.value(0);
    this.whitespace();
    if (this.index !== this.source.length) this.fail('Unexpected trailing JSON content.');
    return value;
  }

  private value(depth: number): unknown {
    this.whitespace();
    this.nodes += 1;
    if (this.nodes > this.maxNodes) throw new SecureJsonError('JSON_TOO_COMPLEX', 'JSON contains too many values.');
    if (depth > this.maxDepth) throw new SecureJsonError('JSON_TOO_DEEP', 'JSON is too deeply nested.');
    const character = this.source[this.index];
    if (character === '{') return this.object(depth);
    if (character === '[') return this.array(depth);
    if (character === '"') return this.string();
    if (character === '-' || (character !== undefined && character >= '0' && character <= '9')) return this.number();
    if (this.source.startsWith('true', this.index)) { this.index += 4; return true; }
    if (this.source.startsWith('false', this.index)) { this.index += 5; return false; }
    if (this.source.startsWith('null', this.index)) { this.index += 4; return null; }
    this.fail('Expected a JSON value.');
  }

  private object(depth: number): Record<string, unknown> {
    this.index += 1;
    const result: Record<string, unknown> = Object.create(null) as Record<string, unknown>;
    const keys = new Set<string>();
    this.whitespace();
    if (this.source[this.index] === '}') { this.index += 1; return result; }
    while (true) {
      this.whitespace();
      if (this.source[this.index] !== '"') this.fail('Expected an object key.');
      const key = this.string();
      if (keys.has(key)) throw new SecureJsonError('DUPLICATE_KEY', `JSON contains a duplicate key: ${key}`);
      if (blockedKeys.has(key)) throw new SecureJsonError('BLOCKED_KEY', `JSON contains a blocked key: ${key}`);
      keys.add(key);
      this.whitespace();
      if (this.source[this.index] !== ':') this.fail('Expected a colon after an object key.');
      this.index += 1;
      result[key] = this.value(depth + 1);
      this.whitespace();
      if (this.source[this.index] === '}') { this.index += 1; return result; }
      if (this.source[this.index] !== ',') this.fail('Expected a comma or closing brace.');
      this.index += 1;
    }
  }

  private array(depth: number): unknown[] {
    this.index += 1;
    const result: unknown[] = [];
    this.whitespace();
    if (this.source[this.index] === ']') { this.index += 1; return result; }
    while (true) {
      result.push(this.value(depth + 1));
      this.whitespace();
      if (this.source[this.index] === ']') { this.index += 1; return result; }
      if (this.source[this.index] !== ',') this.fail('Expected a comma or closing bracket.');
      this.index += 1;
    }
  }

  private string(): string {
    const start = this.index;
    this.index += 1;
    let escaped = false;
    while (this.index < this.source.length) {
      const character = this.source[this.index]!;
      if (!escaped && character === '"') {
        this.index += 1;
        try { return JSON.parse(this.source.slice(start, this.index)) as string; } catch { this.fail('Invalid JSON string.'); }
      }
      if (!escaped && character.charCodeAt(0) < 0x20) this.fail('Unescaped control character in JSON string.');
      if (!escaped && character === '\\') escaped = true;
      else escaped = false;
      this.index += 1;
    }
    this.fail('Unterminated JSON string.');
  }

  private number(): number {
    const match = /^-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?/.exec(this.source.slice(this.index));
    if (!match) this.fail('Invalid JSON number.');
    this.index += match[0].length;
    const value = Number(match[0]);
    if (!Number.isFinite(value)) this.fail('JSON number must be finite.');
    return value;
  }

  private whitespace(): void {
    while (/^[\u0009\u000a\u000d\u0020]$/u.test(this.source[this.index] ?? '')) this.index += 1;
  }

  private fail(message: string): never {
    throw new SecureJsonError('INVALID_JSON', `${message} (offset ${this.index})`);
  }
}

/** Parses raw JSON without losing duplicate-key evidence and returns null-prototype objects. */
export function parseSecureJson(text: string, options: SecureJsonOptions = {}): unknown {
  const maxBytes = options.maxBytes ?? 512_000;
  if (new TextEncoder().encode(text).byteLength > maxBytes) throw new SecureJsonError('JSON_TOO_LARGE', `JSON must be smaller than ${maxBytes} bytes.`);
  return new Parser(text, options.maxDepth ?? 30, options.maxNodes ?? 100_000).parse();
}
