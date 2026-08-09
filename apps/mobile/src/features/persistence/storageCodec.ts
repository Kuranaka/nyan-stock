export type StorageSchema<T> = {
  currentVersion: number;
  fallback: () => T;
  migrate: (value: unknown, fromVersion: number) => T;
  validate: (value: unknown) => value is T;
};

export type DecodedStorageValue<T> = {
  value: T;
  shouldRewrite: boolean;
};

export class UnsupportedStorageVersionError extends Error {}

type StorageEnvelope = {
  version: number;
  data: unknown;
};

export function decodeStorageJson<T>(raw: string, schema: StorageSchema<T>): DecodedStorageValue<T> {
  const parsed: unknown = JSON.parse(raw);
  const envelope = asStorageEnvelope(parsed);
  const fromVersion = envelope?.version ?? 0;
  const source = envelope ? envelope.data : parsed;

  if (fromVersion > schema.currentVersion) {
    throw new UnsupportedStorageVersionError(
      `Stored data version ${fromVersion} is newer than supported version ${schema.currentVersion}.`,
    );
  }

  const value = fromVersion === schema.currentVersion ? source : schema.migrate(source, fromVersion);
  if (!schema.validate(value)) {
    throw new Error(`Stored data failed schema validation at version ${schema.currentVersion}.`);
  }

  return {
    value,
    shouldRewrite: fromVersion !== schema.currentVersion,
  };
}

export function encodeStorageJson<T>(value: T, schema: StorageSchema<T>): string {
  if (!schema.validate(value)) {
    throw new Error('Refusing to persist data that failed schema validation.');
  }
  return JSON.stringify({
    version: schema.currentVersion,
    data: value,
    isUndefined: value === undefined ? true : undefined,
  });
}

function asStorageEnvelope(value: unknown): StorageEnvelope | undefined {
  if (!isRecord(value)) return undefined;
  if (
    typeof value.version !== 'number' ||
    !Number.isInteger(value.version) ||
    value.version < 1 ||
    !('data' in value) &&
    value.isUndefined !== true
  )
    return undefined;
  return { version: value.version, data: value.isUndefined === true ? undefined : value.data };
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function isOptionalString(value: unknown): value is string | undefined {
  return value === undefined || typeof value === 'string';
}

export function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}
