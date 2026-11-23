import { setupServer } from 'msw/node';
import { authHandlers } from '@/shared/api/mocks/auth';
import { productHandlers } from '@/shared/api/mocks/products';

/** MSW 목 서버. 기본은 인증·상품 핸들러이고, 나머지는 테스트에서 server.use()로 추가한다. */
export const server = setupServer(...authHandlers, ...productHandlers);
