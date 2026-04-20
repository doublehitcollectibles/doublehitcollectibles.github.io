export function json(data: unknown, init?: ResponseInit): Response {
  const headers = new Headers(init?.headers);
  headers.set("content-type", "application/json; charset=utf-8");
  headers.set("cache-control", "no-store, max-age=0");
  headers.set("pragma", "no-cache");

  return new Response(JSON.stringify(data, null, 2), {
    ...init,
    headers,
  });
}
