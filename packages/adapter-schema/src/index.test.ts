/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, expect, it } from 'vitest';
import { adapterSchema, isOriginAllowed, isSafeRegexPattern, sampleAdapter, validateToolInput } from './index';

const clone = () => structuredClone(sampleAdapter) as Record<string, any>;

describe('adapter schema', () => {
  it('accepts the valid sample adapter', () => {
    expect(adapterSchema.safeParse(sampleAdapter).success).toBe(true);
  });

  it('rejects an unsupported schema version at the current-schema boundary', () => {
    const value = clone();
    value.schemaVersion = '0.2.0';
    expect(adapterSchema.safeParse(value).success).toBe(false);
  });

  it('rejects an unknown or arbitrary-code action', () => {
    for (const action of ['eval', 'javascript', 'script']) {
      const value = clone();
      value.tools[0].steps.push({ type: action, code: 'document.cookie' });
      expect(adapterSchema.safeParse(value).success).toBe(false);
    }
  });

  it('rejects malformed or fragile locators', () => {
    const value = clone();
    value.tools[0].steps[1].locator = { strategy: 'css', selector: 'main > div:nth-child(4) button' };
    expect(adapterSchema.safeParse(value).success).toBe(false);
  });

  it('rejects navigation paths that can resolve to another origin', () => {
    for (const path of ['//evil.example/path', '/\\evil.example/path', '/safe\npath']) {
      const value = clone();
      value.tools[0].steps[0] = { type: 'navigate', path };
      expect(adapterSchema.safeParse(value).success).toBe(false);
    }
  });

  it('requires consequential steps to use an approval risk level', () => {
    const value = clone();
    value.tools[1].riskLevel = 'read';
    expect(adapterSchema.safeParse(value).success).toBe(false);
  });

  it('requires an exact, enabled origin', () => {
    expect(isOriginAllowed(sampleAdapter, 'http://localhost:4174')).toBe(true);
    expect(isOriginAllowed(sampleAdapter, 'http://localhost:4175')).toBe(false);
    expect(isOriginAllowed(sampleAdapter, 'http://localhost:4174/path')).toBe(false);
  });

  it('validates declared tool inputs and rejects unknown fields', () => {
    const tool = sampleAdapter.tools[1];
    expect(validateToolInput(tool, { customer_id: 'CUS-1001', description: 'Draft', amount: 125 }).success).toBe(true);
    expect(validateToolInput(tool, { customer_id: 'CUS-1001', description: 'Draft', amount: '125' }).success).toBe(false);
    expect(validateToolInput(tool, { customer_id: 'CUS-1001', description: 'Draft', amount: 125, password: 'nope' }).success).toBe(false);
  });

  it('allows bounded validation patterns and rejects ReDoS-shaped expressions', () => {
    expect(isSafeRegexPattern('^\\d{7,24}$')).toBe(true);
    expect(isSafeRegexPattern('^[A-Z0-9_-]{1,40}$')).toBe(true);
    expect(isSafeRegexPattern('^(a+)+$')).toBe(false);
    expect(isSafeRegexPattern('(a|aa)+$')).toBe(false);
    const value = clone();
    value.tools[0].inputSchema.properties.phone_number.pattern = '^(a+)+$';
    expect(adapterSchema.safeParse(value).success).toBe(false);
  });
});
