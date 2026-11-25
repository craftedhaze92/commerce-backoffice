'use client';

import { useId, useState, type ReactNode } from 'react';
import { Controller, useForm, useWatch, type FieldErrors } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { ProductStatus, type ProductDetail } from '@bo/contracts';
import { useCategories } from '@/entities/category';
import { PRODUCT_STATUS_LABEL } from '@/entities/product';
import { ApiError } from '@/shared/api';
import { Button } from '@/shared/ui/button';
import { FORM_FIELD, FORM_LABEL } from '@/shared/ui/form-field';
import { Input } from '@/shared/ui/input';
import { Label } from '@/shared/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/shared/ui/select';
import { Textarea } from '@/shared/ui/textarea';
import { cn } from '@/shared/lib/utils';
import {
  EMPTY_PRODUCT_FORM,
  productFormSchema,
  toFormInput,
  type ProductFormInput,
  type ProductFormValues,
} from '../model/product-form-schema';
import { diffUpdateInput, toCreateInput, useSaveProduct } from '../model/use-save-product';
import { ImageUploader } from './image-uploader';

const SKU_CONFLICT_MESSAGE = '이미 사용 중인 SKU입니다';
const FIELD_INVALID_MESSAGE = '값을 확인해 주세요';
const GENERIC_ERROR_MESSAGE = '저장에 실패했습니다. 잠시 후 다시 시도해주세요';
const UPLOAD_PENDING_HINT = '이미지 업로드가 끝난 뒤 저장할 수 있습니다';

type FieldName = keyof ProductFormInput;
const FIELD_NAMES = Object.keys(EMPTY_PRODUCT_FORM) as FieldName[];

interface ProductFormProps {
  mode: 'create' | 'edit';
  initial?: ProductDetail;
  readOnly?: boolean;
  onSubmitted?: (detail: ProductDetail) => void;
}

function isFieldName(value: unknown): value is FieldName {
  return typeof value === 'string' && (FIELD_NAMES as string[]).includes(value);
}

/** 400 details(`[{ field }]`)에서 폼 필드 에러를 뽑는다. 서버 문구는 쓰지 않고 고정 문구를 보인다. `images.0.id`는 `images`로 본다. */
function fieldErrorsFrom(details: unknown): [FieldName, string][] {
  if (!Array.isArray(details)) return [];
  const result: [FieldName, string][] = [];
  for (const d of details as { field?: unknown; messages?: unknown }[]) {
    const field = typeof d?.field === 'string' ? d.field.split('.')[0] : undefined;
    if (isFieldName(field)) result.push([field, FIELD_INVALID_MESSAGE]);
  }
  return result;
}

export function ProductForm({ mode, initial, readOnly = false, onSubmitted }: ProductFormProps) {
  const idPrefix = useId();
  const categories = useCategories();
  const save = useSaveProduct();
  const [formError, setFormError] = useState<string | null>(null);
  // 수정 화면에서 비교 기준이 되는 상세. 저장에 성공하면 응답으로 바꾼다.
  const [baseline, setBaseline] = useState(initial);
  // 업로드가 끝나지 않은 이미지가 빠진 채 저장되지 않도록 업로드 중에는 저장을 막는다
  const [uploading, setUploading] = useState(false);

  const {
    register,
    control,
    handleSubmit,
    reset,
    setError,
    formState: { errors },
  } = useForm<ProductFormInput, unknown, ProductFormValues>({
    resolver: zodResolver(productFormSchema),
    defaultValues: initial ? toFormInput(initial) : EMPTY_PRODUCT_FORM,
  });

  const watched = useWatch({ control });
  const isEdit = mode === 'edit' && baseline !== undefined;
  const parsed = isEdit ? productFormSchema.safeParse(watched) : undefined;
  // 검증에 실패하는 입력은 바뀐 것으로 보고 저장 버튼을 열어 에러를 보여준다
  const hasChanges =
    !isEdit || !parsed?.success || Object.keys(diffUpdateInput(baseline, parsed.data)).length > 0;

  const id = (name: FieldName) => `${idPrefix}-${name}`;
  const a11y = (name: FieldName) => ({
    id: id(name),
    'aria-invalid': errors[name] ? true : undefined,
    'aria-describedby': errors[name] ? `${id(name)}-error` : undefined,
  });

  function onValid(values: ProductFormValues) {
    setFormError(null);
    const variables =
      isEdit && baseline
        ? { mode: 'edit' as const, id: baseline.id, input: diffUpdateInput(baseline, values) }
        : { mode: 'create' as const, input: toCreateInput(values) };
    if (uploading) return;
    if (variables.mode === 'edit' && Object.keys(variables.input).length === 0) return;

    save.mutate(variables, {
      onSuccess: (detail) => {
        if (variables.mode === 'edit') {
          setBaseline(detail);
          reset(toFormInput(detail));
        }
        onSubmitted?.(detail);
      },
      onError: (error) => {
        if (error instanceof ApiError && error.code === 'CONFLICT') {
          setError('sku', { message: SKU_CONFLICT_MESSAGE }, { shouldFocus: true });
          return;
        }
        if (error instanceof ApiError && error.code === 'VALIDATION_FAILED') {
          const fieldErrors = fieldErrorsFrom(error.details);
          fieldErrors.forEach(([name, message]) => setError(name, { message }));
          if (fieldErrors.length > 0) return;
        }
        setFormError(GENERIC_ERROR_MESSAGE);
      },
    });
  }

  return (
    <form noValidate className="flex max-w-3xl flex-col gap-5" onSubmit={handleSubmit(onValid)}>
      {formError && (
        <p role="alert" className="text-destructive text-sm">
          {formError}
        </p>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        <Field id={id('sku')} label="SKU" errors={errors} name="sku">
          <Input
            {...a11y('sku')}
            className={cn(FORM_FIELD, isEdit && 'bg-muted')}
            readOnly={isEdit}
            disabled={readOnly}
            autoComplete="off"
            placeholder="예: TSHIRT-001"
            {...register('sku')}
          />
        </Field>
        <Field id={id('name')} label="상품명" errors={errors} name="name">
          <Input
            {...a11y('name')}
            className={FORM_FIELD}
            disabled={readOnly}
            {...register('name')}
          />
        </Field>
        <Field id={id('categoryId')} label="카테고리" errors={errors} name="categoryId">
          <Controller
            control={control}
            name="categoryId"
            render={({ field }) => (
              <Select
                value={field.value || undefined}
                onValueChange={field.onChange}
                disabled={readOnly}
              >
                <SelectTrigger {...a11y('categoryId')} className={cn(FORM_FIELD, 'w-full')}>
                  <SelectValue placeholder="카테고리 선택" />
                </SelectTrigger>
                <SelectContent>
                  {categories.data?.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          />
        </Field>
        <Field id={id('status')} label="상태" errors={errors} name="status">
          <Controller
            control={control}
            name="status"
            render={({ field }) => (
              <Select value={field.value} onValueChange={field.onChange} disabled={readOnly}>
                <SelectTrigger {...a11y('status')} className={cn(FORM_FIELD, 'w-full')}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.values(ProductStatus).map((s) => (
                    <SelectItem key={s} value={s}>
                      {PRODUCT_STATUS_LABEL[s]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          />
        </Field>
        <Field id={id('price')} label="가격" errors={errors} name="price">
          <Input
            {...a11y('price')}
            inputMode="numeric"
            className={FORM_FIELD}
            disabled={readOnly}
            {...register('price')}
          />
        </Field>
        {mode === 'create' && (
          <Field id={id('initialStock')} label="초기 재고" errors={errors} name="initialStock">
            <Input
              {...a11y('initialStock')}
              inputMode="numeric"
              className={FORM_FIELD}
              disabled={readOnly}
              {...register('initialStock')}
            />
          </Field>
        )}
        <Field id={id('safetyStock')} label="안전 재고" errors={errors} name="safetyStock">
          <Input
            {...a11y('safetyStock')}
            inputMode="numeric"
            className={FORM_FIELD}
            disabled={readOnly}
            {...register('safetyStock')}
          />
        </Field>
      </div>

      <Field id={id('description')} label="설명" errors={errors} name="description">
        <Textarea
          {...a11y('description')}
          rows={5}
          className={FORM_FIELD}
          disabled={readOnly}
          {...register('description')}
        />
      </Field>

      <div className={FORM_LABEL}>
        <span>이미지</span>
        <Controller
          control={control}
          name="images"
          render={({ field }) => (
            <ImageUploader
              value={field.value}
              onChange={field.onChange}
              disabled={readOnly}
              onPendingChange={setUploading}
            />
          )}
        />
        {errors.images && (
          <span role="alert" className="text-destructive text-xs">
            {errors.images.message}
          </span>
        )}
      </div>

      {!readOnly && (
        <div className="flex items-center justify-end gap-3">
          {uploading && (
            <span role="status" className="text-muted-foreground text-xs">
              {UPLOAD_PENDING_HINT}
            </span>
          )}
          <Button type="submit" size="lg" disabled={save.isPending || uploading || !hasChanges}>
            {save.isPending ? '저장 중...' : '저장'}
          </Button>
        </div>
      )}
    </form>
  );
}

interface FieldProps {
  id: string;
  label: string;
  name: FieldName;
  errors: FieldErrors<ProductFormInput>;
  children: ReactNode;
}

function Field({ id, label, name, errors, children }: FieldProps) {
  const message = errors[name]?.message;
  return (
    <div className={FORM_LABEL}>
      <Label htmlFor={id} className="text-xs font-semibold">
        {label}
      </Label>
      {children}
      {message && (
        <span id={`${id}-error`} role="alert" className="text-destructive text-xs">
          {message}
        </span>
      )}
    </div>
  );
}
