import { vi, type Mock } from "vitest";

/**
 * Deep, lazily-populated Prisma mock.
 *
 *   prisma.user.findUnique          -> vi.fn()
 *   prisma.$transaction([...])      -> Promise.all of the already-invoked calls
 *   prisma.$transaction(async tx => ...) -> runs the callback with the same mock
 *   prisma.$executeRaw / $queryRaw  -> vi.fn() (called as tagged templates)
 *
 * Every model method is a vi.fn() created on first access, so tests only stub
 * what the route under test actually touches. `clearMocks`/`restoreMocks` in
 * vitest.config.ts reset these between tests like any other vi.fn().
 */
export type MockedModel = Record<string, Mock>;

export const MODEL_NAMES = [
  "user",
  "event",
  "eventImage",
  "eventAttendee",
  "eventSwipe",
  "ticket",
  "connection",
  "message",
  "notification",
  "notificationSchedule",
  "otpToken",
  "memory",
  "contactImport",
  "contactInvitation",
  "referralLink"
] as const;

export type ModelName = (typeof MODEL_NAMES)[number];

const RAW_METHODS = ["$executeRaw", "$executeRawUnsafe", "$queryRaw", "$queryRawUnsafe"] as const;
type RawMethod = (typeof RAW_METHODS)[number];

export type PrismaMock = { $transaction: Mock } & { [K in RawMethod]: Mock } & { [K in ModelName]: MockedModel };

export function createPrismaMock(): PrismaMock {
  const models = new Map<string, MockedModel>();
  const raw = new Map<string, Mock>();

  const getModel = (name: string): MockedModel => {
    let model = models.get(name);
    if (!model) {
      const store: Record<string, Mock> = {};
      model = new Proxy(store, {
        get(target, prop) {
          if (typeof prop !== "string") return undefined;
          if (!(prop in target)) {
            target[prop] = vi.fn();
          }
          return target[prop];
        }
      });
      models.set(name, model);
    }
    return model;
  };

  const getRaw = (name: string): Mock => {
    let fn = raw.get(name);
    if (!fn) {
      fn = vi.fn();
      raw.set(name, fn);
    }
    return fn;
  };

  // eslint-disable-next-line prefer-const
  let root: PrismaMock;

  const $transaction = vi.fn(async (arg: unknown) => {
    if (Array.isArray(arg)) {
      return Promise.all(arg);
    }
    if (typeof arg === "function") {
      return (arg as (tx: PrismaMock) => Promise<unknown>)(root);
    }
    throw new Error("Unsupported $transaction argument in mock");
  });

  root = new Proxy({} as PrismaMock, {
    get(_target, prop) {
      if (prop === "$transaction") return $transaction;
      if (typeof prop !== "string") return undefined;
      if ((RAW_METHODS as readonly string[]).includes(prop)) return getRaw(prop);
      return getModel(prop);
    }
  });

  return root;
}
