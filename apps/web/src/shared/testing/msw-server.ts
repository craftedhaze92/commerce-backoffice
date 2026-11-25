import { setupServer } from 'msw/node';
import { authHandlers } from '@/shared/api/mocks/auth';
import { dashboardHandlers } from '@/shared/api/mocks/dashboard';
import { exportHandlers } from '@/shared/api/mocks/export';
import { orderHandlers } from '@/shared/api/mocks/orders';
import { productHandlers } from '@/shared/api/mocks/products';
import { userHandlers } from '@/shared/api/mocks/users';

/** MSW 목 서버. 기본은 인증·상품·주문·대시보드·내보내기 핸들러이고, 나머지는 테스트에서 server.use()로 추가한다. */
export const server = setupServer(
  ...authHandlers,
  // /:id 핸들러가 /export를 가리지 않도록 내보내기 핸들러를 먼저 둔다.
  ...exportHandlers,
  ...productHandlers,
  ...orderHandlers,
  ...dashboardHandlers,
  ...userHandlers,
);
