import { PrismaClient } from '@prisma/client';
import { config } from './env';

const prisma = new PrismaClient({
  log: config.nodeEnv === 'development' ? ['error', 'warn'] : ['error'],
});

export default prisma;
