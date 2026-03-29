import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";
import { Pool } from "pg";

// Ensure sslmode=require is present and always relax cert verification for hosted DBs with self-signed chains.
const rawDbUrl = process.env.DATABASE_URL;
const connectionString = rawDbUrl
  ? rawDbUrl.includes("sslmode=")
    ? rawDbUrl
    : `${rawDbUrl}${rawDbUrl.includes("?") ? "&" : "?"}sslmode=require`
  : undefined;

const pool = new Pool({
  connectionString,
  ssl: { rejectUnauthorized: false }
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
