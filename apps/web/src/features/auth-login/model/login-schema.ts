import { z } from 'zod';

export const loginSchema = z.object({
  email: z.string().trim().email('이메일 형식이 아닙니다'),
  password: z.string().min(1, '비밀번호를 입력하세요'),
});

export type LoginValues = z.infer<typeof loginSchema>;
