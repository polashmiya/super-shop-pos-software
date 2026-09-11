import { webcrypto } from 'node:crypto';

// jsdom lacks SubtleCrypto; the app uses WebCrypto for PIN hashing.
if (!globalThis.crypto?.subtle) {
  Object.defineProperty(globalThis, 'crypto', { value: webcrypto, configurable: true });
}
