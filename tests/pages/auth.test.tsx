// @vitest-environment jsdom
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

// Stable router object per file: Next's useRouter() returns a stable reference, and
// components list it in effect deps, so a fresh object per render would loop forever.
const nav = vi.hoisted(() => {
  const push = vi.fn();
  const replace = vi.fn();
  const back = vi.fn();
  return { push, replace, back, router: { push, replace, back }, searchParams: new URLSearchParams() };
});
vi.mock("next/navigation", () => ({
  useRouter: () => nav.router,
  useSearchParams: () => nav.searchParams,
  useParams: () => ({})
}));

const auth = vi.hoisted(() => ({ signIn: vi.fn(), signOut: vi.fn(), update: vi.fn() }));
vi.mock("next-auth/react", () => ({
  signIn: auth.signIn,
  signOut: auth.signOut,
  useSession: () => ({ update: auth.update, data: null, status: "unauthenticated" })
}));

import LoginClient from "@/app/(auth)/login/LoginClient";
import SignupPage from "@/app/(auth)/signup/page";
import VerifyClient from "@/app/(auth)/signup/verify/VerifyClient";
import PasswordClient from "@/app/(auth)/signup/password/PasswordClient";
import ResetPage from "@/app/(auth)/reset/page";
import ResetVerifyClient from "@/app/(auth)/reset/verify/ResetVerifyClient";
import ResetPasswordClient from "@/app/(auth)/reset/password/ResetPasswordClient";
import LocationOnboardingPage from "@/app/(auth)/onboarding/location/page";

const fetchMock = vi.fn();
const json = (body: unknown, ok = true) => Promise.resolve(new Response(JSON.stringify(body), { status: ok ? 200 : 400 }));
const lastBody = () => JSON.parse((fetchMock.mock.calls.at(-1)![1] as RequestInit).body as string);

beforeEach(() => {
  vi.stubGlobal("fetch", fetchMock);
  nav.searchParams = new URLSearchParams();
});

describe("LoginClient", () => {
  it("signs in with credentials and redirects to the next param", async () => {
    nav.searchParams = new URLSearchParams("next=/events/abc");
    auth.signIn.mockResolvedValue({ error: null });
    render(<LoginClient />);
    await userEvent.type(screen.getByPlaceholderText("Email or phone"), "a@b.com");
    await userEvent.type(screen.getByPlaceholderText("Password"), "secret");
    await userEvent.click(screen.getByRole("button", { name: "Log in" }));
    await waitFor(() => expect(nav.push).toHaveBeenCalledWith("/events/abc"));
    expect(auth.signIn).toHaveBeenCalledWith("credentials", { redirect: false, contact: "a@b.com", password: "secret" });
  });

  it("defaults to /explore and shows an error on bad credentials", async () => {
    auth.signIn.mockResolvedValue({ error: "CredentialsSignin" });
    render(<LoginClient />);
    await userEvent.type(screen.getByPlaceholderText("Email or phone"), "a@b.com");
    await userEvent.type(screen.getByPlaceholderText("Password"), "wrong");
    await userEvent.click(screen.getByRole("button", { name: "Log in" }));
    expect(await screen.findByText("Invalid credentials.")).toBeInTheDocument();
    expect(nav.push).not.toHaveBeenCalled();
    expect(screen.getByRole("link", { name: "Forgot password?" })).toHaveAttribute("href", "/reset");
    expect(screen.getByRole("link", { name: "Create account" })).toHaveAttribute("href", "/signup");
  });
});

describe("SignupPage", () => {
  it("sends an email OTP and forwards the referral code to the verify step", async () => {
    nav.searchParams = new URLSearchParams("ref=ABCD1234");
    fetchMock.mockImplementation(() => json({ status: "sent" }));
    render(<SignupPage />);
    await userEvent.type(screen.getByPlaceholderText("Email address"), "New@Example.com");
    await userEvent.click(screen.getByRole("button", { name: "Send OTP" }));
    await waitFor(() => expect(nav.push).toHaveBeenCalled());
    expect(fetchMock).toHaveBeenCalledWith("/api/auth/send-otp", expect.objectContaining({ method: "POST" }));
    expect(lastBody()).toEqual({ contact: "New@Example.com", type: "email", purpose: "signup" });
    expect(nav.push).toHaveBeenCalledWith("/signup/verify?contact=New%40Example.com&type=email&ref=ABCD1234");
  });

  it("switches to phone mode and surfaces server errors", async () => {
    fetchMock.mockImplementation(() => json({ error: "Please wait before requesting another code." }, false));
    render(<SignupPage />);
    await userEvent.click(screen.getByLabelText("Phone"));
    await userEvent.type(screen.getByPlaceholderText("Phone number"), "9876543210");
    await userEvent.click(screen.getByRole("button", { name: "Send OTP" }));
    expect(await screen.findByText("Please wait before requesting another code.")).toBeInTheDocument();
    expect(lastBody()).toMatchObject({ type: "phone" });
    expect(nav.push).not.toHaveBeenCalled();
  });
});

describe("VerifyClient (signup)", () => {
  it("verifies the code and continues to the password step with token and ref", async () => {
    nav.searchParams = new URLSearchParams("contact=a%40b.com&type=email&ref=ABCD1234");
    fetchMock.mockImplementation(() => json({ status: "verified", token: "otp-token" }));
    render(<VerifyClient />);
    await userEvent.type(screen.getByPlaceholderText("Enter 6-digit code"), "123456");
    await userEvent.click(screen.getByRole("button", { name: "Verify" }));
    await waitFor(() => expect(nav.push).toHaveBeenCalledWith("/signup/password?contact=a%40b.com&token=otp-token&ref=ABCD1234"));
    expect(lastBody()).toEqual({ contact: "a@b.com", otp: "123456", purpose: "signup" });
  });

  it("shows an error for a rejected code", async () => {
    nav.searchParams = new URLSearchParams("contact=a%40b.com");
    fetchMock.mockImplementation(() => json({ error: "Invalid OTP" }, false));
    render(<VerifyClient />);
    await userEvent.type(screen.getByPlaceholderText("Enter 6-digit code"), "000000");
    await userEvent.click(screen.getByRole("button", { name: "Verify" }));
    expect(await screen.findByText("Invalid code.")).toBeInTheDocument();
  });

  it("resends the OTP and starts a 30s cooldown", async () => {
    nav.searchParams = new URLSearchParams("contact=%2B919876543210&type=phone");
    fetchMock.mockImplementation(() => json({ status: "sent" }));
    render(<VerifyClient />);
    await userEvent.click(screen.getByRole("button", { name: "Resend OTP" }));
    expect(await screen.findByText("OTP resent.")).toBeInTheDocument();
    expect(lastBody()).toEqual({ contact: "+919876543210", type: "phone", purpose: "signup" });
    expect(screen.getByRole("button", { name: /Resend in \d+s/ })).toBeDisabled();
  });

  it("refuses to resend without a contact", async () => {
    render(<VerifyClient />);
    await userEvent.click(screen.getByRole("button", { name: "Resend OTP" }));
    expect(await screen.findByText("Missing contact.")).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("PasswordClient (signup)", () => {
  beforeEach(() => {
    nav.searchParams = new URLSearchParams("contact=a%40b.com&token=otp-token&ref=ABCD1234");
  });

  it("rejects mismatched passwords locally", async () => {
    render(<PasswordClient />);
    await userEvent.type(screen.getByPlaceholderText("Password"), "one");
    await userEvent.type(screen.getByPlaceholderText("Confirm password"), "two");
    await userEvent.click(screen.getByRole("button", { name: "Continue" }));
    expect(await screen.findByText("Passwords do not match.")).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("registers, auto-signs-in and moves to onboarding", async () => {
    fetchMock.mockImplementation(() => json({ status: "registered" }));
    auth.signIn.mockResolvedValue({ error: null });
    render(<PasswordClient />);
    await userEvent.type(screen.getByPlaceholderText("Password"), "s3cret!");
    await userEvent.type(screen.getByPlaceholderText("Confirm password"), "s3cret!");
    await userEvent.click(screen.getByRole("button", { name: "Continue" }));
    await waitFor(() => expect(nav.push).toHaveBeenCalledWith("/onboarding/profile"));
    expect(fetchMock).toHaveBeenCalledWith("/api/auth/register", expect.objectContaining({ method: "POST" }));
    expect(lastBody()).toEqual({ contact: "a@b.com", password: "s3cret!", token: "otp-token", ref: "ABCD1234" });
    expect(auth.signIn).toHaveBeenCalledWith("credentials", { redirect: false, contact: "a@b.com", password: "s3cret!" });
  });

  it("shows the server error when registration fails", async () => {
    fetchMock.mockImplementation(() => json({ error: "User already exists" }, false));
    render(<PasswordClient />);
    await userEvent.type(screen.getByPlaceholderText("Password"), "pw");
    await userEvent.type(screen.getByPlaceholderText("Confirm password"), "pw");
    await userEvent.click(screen.getByRole("button", { name: "Continue" }));
    expect(await screen.findByText("User already exists")).toBeInTheDocument();
    expect(auth.signIn).not.toHaveBeenCalled();
  });
});

describe("Password reset flow", () => {
  it("ResetPage requests a reset OTP and moves to verification", async () => {
    fetchMock.mockImplementation(() => json({ status: "sent" }));
    render(<ResetPage />);
    await userEvent.type(screen.getByPlaceholderText("Email address"), "a@b.com");
    await userEvent.click(screen.getByRole("button", { name: "Send reset OTP" }));
    await waitFor(() => expect(nav.push).toHaveBeenCalledWith("/reset/verify?contact=a%40b.com&type=email"));
    expect(lastBody()).toEqual({ contact: "a@b.com", type: "email", purpose: "reset" });
  });

  it("ResetVerifyClient verifies with purpose=reset and forwards the token", async () => {
    nav.searchParams = new URLSearchParams("contact=a%40b.com&type=email");
    fetchMock.mockImplementation(() => json({ status: "verified", token: "reset-token" }));
    render(<ResetVerifyClient />);
    await userEvent.type(screen.getByPlaceholderText("Enter 6-digit code"), "654321");
    await userEvent.click(screen.getByRole("button", { name: "Verify" }));
    await waitFor(() => expect(nav.push).toHaveBeenCalledWith("/reset/password?contact=a%40b.com&token=reset-token"));
    expect(lastBody()).toEqual({ contact: "a@b.com", otp: "654321", purpose: "reset" });
  });

  it("ResetPasswordClient validates, submits and confirms", async () => {
    nav.searchParams = new URLSearchParams("contact=a%40b.com&token=reset-token");
    fetchMock.mockImplementation(() => json({ status: "reset" }));
    render(<ResetPasswordClient />);
    await userEvent.type(screen.getByPlaceholderText("Password"), "new");
    await userEvent.type(screen.getByPlaceholderText("Confirm password"), "old");
    await userEvent.click(screen.getByRole("button", { name: "Update password" }));
    expect(await screen.findByText("Passwords do not match.")).toBeInTheDocument();

    await userEvent.clear(screen.getByPlaceholderText("Confirm password"));
    await userEvent.type(screen.getByPlaceholderText("Confirm password"), "new");
    await userEvent.click(screen.getByRole("button", { name: "Update password" }));
    expect(await screen.findByText(/Password updated/)).toBeInTheDocument();
    expect(lastBody()).toEqual({ contact: "a@b.com", password: "new", token: "reset-token" });
  });

  it("ResetPasswordClient shows the server error", async () => {
    nav.searchParams = new URLSearchParams("contact=a%40b.com&token=bad");
    fetchMock.mockImplementation(() => json({ error: "OTP expired" }, false));
    render(<ResetPasswordClient />);
    await userEvent.type(screen.getByPlaceholderText("Password"), "x");
    await userEvent.type(screen.getByPlaceholderText("Confirm password"), "x");
    await userEvent.click(screen.getByRole("button", { name: "Update password" }));
    expect(await screen.findByText("OTP expired")).toBeInTheDocument();
  });
});

describe("LocationOnboardingPage", () => {
  it("requires a location or city before saving", async () => {
    render(<LocationOnboardingPage />);
    await userEvent.click(screen.getByRole("button", { name: "Save location" }));
    expect(await screen.findByText("Please use location or search a city.")).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("geocodes a typed city, saves it with profileComplete and refreshes the session", async () => {
    fetchMock.mockImplementation((url: string) =>
      url.startsWith("https://nominatim")
        ? json([{ lat: "28.61", lon: "77.21", display_name: "Delhi" }])
        : json({ user: { id: "u1" } })
    );
    auth.update.mockResolvedValue({});
    render(<LocationOnboardingPage />);
    await userEvent.type(screen.getByPlaceholderText("City (optional)"), "Delhi");
    await userEvent.click(screen.getByRole("button", { name: "Save location" }));
    await waitFor(() => expect(nav.push).toHaveBeenCalledWith("/explore"));

    const saveCall = fetchMock.mock.calls.find(([url]) => url === "/api/users/me/location")!;
    expect(JSON.parse((saveCall[1] as RequestInit).body as string)).toEqual({ city: "Delhi", lat: 28.61, lng: 77.21, profileComplete: true });
    expect(auth.update).toHaveBeenCalledWith({ profileComplete: true });
  });

  it("reports an unknown city", async () => {
    fetchMock.mockImplementation(() => json([]));
    render(<LocationOnboardingPage />);
    await userEvent.type(screen.getByPlaceholderText("City (optional)"), "Nowhere");
    await userEvent.click(screen.getByRole("button", { name: "Search city" }));
    expect(await screen.findByText("City not found.")).toBeInTheDocument();
  });
});
