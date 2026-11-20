import { Role } from '@bo/contracts';
import { DataSource } from 'typeorm';
import { hashPassword } from '../auth/password.js';
import { validateEnv } from '../config/env.js';
import { User } from '../users/user.entity.js';
import { buildDataSourceOptions } from './data-source.js';

const DEMO_USERS = [
  { email: 'admin@demo.com', name: '관리자', role: Role.ADMIN },
  { email: 'manager@demo.com', name: '매니저', role: Role.MANAGER },
  { email: 'viewer@demo.com', name: '뷰어', role: Role.VIEWER },
];

async function main(): Promise<void> {
  const env = validateEnv(process.env);
  const password = process.env.SEED_PASSWORD;
  if (!password) throw new Error('SEED_PASSWORD is required to seed demo accounts');

  const dataSource = new DataSource({ ...buildDataSourceOptions(env), entities: [User] });
  await dataSource.initialize();
  try {
    const repo = dataSource.getRepository(User);
    const passwordHash = await hashPassword(password);
    await repo.upsert(
      DEMO_USERS.map((u) => ({ ...u, passwordHash, isActive: true })),
      ['email'],
    );
    console.log(`Seeded ${DEMO_USERS.length} demo users`);
  } finally {
    await dataSource.destroy();
  }
}

main().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});
