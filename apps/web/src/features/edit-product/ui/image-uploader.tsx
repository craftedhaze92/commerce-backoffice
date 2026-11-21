'use client';

import { useEffect, useId, useRef, useState, type DragEvent } from 'react';
import Image from 'next/image';
import { PRODUCT_LIMITS, type ProductImage } from '@bo/contracts';
import { Badge } from '@/shared/ui/badge';
import { Button } from '@/shared/ui/button';
import { cn } from '@/shared/lib/utils';
import { moveImage, normalizeImages, removeImage, setPrimaryImage } from '../lib/image-list';
import { runWithConcurrency } from '../lib/run-with-concurrency';
import { useUploadImage } from '../model/use-upload-image';

const UPLOAD_CONCURRENCY = 3;
const ACCEPT = PRODUCT_LIMITS.imageMimeTypes.join(',');
const MIME_TYPES: readonly string[] = PRODUCT_LIMITS.imageMimeTypes;
const MAX_MB = PRODUCT_LIMITS.imageMaxBytes / (1024 * 1024);
const COUNT_ERROR = `최대 ${PRODUCT_LIMITS.imageMaxCount}장까지 등록할 수 있습니다`;

interface ImageUploaderProps {
  value: ProductImage[];
  onChange: (images: ProductImage[]) => void;
  disabled?: boolean;
  /** 업로드 중인 파일이 생기면 true, 모두 끝나면 false로 알린다. */
  onPendingChange?: (pending: boolean) => void;
}

interface PendingUpload {
  key: number;
  name: string;
}

export function ImageUploader({
  value,
  onChange,
  disabled = false,
  onPendingChange,
}: ImageUploaderProps) {
  const inputId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const upload = useUploadImage();
  const [pending, setPending] = useState<PendingUpload[]>([]);
  const [errors, setErrors] = useState<string[]>([]);
  const [dragging, setDragging] = useState(false);

  // 동시에 끝나는 업로드가 서로의 결과를 덮어쓰지 않도록 가장 최근 목록을 따로 들고 있는다
  const latest = useRef(value);
  const nextKey = useRef(0);
  // 렌더를 기다리지 않고 바로 세는 업로드 중 개수. 연달아 고른 파일이 10장을 넘지 않게 한다.
  const pendingCount = useRef(0);
  useEffect(() => {
    latest.current = value;
  }, [value]);

  function commit(next: ProductImage[]) {
    latest.current = next;
    onChange(next);
  }

  function addFiles(files: File[]) {
    const nextErrors: string[] = [];
    const accepted: File[] = [];
    let slots = PRODUCT_LIMITS.imageMaxCount - latest.current.length - pendingCount.current;
    let overLimit = false;
    for (const file of files) {
      if (!MIME_TYPES.includes(file.type)) {
        nextErrors.push(`${file.name}: 지원하지 않는 형식입니다`);
      } else if (file.size > PRODUCT_LIMITS.imageMaxBytes) {
        nextErrors.push(`${file.name}: ${MAX_MB}MB를 넘습니다`);
      } else if (slots <= 0) {
        overLimit = true;
      } else {
        slots -= 1;
        accepted.push(file);
      }
    }
    if (overLimit) nextErrors.push(COUNT_ERROR);
    setErrors(nextErrors);
    if (accepted.length === 0) return;

    const jobs = accepted.map((file) => ({ key: nextKey.current++, file }));
    if (pendingCount.current === 0) onPendingChange?.(true);
    pendingCount.current += jobs.length;
    setPending((p) => [...p, ...jobs.map(({ key, file }) => ({ key, name: file.name }))]);
    void runWithConcurrency(jobs, UPLOAD_CONCURRENCY, async ({ key, file }) => {
      try {
        const image = await upload.mutateAsync(file);
        commit(normalizeImages([...latest.current, { ...image, isPrimary: false }]));
      } catch {
        setErrors((e) => [...e, `${file.name}: 업로드에 실패했습니다`]);
      } finally {
        setPending((p) => p.filter((u) => u.key !== key));
        pendingCount.current -= 1;
        if (pendingCount.current === 0) onPendingChange?.(false);
      }
    });
  }

  function onDrop(e: DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setDragging(false);
    if (!disabled) addFiles(Array.from(e.dataTransfer.files));
  }

  return (
    <div className="flex flex-col gap-3">
      {!disabled && (
        <div
          onDragOver={(e) => {
            e.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={onDrop}
          className={cn(
            'border-hairline flex flex-col items-center gap-2 rounded-[10px] border border-dashed p-6 text-sm',
            dragging && 'border-brand bg-muted',
          )}
        >
          <span className="text-muted-foreground">
            이미지를 끌어다 놓거나 파일을 선택하세요 (JPG·PNG·WEBP, {MAX_MB}MB 이하, 최대{' '}
            {PRODUCT_LIMITS.imageMaxCount}장)
          </span>
          <input
            ref={inputRef}
            id={inputId}
            type="file"
            accept={ACCEPT}
            multiple
            aria-label="파일 선택"
            className="sr-only"
            onChange={(e) => {
              addFiles(Array.from(e.target.files ?? []));
              // 같은 파일을 다시 고를 수 있도록 비운다
              e.target.value = '';
            }}
          />
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => inputRef.current?.click()}
          >
            파일 선택
          </Button>
        </div>
      )}

      {errors.length > 0 && (
        <ul role="alert" className="text-destructive flex flex-col gap-1 text-xs">
          {errors.map((message, i) => (
            <li key={i}>{message}</li>
          ))}
        </ul>
      )}

      {pending.length > 0 && (
        <ul
          aria-label="업로드 중인 파일"
          className="text-muted-foreground flex flex-col gap-1 text-xs"
        >
          {pending.map((u) => (
            <li key={u.key}>{u.name} 업로드 중</li>
          ))}
        </ul>
      )}

      {value.length > 0 && (
        <ul aria-label="등록된 이미지" className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {value.map((img, index) => {
            const n = index + 1;
            return (
              <li
                key={img.id}
                className="border-hairline flex flex-col gap-2 rounded-[10px] border p-2"
              >
                <div className="relative">
                  <Image
                    src={img.thumbUrl}
                    alt={`상품 이미지 ${n}`}
                    width={160}
                    height={160}
                    unoptimized
                    className="aspect-square w-full rounded-md object-cover"
                  />
                  {img.isPrimary && <Badge className="absolute top-1 left-1">대표</Badge>}
                </div>
                {!disabled && (
                  <div className="flex flex-wrap gap-1">
                    <Button
                      type="button"
                      variant="outline"
                      size="xs"
                      aria-label={`${n}번 이미지 앞으로`}
                      disabled={index === 0}
                      onClick={() => commit(moveImage(latest.current, index, index - 1))}
                    >
                      앞으로
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="xs"
                      aria-label={`${n}번 이미지 뒤로`}
                      disabled={index === value.length - 1}
                      onClick={() => commit(moveImage(latest.current, index, index + 1))}
                    >
                      뒤로
                    </Button>
                    {!img.isPrimary && (
                      <Button
                        type="button"
                        variant="outline"
                        size="xs"
                        aria-label={`${n}번 이미지 대표로 지정`}
                        onClick={() => commit(setPrimaryImage(latest.current, img.id))}
                      >
                        대표로 지정
                      </Button>
                    )}
                    <Button
                      type="button"
                      variant="destructive"
                      size="xs"
                      aria-label={`${n}번 이미지 삭제`}
                      onClick={() => commit(removeImage(latest.current, img.id))}
                    >
                      삭제
                    </Button>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
