import { normalizeEmail } from './email.js';

describe('normalizeEmail', () => {
  it('trims and lowercases', () => {
    expect(normalizeEmail('  Admin@Demo.COM ')).toBe('admin@demo.com');
  });
});
