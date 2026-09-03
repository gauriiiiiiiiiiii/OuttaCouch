import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const createClient = vi.fn(() => ({ tag: "client" }));
vi.mock("@supabase/supabase-js", () => ({ createClient: (...a: unknown[]) => createClient(...(a as [])) }));

import { emitToRoom } from "@/lib/socketServer";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import { StorageService } from "@/lib/services/storage";

describe("socketServer.emitToRoom", () => {
  afterEach(() => {
    delete (globalThis as { io?: unknown }).io;
  });

  it("is a no-op when no Socket.io server has been booted", () => {
    expect(() => emitToRoom("room", "message", { a: 1 })).not.toThrow();
  });

  it("emits to the room on the global io instance", () => {
    const emit = vi.fn();
    const to = vi.fn(() => ({ emit }));
    (globalThis as { io?: unknown }).io = { to };
    emitToRoom("conn-1", "read", { readAt: "now" });
    expect(to).toHaveBeenCalledWith("conn-1");
    expect(emit).toHaveBeenCalledWith("read", { readAt: "now" });
  });
});

describe("supabaseAdmin.getSupabaseAdmin", () => {
  it("returns null when the URL or service role key is missing", () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "");
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "key");
    expect(getSupabaseAdmin()).toBeNull();
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://x.supabase.co");
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "");
    expect(getSupabaseAdmin()).toBeNull();
    expect(createClient).not.toHaveBeenCalled();
  });

  it("creates a non-persistent client with the service role key", () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://x.supabase.co");
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "service-key");
    expect(getSupabaseAdmin()).toEqual({ tag: "client" });
    expect(createClient).toHaveBeenCalledWith("https://x.supabase.co", "service-key", {
      auth: { persistSession: false }
    });
  });
});

describe("StorageService.uploadImage (client helper)", () => {
  const fetchMock = vi.fn();
  const file = new File([new Uint8Array([1, 2, 3])], "photo.png", { type: "image/png" });

  beforeEach(() => {
    vi.stubGlobal("fetch", fetchMock);
  });

  it("posts multipart form data with file, bucket and optional folder", async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ publicUrl: "https://cdn/x.png", path: "users/x.png" }), { status: 200 })
    );
    const result = await StorageService.uploadImage({ file, bucket: "profile-photos", folder: "users" });
    expect(result).toEqual({ publicUrl: "https://cdn/x.png", path: "users/x.png" });

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("/api/storage/upload");
    expect(init.method).toBe("POST");
    const form = init.body as FormData;
    expect(form.get("bucket")).toBe("profile-photos");
    expect(form.get("folder")).toBe("users");
    expect(form.get("file")).toBeInstanceOf(File);
  });

  it("omits the folder field when not provided", async () => {
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({ publicUrl: "u" }), { status: 200 }));
    await StorageService.uploadImage({ file, bucket: "memories" });
    const form = (fetchMock.mock.calls[0] as [string, RequestInit])[1].body as FormData;
    expect(form.has("folder")).toBe(false);
  });

  it("returns the server error message on a failed upload", async () => {
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({ error: "File too large" }), { status: 400 }));
    await expect(StorageService.uploadImage({ file, bucket: "memories" })).resolves.toEqual({
      error: "File too large"
    });
  });

  it("returns a generic error when the response is OK but has no publicUrl", async () => {
    fetchMock.mockResolvedValueOnce(new Response("{}", { status: 200 }));
    await expect(StorageService.uploadImage({ file, bucket: "memories" })).resolves.toEqual({
      error: "Image upload failed."
    });
  });

  it("returns a generic error when the body is not JSON", async () => {
    fetchMock.mockResolvedValueOnce(new Response("<html>502</html>", { status: 502 }));
    await expect(StorageService.uploadImage({ file, bucket: "memories" })).resolves.toEqual({
      error: "Image upload failed."
    });
  });
});
