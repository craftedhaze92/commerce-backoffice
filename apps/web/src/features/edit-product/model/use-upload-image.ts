import { useMutation } from '@tanstack/react-query';
import type { ProductImage } from '@bo/contracts';
import { http, type ApiError } from '@/shared/api';

/** 이미지 1장을 올린다. multipart 경계는 브라우저가 정하므로 Content-Type을 직접 넣지 않는다. */
export function useUploadImage() {
  return useMutation<ProductImage, ApiError, File>({
    mutationFn: (file) => {
      const body = new FormData();
      body.append('file', file);
      return http<ProductImage>('/products/images', { method: 'POST', body });
    },
  });
}
