import "@testing-library/jest-dom/vitest";
import { configure } from "@testing-library/react";
import { createElement, type ImgHTMLAttributes } from "react";
import { afterEach, vi } from "vitest";

// findBy*/waitFor default to 1s; coverage-instrumented page renders can exceed that.
configure({ asyncUtilTimeout: 5000 });

// Deterministic env defaults for every test file. Individual tests override
// with vi.stubEnv(); `unstubEnvs: true` in the config restores them afterwards.
process.env.NEXTAUTH_SECRET = "test-secret";
process.env.NEXTAUTH_URL = "http://localhost:3000";
process.env.NEXT_PUBLIC_APP_URL = "http://localhost:3000";
process.env.DEFAULT_PHONE_COUNTRY_CODE = "91";

// next/image needs the Next runtime (loader config, IntersectionObserver).
// A plain <img> is the correct stand-in for unit tests.
vi.mock("next/image", () => ({
  __esModule: true,
  default: (props: ImgHTMLAttributes<HTMLImageElement> & { fill?: boolean; priority?: boolean }) => {
    const { fill: _fill, priority: _priority, ...rest } = props;
    void _fill;
    void _priority;
    return createElement("img", rest);
  }
}));

// Safety net: no test may reach the real network. Tests stub fetch explicitly
// (vi.stubGlobal); anything that slips through fails fast with the URL instead
// of hanging on a blocked socket. Assigned directly (not via stubGlobal) so
// `unstubGlobals` restores to this guard rather than to real fetch.
globalThis.fetch = ((input: RequestInfo | URL) => {
  const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
  return Promise.reject(new Error(`Unmocked fetch in test: ${url}`));
}) as typeof fetch;

// jsdom gaps used by components under test (Recharts, chat auto-scroll).
if (typeof window !== "undefined") {
  if (!("ResizeObserver" in window)) {
    class ResizeObserverStub {
      observe() {}
      unobserve() {}
      disconnect() {}
    }
    (window as unknown as { ResizeObserver: typeof ResizeObserverStub }).ResizeObserver = ResizeObserverStub;
  }
  if (!Element.prototype.scrollIntoView) {
    Element.prototype.scrollIntoView = () => {};
  }
}

afterEach(() => {
  vi.useRealTimers();
});
