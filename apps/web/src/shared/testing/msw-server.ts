import { setupServer } from 'msw/node';
import { authHandlers } from '@/shared/api/mocks/auth';

/** MSW 목 서버. 기본은 인증 핸들러이고, 나머지는 테스트에서 server.use()로 추가한다. */
export const server = setupServer(...authHandlers);
