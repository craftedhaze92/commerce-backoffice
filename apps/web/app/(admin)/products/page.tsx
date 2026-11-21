import { Suspense } from 'react';
import { ProductListPage } from '@/views/product-list';

export default function Page() {
  return (
    <Suspense>
      <ProductListPage />
    </Suspense>
  );
}
