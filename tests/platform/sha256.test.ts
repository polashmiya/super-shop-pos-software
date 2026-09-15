import { createHash, randomBytes } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { hashPin, sha256Hex } from '@/platform/web/db/sha256';

/** The browser seeder must produce exactly the hashes the desktop seeder does. */
function nodeSha256(text: string): string {
  return createHash('sha256').update(text, 'utf-8').digest('hex');
}

describe('sha256Hex', () => {
  it('matches the published test vectors', () => {
    expect(sha256Hex('')).toBe('e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855');
    expect(sha256Hex('abc')).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
    expect(sha256Hex('abcdbcdecdefdefgefghfghighijhijkijkljklmklmnlmnomnopnopq')).toBe(
      '248d6a61d20638b8e5c026930c3e6039a33ce45964ff2167f6ecedd419db06c1',
    );
  });

  it('matches node:crypto across block boundaries', () => {
    for (const length of [0, 1, 55, 56, 57, 63, 64, 65, 119, 120, 127, 128, 200, 1000]) {
      const text = 'a'.repeat(length);
      expect(sha256Hex(text), `length ${length}`).toBe(nodeSha256(text));
    }
  });

  it('matches node:crypto for multi-byte UTF-8 (Bangla names)', () => {
    for (const text of ['রহিম', 'নগর সুপার শপ', 'ক্যাশিয়ার ৩', '৳ ১,২৩৪.৫৬', '👍 mixed اَلْعَرَبِيَّةُ']) {
      expect(sha256Hex(text)).toBe(nodeSha256(text));
    }
  });

  it('matches node:crypto for random inputs', () => {
    for (let i = 0; i < 200; i += 1) {
      const text = randomBytes(1 + (i % 150)).toString('base64');
      expect(sha256Hex(text)).toBe(nodeSha256(text));
    }
  });

  it('hashes PINs exactly like the desktop seeder', () => {
    for (const [pin, salt] of [
      ['1111', 'a1b2c3d4e5f60718'],
      ['2222', '0000000000000000'],
      ['3333', 'ffffffffffffffff'],
    ]) {
      expect(hashPin(pin, salt)).toBe(nodeSha256(`${salt}:${pin}`));
    }
  });
});
