import { z } from 'zod';
import {
  normalizeSku,
  PRODUCT_LIMITS,
  ProductStatus,
  SKU_PATTERN,
  type ProductDetail,
  type ProductImage,
} from '@bo/contracts';

/** 입력칸 문자열을 0 이상 max 이하의 정수로 바꾼다. 빈칸은 필수 에러로 본다. */
function integerField(required: string, rangeSubject: string, max: number) {
  const range = `${rangeSubject} 0 이상 ${max.toLocaleString('ko-KR')} 이하의 정수여야 합니다`;
  return z
    .string()
    .trim()
    .min(1, required)
    .pipe(z.coerce.number<string>({ error: range }).int(range).min(0, range).max(max, range));
}

export const productFormSchema = z.object({
  sku: z
    .string()
    .transform(normalizeSku)
    .pipe(z.string().regex(SKU_PATTERN, 'SKU는 대문자 영숫자와 -로 3–32자여야 합니다')),
  name: z
    .string()
    .trim()
    .min(1, '상품명을 입력하세요')
    .max(PRODUCT_LIMITS.nameMax, `상품명은 ${PRODUCT_LIMITS.nameMax}자 이하여야 합니다`),
  categoryId: z.string().min(1, '카테고리를 선택하세요'),
  price: integerField('가격을 입력하세요', '가격은', PRODUCT_LIMITS.maxPrice),
  status: z.enum(ProductStatus),
  description: z
    .string()
    .max(
      PRODUCT_LIMITS.descriptionMax,
      `설명은 ${PRODUCT_LIMITS.descriptionMax}자 이하여야 합니다`,
    ),
  initialStock: integerField('초기 재고를 입력하세요', '재고는', PRODUCT_LIMITS.maxStock),
  safetyStock: integerField('안전 재고를 입력하세요', '재고는', PRODUCT_LIMITS.maxStock),
  images: z
    .array(z.custom<ProductImage>())
    .max(
      PRODUCT_LIMITS.imageMaxCount,
      `최대 ${PRODUCT_LIMITS.imageMaxCount}장까지 등록할 수 있습니다`,
    )
    .refine(
      (images) => images.length === 0 || images.filter((i) => i.isPrimary).length === 1,
      '대표 이미지를 1장 지정하세요',
    ),
});

export type ProductFormInput = z.input<typeof productFormSchema>;
export type ProductFormValues = z.output<typeof productFormSchema>;

export const EMPTY_PRODUCT_FORM: ProductFormInput = {
  sku: '',
  name: '',
  categoryId: '',
  price: '',
  status: ProductStatus.DRAFT,
  description: '',
  initialStock: '',
  safetyStock: '0',
  images: [],
};

/** 상세 응답을 폼 입력값으로 바꾼다. 초기 재고는 수정 화면에 없으므로 '0'으로 채워 검증만 통과시킨다. */
export function toFormInput(detail: ProductDetail): ProductFormInput {
  return {
    sku: detail.sku,
    name: detail.name,
    categoryId: detail.categoryId,
    price: String(detail.price),
    status: detail.status,
    description: detail.description,
    initialStock: '0',
    safetyStock: String(detail.safetyStock),
    images: detail.images,
  };
}
