import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";
import { Pool } from "pg";

const connectionString = process.env.DATABASE_URL;
// Default to SSL on; allow explicit opt-out for local dev only, and an insecure flag for MITM/self-signed environments.
const useSsl = process.env.DATABASE_SSL !== "false";
const allowInsecure = process.env.DATABASE_SSL_INSECURE === "true";

const ssl = useSsl
  ? { rejectUnauthorized: !allowInsecure }
  : undefined;

const pool = new Pool({
  connectionString,
  ssl
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
