'use client';

import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Role, USER_LIMITS } from '@bo/contracts';
import { ApiError, errorMessage } from '@/shared/api';
import { ROLE_LABEL } from '@/shared/lib/role-label';
import { Button } from '@/shared/ui/button';
import { toast } from '@/shared/ui/toast';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/shared/ui/dialog';
import { FORM_FIELD, FORM_LABEL } from '@/shared/ui/form-field';
import { Input } from '@/shared/ui/input';
import { createUserSchema, type CreateUserFormInput } from '../model/create-user-schema';
import { useCreateUser } from '../model/use-create-user';

const DEFAULTS: CreateUserFormInput = { email: '', name: '', role: Role.VIEWER, password: '' };
const ROLES = [Role.ADMIN, Role.MANAGER, Role.VIEWER] as const;
const EMAIL_TAKEN = '이미 사용 중인 이메일입니다';
const DEMO_USER_LIMIT = '데모 환경에서는 사용자를 더 추가할 수 없습니다.';

function FieldError({ message }: { message?: string }) {
  if (!message) return null;
  return (
    <span role="alert" className="text-destructive text-xs">
      {message}
    </span>
  );
}

export function CreateUserDialog() {
  const [open, setOpen] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const create = useCreateUser();
  const {
    register,
    handleSubmit,
    reset,
    setError,
    formState: { errors },
  } = useForm<CreateUserFormInput, unknown, ReturnType<typeof createUserSchema.parse>>({
    resolver: zodResolver(createUserSchema),
    defaultValues: DEFAULTS,
  });

  function onOpenChange(next: boolean) {
    if (create.isPending) return;
    if (!next) {
      reset(DEFAULTS);
      setFormError(null);
    }
    setOpen(next);
  }

  return (
    <div className="flex items-center gap-3">
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogTrigger asChild>
          <Button>사용자 추가</Button>
        </DialogTrigger>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>사용자 추가</DialogTitle>
          </DialogHeader>
          <form
            noValidate
            className="flex flex-col gap-4"
            onSubmit={handleSubmit((input) => {
              setFormError(null);
              create.mutate(input, {
                onSuccess: () => {
                  reset(DEFAULTS);
                  setOpen(false);
                  toast('사용자를 추가했습니다');
                },
                onError: (error) => {
                  if (
                    error instanceof ApiError &&
                    error.code === 'CONFLICT' &&
                    (error.details as { reason?: unknown } | undefined)?.reason === 'EMAIL_TAKEN'
                  ) {
                    setError('email', { message: EMAIL_TAKEN }, { shouldFocus: true });
                    return;
                  }
                  setFormError(errorMessage(error, { DEMO_PROTECTED: DEMO_USER_LIMIT }));
                },
              });
            })}
          >
            <label className={FORM_LABEL}>
              <span>이메일</span>
              <Input
                type="email"
                autoComplete="off"
                className={FORM_FIELD}
                aria-invalid={errors.email ? true : undefined}
                {...register('email')}
              />
              <FieldError message={errors.email?.message} />
            </label>
            <label className={FORM_LABEL}>
              <span>이름</span>
              <Input
                className={FORM_FIELD}
                aria-invalid={errors.name ? true : undefined}
                {...register('name')}
              />
              <FieldError message={errors.name?.message} />
            </label>
            <label className={FORM_LABEL}>
              <span>역할</span>
              <select className={FORM_FIELD} {...register('role')}>
                {ROLES.map((r) => (
                  <option key={r} value={r}>
                    {ROLE_LABEL[r]}
                  </option>
                ))}
              </select>
            </label>
            <label className={FORM_LABEL}>
              <span>초기 비밀번호</span>
              <Input
                type="password"
                autoComplete="new-password"
                placeholder={`${USER_LIMITS.passwordMin}–${USER_LIMITS.passwordMax}자`}
                className={FORM_FIELD}
                aria-invalid={errors.password ? true : undefined}
                {...register('password')}
              />
              <FieldError message={errors.password?.message} />
            </label>
            {formError && (
              <p role="alert" className="text-destructive text-sm">
                {formError}
              </p>
            )}
            <DialogFooter>
              <Button type="submit" disabled={create.isPending}>
                {create.isPending ? '추가 중...' : '추가'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
