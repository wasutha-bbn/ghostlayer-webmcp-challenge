import { ADAPTER_SCHEMA_VERSION, adapterSchema, type Adapter } from './index.js';

export type AdapterMigrationResult =
  | { success: true; data: Adapter; migratedFrom?: string; semanticsPreserving: true }
  | { success: false; code: 'INVALID_ADAPTER' | 'UNSUPPORTED_SCHEMA_VERSION'; message: string };

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

export function migrateAdapter(value: unknown): AdapterMigrationResult {
  if (!isRecord(value)) return { success: false, code: 'INVALID_ADAPTER', message: 'Adapter must be a JSON object.' };
  const version = typeof value.schemaVersion === 'string' ? value.schemaVersion : '';
  let candidate: unknown = value;
  let migratedFrom: string | undefined;

  if (version === '1.0.0') {
    if (Object.hasOwn(value, 'revision')) {
      return { success: false, code: 'INVALID_ADAPTER', message: 'Schema 1.0.0 adapters must not contain revision.' };
    }
    candidate = { ...value, schemaVersion: ADAPTER_SCHEMA_VERSION, revision: 1 };
    migratedFrom = version;
  } else if (version !== ADAPTER_SCHEMA_VERSION) {
    return { success: false, code: 'UNSUPPORTED_SCHEMA_VERSION', message: `Unsupported adapter schema version: ${version || 'missing'}.` };
  }

  const parsed = adapterSchema.safeParse(candidate);
  if (!parsed.success) {
    return { success: false, code: 'INVALID_ADAPTER', message: parsed.error.issues[0]?.message ?? 'Adapter validation failed.' };
  }
  return { success: true, data: parsed.data, migratedFrom, semanticsPreserving: true };
}

export function migrateAdapterOrThrow(value: unknown): Adapter {
  const result = migrateAdapter(value);
  if (!result.success) throw new Error(`${result.code}: ${result.message}`);
  return result.data;
}
