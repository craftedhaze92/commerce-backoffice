import { DataSource } from 'typeorm';
import { validateEnv } from '../config/env.js';
import { buildDataSourceOptions } from './data-source.js';
import { User } from '../users/user.entity.js';

/** DataSource instance consumed by the TypeORM CLI (migration:run / generate). */
export default new DataSource({
  ...buildDataSourceOptions(validateEnv(process.env)),
  entities: [User],
});
