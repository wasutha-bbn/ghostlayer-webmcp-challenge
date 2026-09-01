import { webcrypto } from 'node:crypto';
import { beforeAll, describe, expect, it } from 'vitest';
import {
  canonicalizeJson,
  createIntegrityEnvelope,
  createSignedEnvelope,
  migrateAdapter,
  parseSecureJson,
  publicKeyFingerprint,
  publicSignerKeySchema,
  sampleAdapter,
  sha256Base64Url,
  verifyAdapterDocument,
  type TrustedSigner,
} from './index';

beforeAll(() => {
  if (!globalThis.crypto) Object.defineProperty(globalThis, 'crypto', { configurable: true, value: webcrypto });
});

describe('adapter migrations and integrity envelopes', () => {
  it('migrates an exact 1.0.0 adapter without mutating it', () => {
    const legacy = structuredClone(sampleAdapter) as unknown as Record<string, unknown>;
    legacy.schemaVersion = '1.0.0';
    delete legacy.revision;
    const original = JSON.stringify(legacy);
    const migrated = migrateAdapter(legacy);
    expect(migrated).toMatchObject({ success: true, migratedFrom: '1.0.0', semanticsPreserving: true, data: { schemaVersion: '1.1.0', revision: 1 } });
    expect(JSON.stringify(legacy)).toBe(original);
  });

  it('rejects unknown schema versions and version-confused legacy records', () => {
    expect(migrateAdapter({ ...sampleAdapter, schemaVersion: '9.9.9' })).toMatchObject({ success: false, code: 'UNSUPPORTED_SCHEMA_VERSION' });
    expect(migrateAdapter({ ...sampleAdapter, schemaVersion: '1.0.0' })).toMatchObject({ success: false, code: 'INVALID_ADAPTER' });
  });

  it('canonicalizes deterministically and rejects non-JSON structures', () => {
    expect(canonicalizeJson({ z: 1, a: { y: true, b: 'two' } })).toBe('{"a":{"b":"two","y":true},"z":1}');
    expect(canonicalizeJson({ value: -0 })).toBe('{"value":0}');
    expect(() => canonicalizeJson(Array(2))).toThrow(/sparse/i);
    const cyclic: Record<string, unknown> = {};
    cyclic.self = cyclic;
    expect(() => canonicalizeJson(cyclic)).toThrow(/cyclic/i);
    expect(() => canonicalizeJson(new Date())).toThrow(/plain objects/i);
  });

  it('parses raw JSON while rejecting duplicate, blocked, and excessive structures', () => {
    expect(parseSecureJson('{"a":1,"nested":{"ok":true}}')).toMatchObject({ a: 1, nested: { ok: true } });
    expect(() => parseSecureJson('{"a":1,"a":2}')).toThrow(/duplicate key/i);
    expect(() => parseSecureJson('{"__proto__":{}}')).toThrow(/blocked key/i);
    expect(() => parseSecureJson('[[[0]]]', { maxDepth: 1 })).toThrow(/deeply nested/i);
  });

  it('verifies integrity envelopes and rejects tampering', async () => {
    const envelope = await createIntegrityEnvelope(sampleAdapter);
    const verified = await verifyAdapterDocument(envelope);
    expect(verified).toMatchObject({ success: true, data: { trust: 'integrity' } });
    if (verified.success) expect(verified.data.sourceDigest).toBe(verified.data.effectiveDigest);
    const tampered = structuredClone(envelope);
    tampered.payload.name = 'Tampered adapter';
    expect(await verifyAdapterDocument(tampered)).toMatchObject({ success: false, code: 'INTEGRITY_MISMATCH' });
  });

  it('accepts scoped ES256 signatures only from the matching active public key', async () => {
    const keyPair = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']) as CryptoKeyPair;
    const publicKey = publicSignerKeySchema.parse(await crypto.subtle.exportKey('jwk', keyPair.publicKey));
    const keyId = await publicKeyFingerprint(publicKey);
    const envelope = await createSignedEnvelope(sampleAdapter, keyId, keyPair.privateKey);
    const signer: TrustedSigner = {
      keyId,
      publicKey,
      status: 'active',
      allowedAdapterIds: [sampleAdapter.id],
      allowedOrigins: [...sampleAdapter.allowedOrigins],
      label: 'Ephemeral test signer',
    };
    expect(await verifyAdapterDocument(envelope)).toMatchObject({ success: false, code: 'UNTRUSTED_SIGNER' });
    expect(await verifyAdapterDocument(envelope, { [keyId]: signer })).toMatchObject({ success: true, data: { trust: 'signed', signerKeyId: keyId } });
    expect(await verifyAdapterDocument(envelope, { [keyId]: { ...signer, status: 'revoked' } })).toMatchObject({ success: false, code: 'REVOKED_SIGNER' });
    expect(await verifyAdapterDocument(envelope, { [keyId]: { ...signer, allowedOrigins: ['https://example.com'] } })).toMatchObject({ success: false, code: 'SIGNER_SCOPE_MISMATCH' });
    const tampered = structuredClone(envelope);
    tampered.signature!.value = `${tampered.signature!.value.slice(0, -1)}${tampered.signature!.value.endsWith('A') ? 'B' : 'A'}`;
    expect(await verifyAdapterDocument(tampered, { [keyId]: signer })).toMatchObject({ success: false, code: 'INVALID_SIGNATURE' });
  });

  it('verifies a signed legacy payload before its reviewed migration', async () => {
    const keyPair = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']) as CryptoKeyPair;
    const publicKey = publicSignerKeySchema.parse(await crypto.subtle.exportKey('jwk', keyPair.publicKey));
    const keyId = await publicKeyFingerprint(publicKey);
    const legacy = structuredClone(sampleAdapter) as unknown as Record<string, unknown>;
    legacy.schemaVersion = '1.0.0';
    delete legacy.revision;
    const payloadDigest = await sha256Base64Url(canonicalizeJson(legacy));
    const protectedRecord = canonicalizeJson({
      domain: 'GhostLayer adapter signature v1',
      format: 'ghostlayer.adapter',
      envelopeVersion: '1',
      canonicalization: 'GL-C14N-1',
      digestAlgorithm: 'SHA-256',
      payloadDigest,
      signatureAlgorithm: 'ES256',
      keyId,
    });
    const signature = await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, keyPair.privateKey, new TextEncoder().encode(protectedRecord));
    const envelope = {
      format: 'ghostlayer.adapter', envelopeVersion: '1', payload: legacy,
      integrity: { canonicalization: 'GL-C14N-1', digestAlgorithm: 'SHA-256', payloadDigest },
      signature: { algorithm: 'ES256', keyId, value: Buffer.from(signature).toString('base64url') },
    };
    const signer: TrustedSigner = {
      keyId, publicKey, status: 'active', allowedAdapterIds: [sampleAdapter.id], allowedOrigins: [...sampleAdapter.allowedOrigins],
    };
    const verified = await verifyAdapterDocument(envelope, { [keyId]: signer });
    expect(verified).toMatchObject({ success: true, data: { trust: 'signed', migratedFrom: '1.0.0', adapter: { schemaVersion: '1.1.0', revision: 1 } } });
    if (verified.success) expect(verified.data.sourceDigest).not.toBe(verified.data.effectiveDigest);
  });
});
