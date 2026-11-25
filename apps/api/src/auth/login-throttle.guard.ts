import { Injectable } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';
import { normalizeEmail } from '../common/email.js';

/**
 * Limits POST /auth/login per (client IP, normalized email). Runs before validation, so the
 * body may be anything; a missing or non-string email shares one bucket per IP.
 * Applied with @UseGuards on the login route only, never as APP_GUARD.
 */
@Injectable()
export class LoginThrottleGuard extends ThrottlerGuard {
  protected override async getTracker(req: Record<string, unknown>): Promise<string> {
    const ip = await super.getTracker(req);
    const email = (req.body as { email?: unknown } | undefined)?.email;
    return `${ip}:${typeof email === 'string' ? normalizeEmail(email) : ''}`;
  }
}
