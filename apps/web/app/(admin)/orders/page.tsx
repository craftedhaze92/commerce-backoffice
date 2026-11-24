import { Suspense } from 'react';
import { OrderListPage } from '@/views/order-list';

export default function Page() {
  return (
    <Suspense>
      <OrderListPage />
    </Suspense>
  );
}
