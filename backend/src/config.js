import 'dotenv/config';
export const config = {
  nodeEnv: process.env.NODE_ENV || 'development',
  port: Number(process.env.PORT || 4000),
  databaseUrl: process.env.DATABASE_URL,
  jwtSecret: process.env.JWT_SECRET,
  clientOrigins: (process.env.CLIENT_ORIGIN || 'http://localhost:8081,http://localhost:19006').split(',').map(s=>s.trim()),
  emailMode: process.env.EMAIL_MODE || 'console',
  expoEnabled: process.env.EXPO_PUSH_ENABLED === 'true',
  expoToken: process.env.EXPO_ACCESS_TOKEN || '',
};
export function validateConfig() {
  if (!config.databaseUrl) throw new Error('Set DATABASE_URL in .env');
  if (!config.jwtSecret || config.jwtSecret.length < 32 || config.jwtSecret.startsWith('REPLACE_')) throw new Error('Set a unique JWT_SECRET of at least 32 characters');
  if (config.nodeEnv === 'production' && config.emailMode !== 'smtp') throw new Error('Production needs EMAIL_MODE=smtp');
  if (!['smtp','console'].includes(config.emailMode)) throw new Error('EMAIL_MODE must be smtp or console');
}
