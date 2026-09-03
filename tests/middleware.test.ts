import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

vi.mock("next-auth/jwt", () => import("./helpers/auth").then((m) => m.jwtModuleMock));

import { authAs, getTokenMock } from "./helpers/auth";
import { config, middleware } from "@/middleware";

const req = (path: string) => new NextRequest(`http://localhost:3000${path}`);

const redirectTarget = (res: Response) => {
  const location = res.headers.get("location");
  return location ? new URL(location) : null;
};

describe("middleware", () => {
  beforeEach(() => {
    getTokenMock.mockReset();
  });

  it("redirects anonymous users to /login with a next param", async () => {
    authAs(null);
    const res = await middleware(req("/events/abc"));
    const target = redirectTarget(res);
    expect(res.status).toBe(307);
    expect(target?.pathname).toBe("/login");
    expect(target?.searchParams.get("next")).toBe("/events/abc");
  });

  it("redirects deactivated users to /login?deactivated=1", async () => {
    authAs("u1", { isDeactivated: true });
    const res = await middleware(req("/explore"));
    const target = redirectTarget(res);
    expect(target?.pathname).toBe("/login");
    expect(target?.searchParams.get("deactivated")).toBe("1");
  });

  it("sends users with incomplete profiles to onboarding", async () => {
    authAs("u1", { profileComplete: false });
    const res = await middleware(req("/explore"));
    expect(redirectTarget(res)?.pathname).toBe("/onboarding/profile");
  });

  it("lets users with incomplete profiles stay on onboarding pages", async () => {
    authAs("u1", { profileComplete: false });
    const res = await middleware(req("/onboarding/location"));
    expect(res.status).toBe(200);
    expect(res.headers.get("location")).toBeNull();
  });

  it("bounces completed users away from onboarding to /explore", async () => {
    authAs("u1", { profileComplete: true });
    const res = await middleware(req("/onboarding/profile"));
    expect(redirectTarget(res)?.pathname).toBe("/explore");
  });

  it("passes through fully onboarded users", async () => {
    authAs("u1");
    const res = await middleware(req("/profile/tickets"));
    expect(res.status).toBe(200);
    expect(res.headers.get("location")).toBeNull();
  });

  it("checks deactivation before profile completeness", async () => {
    authAs("u1", { isDeactivated: true, profileComplete: false });
    const res = await middleware(req("/explore"));
    expect(redirectTarget(res)?.searchParams.get("deactivated")).toBe("1");
  });

  it("reads the token with the NEXTAUTH_SECRET", async () => {
    authAs("u1");
    await middleware(req("/explore"));
    expect(getTokenMock).toHaveBeenCalledWith(expect.objectContaining({ secret: "test-secret" }));
  });
});

describe("middleware matcher", () => {
  it("protects every authenticated section including nested explore routes", () => {
    expect(config.matcher).toEqual(
      expect.arrayContaining([
        "/explore/:path*",
        "/events/:path*",
        "/connections",
        "/chat/:path*",
        "/profile/:path*",
        "/settings/:path*",
        "/notifications",
        "/users/:path*",
        "/onboarding/:path*"
      ])
    );
  });

  it("leaves public routes unmatched", () => {
    const publicPaths = ["/", "/login", "/signup", "/reset", "/join"];
    for (const path of publicPaths) {
      expect(config.matcher.some((m) => m === path || m.startsWith(`${path}/`))).toBe(false);
    }
  });
});
