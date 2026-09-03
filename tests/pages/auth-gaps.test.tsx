// @vitest-environment jsdom
/**
 * Auth + join pages: Suspense wrappers, reset flows and secondary error paths.
 */
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

// Stable router object per file: Next's useRouter() returns a stable reference, and
// components list it in effect deps, so a fresh object per render would loop forever.
const nav = vi.hoisted(() => {
  const push = vi.fn();
  const replace = vi.fn();
  const back = vi.fn();
  return { push, replace, back, router: { push, replace, back }, searchParams: new URLSearchParams(), params: {} as Record<string, string> };
});
vi.mock("next/navigation", () => ({
  useRouter: () => nav.router,
  useSearchParams: () => nav.searchParams,
  useParams: () => nav.params
}));
const auth = vi.hoisted(() => ({ signIn: vi.fn(), signOut: vi.fn(), update: vi.fn() }));
vi.mock("next-auth/react", () => ({
  signIn: auth.signIn,
  signOut: auth.signOut,
  useSession: () => ({ update: auth.update, data: null, status: "authenticated" })
}));
vi.mock("next/dynamic", () => ({
  default: () => {
    const DynamicStub = (props: { onChange?: (lat: number, lng: number) => void }) => (
      <div data-testid="map-stub">{props.onChange ? <button type="button" onClick={() => props.onChange?.(1, 2)}>pick-on-map</button> : null}</div>
    );
    return DynamicStub;
  }
}));
const storage = vi.hoisted(() => ({ uploadImage: vi.fn() }));
vi.mock("@/lib/services/storage", () => ({ StorageService: storage }));
const socket = vi.hoisted(() => ({ emit: vi.fn(), disconnect: vi.fn(), on: vi.fn() }));
vi.mock("socket.io-client", () => ({ io: () => socket }));

import LoginPage from "@/app/(auth)/login/page";
import ResetPasswordPage from "@/app/(auth)/reset/password/page";
import ResetVerifyPage from "@/app/(auth)/reset/verify/page";
import SetPasswordPage from "@/app/(auth)/signup/password/page";
import VerifyPage from "@/app/(auth)/signup/verify/page";
import ResetPage from "@/app/(auth)/reset/page";
import ResetVerifyClient from "@/app/(auth)/reset/verify/ResetVerifyClient";
import VerifyClient from "@/app/(auth)/signup/verify/VerifyClient";
import ProfileOnboardingPage from "@/app/(auth)/onboarding/profile/page";
import JoinPage from "@/app/join/page";

const fetchMock = vi.fn();
const json = (body: unknown, ok = true, status = ok ? 200 : 404) => Promise.resolve(new Response(JSON.stringify(body), { status }));
const calls = () => fetchMock.mock.calls as Array<[string, RequestInit | undefined]>;
const bodyOf = (url: string, method: string) => {
  const call = calls().find(([u, i]) => u === url && i?.method === method);
  return call ? JSON.parse(call[1]!.body as string) : undefined;
};
const setGeolocation = (impl: unknown) => Object.defineProperty(navigator, "geolocation", { value: impl, configurable: true });

beforeEach(() => {
  vi.stubGlobal("fetch", fetchMock);
  nav.searchParams = new URLSearchParams();
  nav.params = { id: "e1" };
  vi.spyOn(console, "error").mockImplementation(() => {});
  setGeolocation(undefined);
});

describe("auth page wrappers render their client forms under Suspense", () => {
  it.each([
    ["Log in", LoginPage, "Email or phone"],
    ["Set new password", ResetPasswordPage, "Confirm password"],
    ["Verify reset OTP", ResetVerifyPage, "Enter 6-digit code"],
    ["Set password", SetPasswordPage, "Confirm password"],
    ["Verify OTP", VerifyPage, "Enter 6-digit code"]
  ] as const)("%s", (title, Page, placeholder) => {
    render(<Page />);
    expect(screen.getByRole("heading", { level: 1, name: title })).toBeInTheDocument();
    expect(screen.getByPlaceholderText(placeholder)).toBeInTheDocument();
  });
});

describe("ResetPage (phone) and ResetVerifyClient (resend)", () => {
  it("sends a phone reset OTP and shows server errors", async () => {
    fetchMock.mockImplementationOnce(() => json({ status: "sent" })).mockImplementationOnce(() => json({ error: "Too many requests" }, false, 429));
    render(<ResetPage />);
    await userEvent.click(screen.getByLabelText("Phone"));
    await userEvent.type(screen.getByPlaceholderText("Phone number"), "9876543210");
    await userEvent.click(screen.getByRole("button", { name: "Send reset OTP" }));
    await waitFor(() => expect(nav.push).toHaveBeenCalledWith("/reset/verify?contact=9876543210&type=phone"));
    expect(bodyOf("/api/auth/send-otp", "POST")).toEqual({ contact: "9876543210", type: "phone", purpose: "reset" });
    await userEvent.click(screen.getByRole("button", { name: "Send reset OTP" }));
    expect(await screen.findByText("Too many requests")).toBeInTheDocument();
  });

  it("resends a reset code with cooldown, refuses without a contact, and surfaces resend errors", async () => {
    render(<ResetVerifyClient />);
    await userEvent.click(screen.getByRole("button", { name: "Resend OTP" }));
    expect(await screen.findByText("Missing contact.")).toBeInTheDocument();

    nav.searchParams = new URLSearchParams("contact=a%40b.com");
    fetchMock.mockImplementationOnce(() => json({ error: "Please wait" }, false, 429)).mockImplementationOnce(() => json({ status: "sent" }));
    const { unmount } = render(<ResetVerifyClient />);
    const resend = screen.getAllByRole("button", { name: "Resend OTP" }).at(-1)!;
    await userEvent.click(resend);
    expect(await screen.findByText("Please wait")).toBeInTheDocument();
    await userEvent.click(resend);
    expect(await screen.findByText("OTP resent.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Resend in \d+s/ })).toBeDisabled();
    expect(bodyOf("/api/auth/send-otp", "POST")).toEqual({ contact: "a@b.com", type: "email", purpose: "reset" });
    unmount();
  });

  it("shows an error for a rejected reset code", async () => {
    nav.searchParams = new URLSearchParams("contact=a%40b.com");
    fetchMock.mockImplementation(() => json({ error: "Invalid OTP" }, false, 400));
    render(<ResetVerifyClient />);
    await userEvent.type(screen.getByPlaceholderText("Enter 6-digit code"), "000000");
    await userEvent.click(screen.getByRole("button", { name: "Verify" }));
    expect(await screen.findByText("Invalid code.")).toBeInTheDocument();
  });
});

describe("VerifyClient (signup) resend failure and ProfileOnboardingPage empty file", () => {
  it("surfaces a resend error", async () => {
    nav.searchParams = new URLSearchParams("contact=a%40b.com&type=email");
    fetchMock.mockImplementation(() => json({ error: "Too many requests" }, false, 429));
    render(<VerifyClient />);
    await userEvent.click(screen.getByRole("button", { name: "Resend OTP" }));
    expect(await screen.findByText("Too many requests")).toBeInTheDocument();
  });

  it("ignores an empty photo selection", async () => {
    render(<ProfileOnboardingPage />);
    fireEvent.change(document.querySelector('input[type="file"]')!, { target: { files: [] } });
    expect(storage.uploadImage).not.toHaveBeenCalled();
  });
});

describe("JoinPage with a referrer photo", () => {
  it("renders the avatar image instead of the initial", async () => {
    nav.searchParams = new URLSearchParams("ref=ABC");
    fetchMock.mockImplementation(() => json({ code: "ABC", invitedPhone: "+1", fromUser: { id: "r", displayName: "Ravi", profilePhotoUrl: "https://img/r.jpg" } }));
    render(<JoinPage />);
    expect(await screen.findByRole("img", { name: "Ravi" })).toHaveAttribute("src", "https://img/r.jpg");
  });
});

