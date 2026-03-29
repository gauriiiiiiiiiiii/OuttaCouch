// Prisma 7 config (TypeScript)
import 'dotenv/config';
import { defineConfig, env } from '@prisma/config';

export default defineConfig({
  schema: './prisma/schema.prisma',
  datasource: {
    url: env('DATABASE_URL'),
    // directUrl is optional; add env('DIRECT_URL') here if you need migrations via direct connection
  },
});
