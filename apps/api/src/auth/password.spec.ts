import { hashPassword, normalizeEmail, verifyPassword } from './password.js';

describe('password', () => {
  it('verifyPassword true for correct, false for wrong', async () => {
    const h = await hashPassword('pa55word!');
    expect(h.startsWith('$argon2id$')).toBe(true);
    expect(await verifyPassword(h, 'pa55word!')).toBe(true);
    expect(await verifyPassword(h, 'nope')).toBe(false);
  });

  it('verifyPassword returns false for a malformed hash', async () => {
    expect(await verifyPassword('not-a-hash', 'x')).toBe(false);
  });

  it('normalizeEmail trims and lowercases', () => {
    expect(normalizeEmail('  Admin@Demo.COM ')).toBe('admin@demo.com');
  });
});
