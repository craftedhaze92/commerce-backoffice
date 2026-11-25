import { describe, expect, it } from 'vitest';
import { DEMO_ACCOUNT_EMAILS, USER_LIMITS } from './index';

describe('user', () => {
  it('exposes limits and demo accounts (lowercase, normalized)', () => {
    expect(USER_LIMITS).toEqual({ nameMax: 50, passwordMin: 8, passwordMax: 72 });
    expect(DEMO_ACCOUNT_EMAILS).toEqual(['admin@demo.com', 'manager@demo.com', 'viewer@demo.com']);
    for (const e of DEMO_ACCOUNT_EMAILS) expect(e).toBe(e.trim().toLowerCase());
  });
});
