import { setupServer } from 'msw/node';

/** MSW 목 서버. 핸들러는 테스트에서 server.use()로 추가한다. */
export const server = setupServer();
