import { describe, expect, it, vi } from "vitest";
import { navigateToProfile } from "@/lib/navigateToProfile";

describe("navigateToProfile", () => {
  it("pushes the public profile route for a user id", () => {
    const router = { push: vi.fn() };
    navigateToProfile(router, "abc-123");
    expect(router.push).toHaveBeenCalledWith("/users/abc-123");
  });

  it("does nothing for an empty id", () => {
    const router = { push: vi.fn() };
    navigateToProfile(router, "");
    expect(router.push).not.toHaveBeenCalled();
  });
});
