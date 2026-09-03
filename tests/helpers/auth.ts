import { vi, type Mock } from "vitest";

/**
 * Shared mock for `next-auth/jwt#getToken`.
 *
 * Usage in a test file:
 *   vi.mock("next-auth/jwt", () => import("../helpers/auth").then(m => m.jwtModuleMock));
 *   ...
 *   authAs("user-1");          // subsequent getToken() calls resolve to { sub: "user-1", ... }
 *   authAs(null);              // anonymous
 */
export const getTokenMock: Mock = vi.fn();

export const jwtModuleMock = { getToken: getTokenMock };

export type TokenShape = {
  sub: string;
  profileComplete?: boolean;
  isDeactivated?: boolean;
};

export function authAs(userId: string | null, extra: Partial<TokenShape> = {}) {
  if (userId === null) {
    getTokenMock.mockResolvedValue(null);
    return null;
  }
  const token: TokenShape = { sub: userId, profileComplete: true, isDeactivated: false, ...extra };
  getTokenMock.mockResolvedValue(token);
  return token;
}

/** Shared mock for `next-auth/next#getServerSession` (used by a few routes). */
export const getServerSessionMock: Mock = vi.fn();

export const nextAuthNextModuleMock = { getServerSession: getServerSessionMock };

export function sessionAs(userId: string | null) {
  if (userId === null) {
    getServerSessionMock.mockResolvedValue(null);
    return null;
  }
  const session = { user: { id: userId, name: "Test User" } };
  getServerSessionMock.mockResolvedValue(session);
  return session;
}
