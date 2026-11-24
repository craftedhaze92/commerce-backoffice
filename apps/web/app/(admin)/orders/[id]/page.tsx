import { OrderDetailPage } from '@/views/order-detail';

// Next 16: 동적 세그먼트 params는 Promise로 전달된다
export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <OrderDetailPage id={id} />;
}
