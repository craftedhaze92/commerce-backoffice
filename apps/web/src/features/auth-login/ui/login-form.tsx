'use client';

import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { MeResponse } from '@bo/contracts';
import { sessionKeys } from '@/entities/session';
import { ApiError, http } from '@/shared/api';
import { Button } from '@/shared/ui/button';
import { Input } from '@/shared/ui/input';
import { Label } from '@/shared/ui/label';
import { FORM_FIELD, FORM_LABEL } from '@/shared/ui/form-field';
import { loginSchema, type LoginValues } from '../model/login-schema';

const DEMO_PASSWORD = 'demo1234!';
const DEMO_ACCOUNTS = [
  { label: '관리자', email: 'admin@demo.com' },
  { label: '매니저', email: 'manager@demo.com' },
  { label: '뷰어', email: 'viewer@demo.com' },
] as const;

const INVALID_CREDENTIALS_MESSAGE = '이메일 또는 비밀번호가 올바르지 않습니다';
const GENERIC_ERROR_MESSAGE = '로그인에 실패했습니다. 잠시 후 다시 시도해주세요';

interface LoginFormProps {
  onSuccess: (me: MeResponse) => void;
}

export function LoginForm({ onSuccess }: LoginFormProps) {
  const queryClient = useQueryClient();
  const [formError, setFormError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    setValue,
    formState: { errors },
  } = useForm<LoginValues>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: '', password: '' },
  });

  const login = useMutation<MeResponse, ApiError, LoginValues>({
    mutationFn: (values) => http<MeResponse>('/auth/login', { method: 'POST', json: values }),
    onSuccess: (me) => {
      queryClient.setQueryData(sessionKeys.me, me);
      onSuccess(me);
    },
    onError: (error) => {
      setFormError(
        error instanceof ApiError && error.code === 'INVALID_CREDENTIALS'
          ? INVALID_CREDENTIALS_MESSAGE
          : GENERIC_ERROR_MESSAGE,
      );
    },
  });

  function fillDemo(email: string) {
    setValue('email', email, { shouldValidate: false });
    setValue('password', DEMO_PASSWORD, { shouldValidate: false });
  }

  return (
    <form
      noValidate
      className="flex flex-col gap-4"
      onSubmit={handleSubmit((values) => {
        setFormError(null);
        login.mutate(values);
      })}
    >
      {formError && (
        <p role="alert" className="text-destructive text-sm">
          {formError}
        </p>
      )}
      <div className={FORM_LABEL}>
        <Label htmlFor="login-email" className="text-xs font-semibold">
          이메일
        </Label>
        <Input
          id="login-email"
          type="email"
          autoComplete="username"
          className={FORM_FIELD}
          aria-invalid={errors.email ? true : undefined}
          {...register('email')}
        />
        {errors.email && <span className="text-destructive text-xs">{errors.email.message}</span>}
      </div>
      <div className={FORM_LABEL}>
        <Label htmlFor="login-password" className="text-xs font-semibold">
          비밀번호
        </Label>
        <Input
          id="login-password"
          type="password"
          autoComplete="current-password"
          className={FORM_FIELD}
          aria-invalid={errors.password ? true : undefined}
          {...register('password')}
        />
        {errors.password && (
          <span className="text-destructive text-xs">{errors.password.message}</span>
        )}
      </div>
      <Button type="submit" size="lg" disabled={login.isPending}>
        로그인
      </Button>
      <div className="flex flex-col gap-2">
        <span className="text-muted-foreground text-xs">데모 계정</span>
        <div className="flex gap-2">
          {DEMO_ACCOUNTS.map(({ label, email }) => (
            <Button
              key={email}
              type="button"
              variant="outline"
              size="sm"
              className="flex-1"
              onClick={() => fillDemo(email)}
            >
              {label}
            </Button>
          ))}
        </div>
      </div>
    </form>
  );
}
