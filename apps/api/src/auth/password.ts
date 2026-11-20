import argon2 from 'argon2';

export function normalizeEmail(raw: string): string {
  return raw.trim().toLowerCase();
}

export function hashPassword(plain: string): Promise<string> {
  return argon2.hash(plain, { type: argon2.argon2id });
}

/** Returns false (never throws) for wrong passwords and malformed hashes. */
export async function verifyPassword(hash: string, plain: string): Promise<boolean> {
  try {
    return await argon2.verify(hash, plain);
  } catch {
    return false;
  }
}
