import { Suspense } from 'react';
import { DashboardPage } from '@/views/dashboard';

export default function Page() {
  return (
    <Suspense>
      <DashboardPage />
    </Suspense>
  );
}
