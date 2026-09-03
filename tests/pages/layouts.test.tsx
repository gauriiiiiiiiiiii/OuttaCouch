// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

// Stable router object per file: Next's useRouter() returns a stable reference, and
// components list it in effect deps, so a fresh object per render would loop forever.
const nav = vi.hoisted(() => {
  const push = vi.fn();
  const replace = vi.fn();
  const back = vi.fn();
  return { push, replace, back, router: { push, replace, back } };
});
vi.mock("next/navigation", () => ({ useRouter: () => nav.router }));
vi.mock("next-auth/react", () => ({
  SessionProvider: ({ children }: { children: React.ReactNode }) => <div data-testid="session-provider">{children}</div>
}));

import RootLayout, { metadata } from "@/app/layout";
import { Providers } from "@/app/providers";
import MainLayout from "@/app/(main)/layout";
import AuthLayout from "@/app/(auth)/layout";

describe("RootLayout + Providers", () => {
  it("declares the app metadata", () => {
    expect(metadata).toEqual({ title: "OUTTACOUCH", description: "Event-first social connection web app" });
  });

  it("wraps the tree in the session provider inside an html/body shell", () => {
    const html = renderToStaticMarkup(
      <RootLayout>
        <p>child</p>
      </RootLayout>
    );
    expect(html).toContain('<html lang="en">');
    expect(html).toContain('data-testid="session-provider"');
    expect(html).toContain("<p>child</p>");
  });

  it("Providers renders children through SessionProvider", () => {
    render(
      <Providers>
        <span>inner</span>
      </Providers>
    );
    expect(screen.getByTestId("session-provider")).toHaveTextContent("inner");
  });
});

describe("MainLayout", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn(() => Promise.resolve(new Response(JSON.stringify({ notifications: [], chats: [] }), { status: 200 }))));
  });

  it("renders the sidebar and bottom navigation with badges and the page content", async () => {
    render(
      <MainLayout>
        <p>page</p>
      </MainLayout>
    );
    expect(screen.getByText("page")).toBeInTheDocument();
    // Desktop sidebar + mobile bar both list the primary links.
    expect(screen.getAllByRole("link", { name: "Explore" })).toHaveLength(2);
    expect(screen.getAllByRole("link", { name: "Add Event" })[0]).toHaveAttribute("href", "/events/new");
    expect(screen.getAllByRole("link", { name: "Connections" })[0]).toHaveAttribute("href", "/connections");
    expect(screen.getAllByRole("link", { name: "Profile" })[0]).toHaveAttribute("href", "/profile");
    expect(screen.getAllByRole("link", { name: "Chat" })).toHaveLength(2);
    expect(screen.getAllByRole("link", { name: "Notifications" })).toHaveLength(2);
  });
});

describe("AuthLayout", () => {
  it("renders the brand bar and a Back button that goes back in history", async () => {
    render(
      <AuthLayout>
        <p>form</p>
      </AuthLayout>
    );
    expect(screen.getByText("OUTTACOUCH")).toBeInTheDocument();
    expect(screen.getByText("form")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Back" }));
    expect(nav.back).toHaveBeenCalledTimes(1);
  });
});
