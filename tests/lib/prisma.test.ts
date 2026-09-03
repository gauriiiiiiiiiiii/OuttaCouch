import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const ctor = vi.hoisted(() => ({
  pool: vi.fn(),
  adapter: vi.fn(),
  client: vi.fn()
}));

vi.mock("pg", () => ({
  Pool: class {
    constructor(options: unknown) {
      ctor.pool(options);
    }
  }
}));
vi.mock("@prisma/adapter-pg", () => ({
  PrismaPg: class {
    constructor(pool: unknown) {
      ctor.adapter(pool);
    }
  }
}));
vi.mock("@prisma/client", () => ({
  PrismaClient: class {
    constructor(options: unknown) {
      ctor.client(options);
    }
  }
}));

const globalRef = global as unknown as { prisma?: unknown };

async function loadPrisma() {
  vi.resetModules();
  const mod = await import("@/lib/prisma");
  return mod.prisma;
}

describe("lib/prisma bootstrap", () => {
  beforeEach(() => {
    delete globalRef.prisma;
    vi.stubEnv("DATABASE_URL", "postgresql://user:pw@host:5432/db");
    vi.stubEnv("NODE_ENV", "test");
    vi.stubEnv("DATABASE_SSL", "");
    vi.stubEnv("DATABASE_SSL_INSECURE", "");
  });

  afterEach(() => {
    delete globalRef.prisma;
  });

  it("defaults to strict SSL and wires the pg Pool through the Prisma adapter", async () => {
    await loadPrisma();
    expect(ctor.pool).toHaveBeenCalledWith({ connectionString: "postgresql://user:pw@host:5432/db", ssl: { rejectUnauthorized: true } });
    expect(ctor.adapter).toHaveBeenCalledTimes(1);
    expect(ctor.client).toHaveBeenCalledWith(expect.objectContaining({ log: ["warn", "error"], adapter: expect.anything() }));
  });

  it("disables SSL only with an explicit DATABASE_SSL=false", async () => {
    vi.stubEnv("DATABASE_SSL", "false");
    await loadPrisma();
    expect(ctor.pool).toHaveBeenLastCalledWith(expect.objectContaining({ ssl: undefined }));
  });

  it("relaxes certificate verification with DATABASE_SSL_INSECURE=true (Windows dev workaround)", async () => {
    vi.stubEnv("DATABASE_SSL_INSECURE", "true");
    await loadPrisma();
    expect(ctor.pool).toHaveBeenLastCalledWith(expect.objectContaining({ ssl: { rejectUnauthorized: false } }));
  });

  it("caches the client on the global object outside production (survives HMR)", async () => {
    const first = await loadPrisma();
    expect(globalRef.prisma).toBe(first);
    const second = await loadPrisma();
    expect(second).toBe(first);
    expect(ctor.client).toHaveBeenCalledTimes(1);
  });

  it("does not use the global cache in production", async () => {
    vi.stubEnv("NODE_ENV", "production");
    await loadPrisma();
    expect(globalRef.prisma).toBeUndefined();
  });
});
