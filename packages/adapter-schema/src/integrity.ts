import { z } from 'zod';
import { adapterSchema, type Adapter } from './index.js';
import { migrateAdapter } from './migrations.js';

export const ADAPTER_ARTIFACT_FORMAT = 'ghostlayer.adapter' as const;
export const ADAPTER_ENVELOPE_VERSION = '1' as const;
export const ADAPTER_CANONICALIZATION = 'GL-C14N-1' as const;
export const ADAPTER_DIGEST_ALGORITHM = 'SHA-256' as const;
export const ADAPTER_SIGNATURE_ALGORITHM = 'ES256' as const;

const base64Url32Pattern = /^[A-Za-z0-9_-]{43}$/;
const base64Url64Pattern = /^[A-Za-z0-9_-]{86}$/;
const blockedKeys = new Set(['__proto__', 'prototype', 'constructor']);

function exactHttpOrigin(value: string): boolean {
  try {
    const url = new URL(value);
    return (url.protocol === 'http:' || url.protocol === 'https:') && url.origin === value && url.pathname === '/' && url.search === '' && url.hash === '' && url.username === '' && url.password === '';
  } catch { return false; }
}

export const publicSignerKeySchema = z.object({
  kty: z.literal('EC'),
  crv: z.literal('P-256'),
  x: z.string().regex(base64Url32Pattern),
  y: z.string().regex(base64Url32Pattern),
  ext: z.literal(true).optional(),
  key_ops: z.tuple([z.literal('verify')]).optional(),
  alg: z.literal(ADAPTER_SIGNATURE_ALGORITHM).optional(),
  use: z.literal('sig').optional(),
}).strict();

export const trustedSignerSchema = z.object({
  keyId: z.string().regex(base64Url32Pattern),
  publicKey: publicSignerKeySchema,
  status: z.enum(['active', 'revoked']),
  allowedAdapterIds: z.array(z.string().min(1).max(128)).min(1).max(100),
  allowedOrigins: z.array(z.string().refine(exactHttpOrigin)).min(1).max(100),
  label: z.string().trim().min(1).max(120).optional(),
}).strict();

export const adapterEnvelopeSchema = z.object({
  format: z.literal(ADAPTER_ARTIFACT_FORMAT),
  envelopeVersion: z.literal(ADAPTER_ENVELOPE_VERSION),
  payload: z.unknown(),
  integrity: z.object({
    canonicalization: z.literal(ADAPTER_CANONICALIZATION),
    digestAlgorithm: z.literal(ADAPTER_DIGEST_ALGORITHM),
    payloadDigest: z.string().regex(base64Url32Pattern),
  }).strict(),
  signature: z.object({
    algorithm: z.literal(ADAPTER_SIGNATURE_ALGORITHM),
    keyId: z.string().regex(base64Url32Pattern),
    value: z.string().regex(base64Url64Pattern),
  }).strict().optional(),
}).strict();

export type PublicSignerKey = z.infer<typeof publicSignerKeySchema>;
export type TrustedSigner = z.infer<typeof trustedSignerSchema>;
export type AdapterEnvelopeDocument = z.infer<typeof adapterEnvelopeSchema>;
export type AdapterEnvelope = Omit<z.infer<typeof adapterEnvelopeSchema>, 'payload'> & { payload: Adapter };
export type AdapterTrust = 'legacy-unsigned' | 'integrity' | 'signed';

export interface VerifiedAdapterDocument {
  adapter: Adapter;
  artifact: AdapterEnvelopeDocument | null;
  trust: AdapterTrust;
  migratedFrom?: string;
  signerKeyId?: string;
  sourceDigest: string;
  effectiveDigest: string;
}

export type AdapterVerificationCode =
  | 'INVALID_ADAPTER'
  | 'UNSUPPORTED_SCHEMA_VERSION'
  | 'INVALID_ENVELOPE'
  | 'INTEGRITY_MISMATCH'
  | 'UNTRUSTED_SIGNER'
  | 'REVOKED_SIGNER'
  | 'SIGNER_SCOPE_MISMATCH'
  | 'INVALID_SIGNATURE'
  | 'RESIGN_REQUIRED';

export type AdapterVerificationResult =
  | { success: true; data: VerifiedAdapterDocument }
  | { success: false; code: AdapterVerificationCode; message: string };

interface CanonicalState {
  readonly seen: WeakSet<object>;
  nodes: number;
}

function assertUnicodeScalarString(value: string): void {
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    if (code >= 0xd800 && code <= 0xdbff) {
      const next = value.charCodeAt(index + 1);
      if (next < 0xdc00 || next > 0xdfff) throw new TypeError('Canonical JSON rejects unpaired Unicode surrogates.');
      index += 1;
    } else if (code >= 0xdc00 && code <= 0xdfff) {
      throw new TypeError('Canonical JSON rejects unpaired Unicode surrogates.');
    }
  }
}

function canonicalizeValue(value: unknown, state: CanonicalState, depth: number): string {
  state.nodes += 1;
  if (state.nodes > 100_000) throw new TypeError('Canonical JSON contains too many values.');
  if (depth > 50) throw new TypeError('Canonical JSON is too deeply nested.');
  if (value === null) return 'null';
  if (typeof value === 'string') {
    assertUnicodeScalarString(value);
    return JSON.stringify(value);
  }
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new TypeError('Canonical JSON rejects non-finite numbers.');
    return JSON.stringify(value);
  }
  if (typeof value !== 'object') throw new TypeError(`Canonical JSON rejects ${typeof value}.`);
  if (state.seen.has(value)) throw new TypeError('Canonical JSON rejects cyclic structures.');
  state.seen.add(value);
  try {
    if (Array.isArray(value)) {
      const ownKeys = Object.keys(value);
      if (ownKeys.length !== value.length) throw new TypeError('Canonical JSON rejects sparse arrays or custom array properties.');
      const children: string[] = [];
      for (let index = 0; index < value.length; index += 1) {
        if (!Object.hasOwn(value, index)) throw new TypeError('Canonical JSON rejects sparse arrays.');
        const descriptor = Object.getOwnPropertyDescriptor(value, String(index));
        if (!descriptor || !('value' in descriptor)) throw new TypeError('Canonical JSON rejects accessors.');
        children.push(canonicalizeValue(descriptor.value, state, depth + 1));
      }
      return `[${children.join(',')}]`;
    }
    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) throw new TypeError('Canonical JSON accepts only plain objects.');
    const record = value as Record<string, unknown>;
    const keys = Object.keys(record).sort();
    const entries = keys.map((key) => {
      assertUnicodeScalarString(key);
      if (blockedKeys.has(key)) throw new TypeError(`Canonical JSON rejects blocked key: ${key}.`);
      const descriptor = Object.getOwnPropertyDescriptor(record, key);
      if (!descriptor || !('value' in descriptor)) throw new TypeError('Canonical JSON rejects accessors.');
      return `${JSON.stringify(key)}:${canonicalizeValue(descriptor.value, state, depth + 1)}`;
    });
    return `{${entries.join(',')}}`;
  } finally {
    state.seen.delete(value);
  }
}

/** Versioned deterministic JSON used only by GhostLayer. It deliberately does not claim RFC 8785 compatibility. */
export function canonicalizeJson(value: unknown): string {
  return canonicalizeValue(value, { seen: new WeakSet<object>(), nodes: 0 }, 0);
}

function bytesToBase64Url(bytes: Uint8Array): string {
  let binary = '';
  for (let index = 0; index < bytes.length; index += 0x8000) binary += String.fromCharCode(...bytes.subarray(index, index + 0x8000));
  return btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/u, '');
}

function base64UrlToBytes(value: string): Uint8Array {
  if (!/^[A-Za-z0-9_-]+$/u.test(value)) throw new TypeError('Invalid base64url value.');
  const padded = value.replaceAll('-', '+').replaceAll('_', '/') + '='.repeat((4 - value.length % 4) % 4);
  const binary = atob(padded);
  const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
  if (bytesToBase64Url(bytes) !== value) throw new TypeError('Non-canonical base64url value.');
  return bytes;
}

function textBytes(value: string): Uint8Array {
  return new TextEncoder().encode(value);
}

function arrayBuffer(bytes: Uint8Array): ArrayBuffer {
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  return copy.buffer;
}

function constantTimeStringEqual(left: string, right: string): boolean {
  let difference = left.length ^ right.length;
  const length = Math.max(left.length, right.length);
  for (let index = 0; index < length; index += 1) difference |= (left.charCodeAt(index) || 0) ^ (right.charCodeAt(index) || 0);
  return difference === 0;
}

function subtleCrypto(explicit?: SubtleCrypto): SubtleCrypto {
  const subtle = explicit ?? globalThis.crypto?.subtle;
  if (!subtle) throw new Error('Web Crypto is unavailable in this runtime.');
  return subtle;
}

export async function sha256Base64Url(value: string, subtle?: SubtleCrypto): Promise<string> {
  const digest = await subtleCrypto(subtle).digest('SHA-256', arrayBuffer(textBytes(value)));
  return bytesToBase64Url(new Uint8Array(digest));
}

export async function publicKeyFingerprint(key: PublicSignerKey, subtle?: SubtleCrypto): Promise<string> {
  const parsed = publicSignerKeySchema.parse(key);
  return sha256Base64Url(canonicalizeJson({ crv: parsed.crv, kty: parsed.kty, x: parsed.x, y: parsed.y }), subtle);
}

function protectedSignatureRecord(payloadDigest: string, keyId: string) {
  return {
    domain: 'GhostLayer adapter signature v1',
    format: ADAPTER_ARTIFACT_FORMAT,
    envelopeVersion: ADAPTER_ENVELOPE_VERSION,
    canonicalization: ADAPTER_CANONICALIZATION,
    digestAlgorithm: ADAPTER_DIGEST_ALGORITHM,
    payloadDigest,
    signatureAlgorithm: ADAPTER_SIGNATURE_ALGORITHM,
    keyId,
  };
}

export async function createIntegrityEnvelope(adapter: Adapter, subtle?: SubtleCrypto): Promise<AdapterEnvelope> {
  const parsed = adapterSchema.parse(adapter);
  const payloadDigest = await sha256Base64Url(canonicalizeJson(parsed), subtle);
  return {
    format: ADAPTER_ARTIFACT_FORMAT,
    envelopeVersion: ADAPTER_ENVELOPE_VERSION,
    payload: parsed,
    integrity: { canonicalization: ADAPTER_CANONICALIZATION, digestAlgorithm: ADAPTER_DIGEST_ALGORITHM, payloadDigest },
  };
}

export async function createSignedEnvelope(adapter: Adapter, keyId: string, privateKey: CryptoKey, subtle?: SubtleCrypto): Promise<AdapterEnvelope> {
  if (!base64Url32Pattern.test(keyId)) throw new TypeError('keyId must be a full RFC 7638 SHA-256 thumbprint.');
  const cryptoApi = subtleCrypto(subtle);
  const envelope = await createIntegrityEnvelope(adapter, cryptoApi);
  const protectedBytes = textBytes(canonicalizeJson(protectedSignatureRecord(envelope.integrity.payloadDigest, keyId)));
  const signature = await cryptoApi.sign({ name: 'ECDSA', hash: 'SHA-256' }, privateKey, arrayBuffer(protectedBytes));
  const encodedSignature = bytesToBase64Url(new Uint8Array(signature));
  if (!base64Url64Pattern.test(encodedSignature)) throw new TypeError('The ES256 provider did not return a 64-byte IEEE P1363 signature.');
  return { ...envelope, signature: { algorithm: ADAPTER_SIGNATURE_ALGORITHM, keyId, value: encodedSignature } };
}

function migrationMayPreserveSignature(migratedFrom?: string): boolean {
  return migratedFrom === undefined || migratedFrom === '1.0.0';
}

export async function verifyAdapterDocument(
  value: unknown,
  trustedSigners: Record<string, TrustedSigner> = {},
  subtle?: SubtleCrypto,
): Promise<AdapterVerificationResult> {
  const cryptoApi = subtleCrypto(subtle);
  const envelope = adapterEnvelopeSchema.safeParse(value);
  if (!envelope.success) {
    if (value && typeof value === 'object' && ('format' in value || 'envelopeVersion' in value || 'integrity' in value || 'signature' in value)) {
      return { success: false, code: 'INVALID_ENVELOPE', message: envelope.error.issues[0]?.message ?? 'Adapter envelope is invalid.' };
    }
    const migrated = migrateAdapter(value);
    if (!migrated.success) return { success: false, code: migrated.code, message: migrated.message };
    const sourceDigest = await sha256Base64Url(canonicalizeJson(value), cryptoApi);
    const effectiveDigest = await sha256Base64Url(canonicalizeJson(migrated.data), cryptoApi);
    return { success: true, data: { adapter: migrated.data, artifact: null, trust: 'legacy-unsigned', migratedFrom: migrated.migratedFrom, sourceDigest, effectiveDigest } };
  }

  let sourceCanonical: string;
  try {
    sourceCanonical = canonicalizeJson(envelope.data.payload);
  } catch (error) {
    return { success: false, code: 'INVALID_ENVELOPE', message: error instanceof Error ? error.message : 'Adapter payload is not canonical JSON.' };
  }
  const sourceDigest = await sha256Base64Url(sourceCanonical, cryptoApi);
  if (!constantTimeStringEqual(sourceDigest, envelope.data.integrity.payloadDigest)) {
    return { success: false, code: 'INTEGRITY_MISMATCH', message: 'Adapter content does not match its SHA-256 integrity digest.' };
  }

  let cryptographicallyVerifiedSigner: TrustedSigner | undefined;
  if (envelope.data.signature) {
    const signerResult = trustedSignerSchema.safeParse(trustedSigners[envelope.data.signature.keyId]);
    if (!signerResult.success) return { success: false, code: 'UNTRUSTED_SIGNER', message: `Signer ${envelope.data.signature.keyId} is not trusted on this device.` };
    const signer = signerResult.data;
    if (signer.status === 'revoked') return { success: false, code: 'REVOKED_SIGNER', message: 'The adapter signer has been revoked.' };
    if (await publicKeyFingerprint(signer.publicKey, cryptoApi) !== signer.keyId || signer.keyId !== envelope.data.signature.keyId) {
      return { success: false, code: 'UNTRUSTED_SIGNER', message: 'The trusted signer record does not match its public-key thumbprint.' };
    }
    try {
      const publicKey = await cryptoApi.importKey('jwk', signer.publicKey, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['verify']);
      const protectedBytes = textBytes(canonicalizeJson(protectedSignatureRecord(sourceDigest, envelope.data.signature.keyId)));
      const valid = await cryptoApi.verify({ name: 'ECDSA', hash: 'SHA-256' }, publicKey, arrayBuffer(base64UrlToBytes(envelope.data.signature.value)), arrayBuffer(protectedBytes));
      if (!valid) return { success: false, code: 'INVALID_SIGNATURE', message: 'The adapter signature is invalid.' };
    } catch {
      return { success: false, code: 'INVALID_SIGNATURE', message: 'The adapter signature could not be verified.' };
    }
    cryptographicallyVerifiedSigner = signer;
  }

  const migrated = migrateAdapter(envelope.data.payload);
  if (!migrated.success) return { success: false, code: migrated.code, message: migrated.message };

  let signerKeyId: string | undefined;
  if (cryptographicallyVerifiedSigner) {
    if (!migrationMayPreserveSignature(migrated.migratedFrom)) {
      return { success: false, code: 'RESIGN_REQUIRED', message: 'This signed adapter uses a migration that has not been reviewed as semantics-preserving.' };
    }
    if (!cryptographicallyVerifiedSigner.allowedAdapterIds.includes(migrated.data.id) || migrated.data.allowedOrigins.some((origin) => !cryptographicallyVerifiedSigner.allowedOrigins.includes(origin))) {
      return { success: false, code: 'SIGNER_SCOPE_MISMATCH', message: 'The signer is not trusted for this adapter ID and every requested origin.' };
    }
    signerKeyId = cryptographicallyVerifiedSigner.keyId;
  }

  const effectiveDigest = await sha256Base64Url(canonicalizeJson(migrated.data), cryptoApi);
  return {
    success: true,
    data: {
      adapter: migrated.data,
      artifact: envelope.data,
      trust: envelope.data.signature ? 'signed' : 'integrity',
      migratedFrom: migrated.migratedFrom,
      signerKeyId,
      sourceDigest,
      effectiveDigest,
    },
  };
}
