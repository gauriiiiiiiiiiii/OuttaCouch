// @vitest-environment jsdom
/**
 * Location onboarding: geolocation, reverse-geocode and city-search branches.
 * Kept in its own file: these flows chain geolocation callbacks and fetches and
 * proved order-sensitive when run after many other page suites in one file.
 */
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

// Stable router object per file: Next's useRouter() returns a stable reference, and
// components list it in effect deps, so a fresh object per render would loop forever.
const nav = vi.hoisted(() => {
  const push = vi.fn();
  const replace = vi.fn();
  const back = vi.fn();
  return { push, replace, back, router: { push, replace, back } };
});
vi.mock("next/navigation", () => ({
  useRouter: () => nav.router,
  useSearchParams: () => new URLSearchParams(),
  useParams: () => ({})
}));
const auth = vi.hoisted(() => ({ update: vi.fn() }));
vi.mock("next-auth/react", () => ({
  useSession: () => ({ update: auth.update, data: null, status: "authenticated" }),
  signIn: vi.fn(),
  signOut: vi.fn()
}));

import LocationOnboardingPage from "@/app/(auth)/onboarding/location/page";

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
  vi.spyOn(console, "error").mockImplementation(() => {});
  setGeolocation(undefined);
});

describe("LocationOnboardingPage — geolocation and search branches", () => {
  it("reports unsupported geolocation and denied access", async () => {
    render(<LocationOnboardingPage />);
    await userEvent.click(screen.getByRole("button", { name: "Use my location" }));
    expect(await screen.findByText("Geolocation not supported.")).toBeInTheDocument();
    setGeolocation({ getCurrentPosition: (_ok: unknown, fail: () => void) => fail() });
    await userEvent.click(screen.getByRole("button", { name: "Use my location" }));
    expect(await screen.findByText("Could not access your location.")).toBeInTheDocument();
  });

  it("detects the device location, reverse-geocodes the city and saves", async () => {
    setGeolocation({ getCurrentPosition: (ok: (p: unknown) => void) => ok({ coords: { latitude: 28.61, longitude: 77.21 } }) });
    fetchMock.mockImplementation((url: string) =>
      url.includes("/reverse") ? json({ address: { town: "Gurugram" } }) : json({ user: {} })
    );
    render(<LocationOnboardingPage />);
    await userEvent.click(screen.getByRole("button", { name: "Use my location" }));
    expect(await screen.findByText("Location detected.")).toBeInTheDocument();
    expect(screen.getByPlaceholderText("City (optional)")).toHaveValue("Gurugram");
    await userEvent.click(screen.getByRole("button", { name: "Save location" }));
    await waitFor(() => expect(nav.push).toHaveBeenCalledWith("/explore"));
    expect(bodyOf("/api/users/me/location", "PUT")).toEqual({ city: "Gurugram", lat: 28.61, lng: 77.21, profileComplete: true });
  });

  it("tolerates a failed reverse-geocode and a save failure", async () => {
    setGeolocation({ getCurrentPosition: (ok: (p: unknown) => void) => ok({ coords: { latitude: 1, longitude: 2 } }) });
    fetchMock.mockImplementation((url: string) => (url.includes("/reverse") ? json({}, false, 500) : json({}, false, 400)));
    render(<LocationOnboardingPage />);
    await userEvent.click(screen.getByRole("button", { name: "Use my location" }));
    expect(await screen.findByText("Location detected.")).toBeInTheDocument();
    expect(screen.getByPlaceholderText("City (optional)")).toHaveValue("");
    await userEvent.click(screen.getByRole("button", { name: "Save location" }));
    expect(await screen.findByText("Could not save location.")).toBeInTheDocument();
  });

  it("searches a typed city and rejects an empty search", async () => {
    fetchMock.mockImplementation((url: string) => (url.includes("q=Pune") ? json([{ lat: "18.5", lon: "73.8" }]) : json([])));
    render(<LocationOnboardingPage />);
    await userEvent.click(screen.getByRole("button", { name: "Search city" }));
    expect(await screen.findByText("Enter a city to search.")).toBeInTheDocument();

    await userEvent.type(screen.getByPlaceholderText("City (optional)"), "Pune");
    await userEvent.click(screen.getByRole("button", { name: "Search city" }));
    expect(await screen.findByText("Location set from city search.")).toBeInTheDocument();
  });

  it("resolves the city from coarser address parts and tolerates a failed search response", async () => {
    setGeolocation({ getCurrentPosition: (ok: (p: unknown) => void) => ok({ coords: { latitude: 1, longitude: 2 } }) });
    fetchMock.mockImplementation((url: string) => (url.includes("/reverse") ? json({ address: { state: "Goa" } }) : json({}, false, 500)));
    render(<LocationOnboardingPage />);
    await userEvent.click(screen.getByRole("button", { name: "Use my location" }));
    expect(await screen.findByText("Location detected.")).toBeInTheDocument();
    expect(screen.getByPlaceholderText("City (optional)")).toHaveValue("Goa");
    await userEvent.clear(screen.getByPlaceholderText("City (optional)"));
    await userEvent.type(screen.getByPlaceholderText("City (optional)"), "Nowhere");
    await userEvent.click(screen.getByRole("button", { name: "Search city" }));
    expect(await screen.findByText("City not found.")).toBeInTheDocument();
  });

  it("leaves the city blank when the reverse lookup has no usable address parts", async () => {
    setGeolocation({ getCurrentPosition: (ok: (p: unknown) => void) => ok({ coords: { latitude: 1, longitude: 2 } }) });
    fetchMock.mockImplementationOnce(() => json({ address: { road: "Main St" } })).mockImplementation(() => json({}));
    render(<LocationOnboardingPage />);
    await userEvent.click(screen.getByRole("button", { name: "Use my location" }));
    expect(await screen.findByText("Location detected.")).toBeInTheDocument();
    expect(screen.getByPlaceholderText("City (optional)")).toHaveValue("");
  });

  it("rejects an unknown city on submit when no coordinates were resolved", async () => {
    fetchMock.mockImplementation(() => json([]));
    render(<LocationOnboardingPage />);
    await userEvent.type(screen.getByPlaceholderText("City (optional)"), "Atlantis");
    await userEvent.click(screen.getByRole("button", { name: "Save location" }));
    expect(await screen.findByText("City not found.")).toBeInTheDocument();
    expect(calls().some(([u]) => u === "/api/users/me/location")).toBe(false);
  });
});

