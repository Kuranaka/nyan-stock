import assert from 'node:assert/strict';
import test from 'node:test';

import {
  decodeStorageJson,
  encodeStorageJson,
  UnsupportedStorageVersionError,
} from './storageCodec.ts';
import {
  catsStorageSchema,
  authSessionStorageSchema,
  inventoryItemsStorageSchema,
  settingsStorageSchema,
} from './storageSchemas.ts';

test('migrates legacy unversioned settings and bounds invalid time fields', () => {
  const decoded = decodeStorageJson(
    JSON.stringify({
      onboardingCompleted: true,
      notificationsEnabled: true,
      notificationPermissionPrompted: true,
      notificationHour: 99,
      notificationMinute: -1,
      subscriptionPlan: 'plus',
    }),
    settingsStorageSchema,
  );

  assert.equal(decoded.shouldRewrite, true);
  assert.equal(decoded.value.notificationHour, 9);
  assert.equal(decoded.value.notificationMinute, 0);
  assert.equal(decoded.value.subscriptionPlan, 'plus');
});

test('migrates legacy pet data while dropping only malformed rows', () => {
  const validPet = {
    id: 'pet-1',
    name: 'ミケ',
    gender: 'female',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  };
  const decoded = decodeStorageJson(JSON.stringify([validPet, { id: 'broken' }]), catsStorageSchema);

  assert.equal(decoded.value.length, 1);
  assert.equal(decoded.value[0]?.id, validPet.id);
  assert.equal(decoded.value[0]?.gender, validPet.gender);
  assert.equal(decoded.shouldRewrite, true);
});

test('normalizes missing legacy inventory fields into the current schema', () => {
  const decoded = decodeStorageJson(
    JSON.stringify([
      {
        id: 'item-1',
        catId: 'pet-1',
        name: 'フード',
        category: 'unknown-old-category',
        amount: 100,
        unit: 'g',
        purchaseDate: '2026-01-01',
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
      },
    ]),
    inventoryItemsStorageSchema,
  );

  assert.equal(decoded.value[0]?.category, 'other');
  assert.deepEqual(decoded.value[0]?.notifyBeforeDays, []);
  assert.deepEqual(decoded.value[0]?.purchaseLinks, {});
});

test('encoded current data round-trips without another rewrite', () => {
  const value = settingsStorageSchema.fallback();
  const decoded = decodeStorageJson(encodeStorageJson(value, settingsStorageSchema), settingsStorageSchema);
  assert.deepEqual(decoded.value, value);
  assert.equal(decoded.shouldRewrite, false);
});

test('round-trips an intentionally empty optional value', () => {
  const encoded = encodeStorageJson(undefined, authSessionStorageSchema);
  const decoded = decodeStorageJson(encoded, authSessionStorageSchema);
  assert.equal(decoded.value, undefined);
  assert.equal(decoded.shouldRewrite, false);
});

test('does not downgrade data written by a newer app version', () => {
  assert.throws(
    () => decodeStorageJson(JSON.stringify({ version: 999, data: {} }), settingsStorageSchema),
    UnsupportedStorageVersionError,
  );
});

test('rejects malformed JSON instead of returning an unchecked value', () => {
  assert.throws(() => decodeStorageJson('{not-json', settingsStorageSchema), SyntaxError);
});
