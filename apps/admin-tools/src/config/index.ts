import { cleanEnv, port, str } from 'envalid';

export function validateEnv() {
  return cleanEnv(process.env, {
    MONGO_URL: str(),
    JWT_SECRET: str(),
    ADMIN_API_KEY: str(),
    PORT: port({ default: 3005 }),
    BACKUP_DIR: str({ default: '/tmp/admin-tools-backups' }),
    NODE_ENV: str({ choices: ['dev', 'test', 'production', 'ci', 'local'], default: 'local' }),
  });
}
