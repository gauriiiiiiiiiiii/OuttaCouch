import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";
import { Pool } from "pg";

const shouldRelaxTls =
  process.env.PGSSL_REJECT_UNAUTHORIZED === "false" ||
  process.env.NODE_ENV === "production";

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  // Relax TLS in production or when explicitly requested to avoid self-signed cert failures.
  ssl: shouldRelaxTls ? { rejectUnauthorized: false } : undefined
});

const adapter = new PrismaPg(pool);

const globalForPrisma = global as unknown as { prisma?: PrismaClient };

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    adapter,
    log: ["warn", "error"]
  });

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
