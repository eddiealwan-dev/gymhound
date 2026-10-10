import * as Crypto from 'expo-crypto';

/** A new id for a user-created row. Bundled rows use stable slugs instead. */
export function newId(): string {
  return Crypto.randomUUID();
}
