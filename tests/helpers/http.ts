import { NextRequest } from "next/server";

type RequestInitLike = {
  method?: string;
  body?: unknown;
  headers?: Record<string, string>;
  /** Send a raw (non-JSON) body, e.g. FormData. */
  rawBody?: BodyInit;
};

/** Build a NextRequest for an API route. JSON bodies are serialised automatically. */
export function makeRequest(path: string, init: RequestInitLike = {}): NextRequest {
  const url = path.startsWith("http") ? path : `http://localhost:3000${path}`;
  const headers = new Headers(init.headers ?? {});
  let body: BodyInit | undefined;

  if (init.rawBody !== undefined) {
    body = init.rawBody;
  } else if (init.body !== undefined) {
    body = JSON.stringify(init.body);
    if (!headers.has("content-type")) headers.set("content-type", "application/json");
  }

  return new NextRequest(url, {
    method: init.method ?? (body ? "POST" : "GET"),
    headers,
    body
  });
}

/** Route context for dynamic segments: `{ params: Promise<{ id }> }`. */
export function ctx<T extends Record<string, string>>(params: T): { params: Promise<T> } {
  return { params: Promise.resolve(params) };
}

/** Read a NextResponse/Response body as JSON with its status. */
export async function readJson<T = Record<string, unknown>>(res: Response): Promise<{ status: number; body: T }> {
  const text = await res.text();
  let body: T;
  try {
    body = JSON.parse(text) as T;
  } catch {
    body = text as unknown as T;
  }
  return { status: res.status, body };
}
