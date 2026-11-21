import type { ProductImage } from '@bo/contracts';

/** sortOrder를 배열 순서로 맞추고, 대표가 없으면 첫 이미지를 대표로 만든다. */
export function normalizeImages(images: readonly ProductImage[]): ProductImage[] {
  const hasPrimary = images.some((i) => i.isPrimary);
  return images.map((img, index) => ({
    ...img,
    sortOrder: index,
    isPrimary: hasPrimary ? img.isPrimary : index === 0,
  }));
}

export function moveImage(images: readonly ProductImage[], from: number, to: number) {
  if (to < 0 || to >= images.length) return normalizeImages(images);
  const next = [...images];
  const [moved] = next.splice(from, 1);
  next.splice(to, 0, moved);
  return normalizeImages(next);
}

export function setPrimaryImage(images: readonly ProductImage[], id: string) {
  return normalizeImages(images.map((img) => ({ ...img, isPrimary: img.id === id })));
}

export function removeImage(images: readonly ProductImage[], id: string) {
  return normalizeImages(images.filter((img) => img.id !== id));
}
