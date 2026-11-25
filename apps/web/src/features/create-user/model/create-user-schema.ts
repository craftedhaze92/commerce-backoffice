import { z } from 'zod';
import { Role, USER_LIMITS, type CreateUserInput } from '@bo/contracts';

export const createUserSchema = z
  .object({
    email: z
      .string()
      .trim()
      .min(1, '이메일을 입력하세요')
      .max(USER_LIMITS.emailMax, `이메일은 ${USER_LIMITS.emailMax}자 이하여야 합니다`)
      .pipe(z.email('이메일 형식이 올바르지 않습니다')),
    name: z
      .string()
      .trim()
      .min(1, '이름을 입력하세요')
      .max(USER_LIMITS.nameMax, `이름은 ${USER_LIMITS.nameMax}자 이하여야 합니다`),
    role: z.enum([Role.ADMIN, Role.MANAGER, Role.VIEWER]),
    password: z
      .string()
      .min(USER_LIMITS.passwordMin, `비밀번호는 ${USER_LIMITS.passwordMin}자 이상이어야 합니다`)
      .max(USER_LIMITS.passwordMax, `비밀번호는 ${USER_LIMITS.passwordMax}자 이하여야 합니다`),
  })
  .transform((v): CreateUserInput => ({
    email: v.email.toLowerCase(),
    name: v.name,
    role: v.role,
    password: v.password,
  }));

export type CreateUserFormInput = z.input<typeof createUserSchema>;
