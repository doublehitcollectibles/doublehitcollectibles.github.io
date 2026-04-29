type LogValue = string | number | boolean | null | undefined;
type LogFields = Record<string, LogValue>;

interface CloudflareRequest extends Request {
  cf?: {
    colo?: string;
    country?: string;
  };
}

const SERVICE_NAME = "doublehit-pricing-service";

function compactFields(fields: LogFields): Record<string, string | number | boolean | null> {
  return Object.entries(fields).reduce<Record<string, string | number | boolean | null>>((acc, [key, value]) => {
    if (value === undefined) {
      return acc;
    }

    acc[key] = value;
    return acc;
  }, {});
}

function roundDuration(durationMs: number): number {
  return Math.round(durationMs * 100) / 100;
}

export function startTimer(): number {
  return performance.now();
}

export function elapsedMs(startedAt: number): number {
  return roundDuration(performance.now() - startedAt);
}

export function getRouteName(method: string, pathname: string): string {
  if (pathname === "/health") {
    return "health";
  }

  if (pathname === "/api/admin/collection/cards") {
    return "api.admin.collection.cards";
  }

  if (/^\/api\/admin\/collection\/cards\/[^/]+$/.test(pathname)) {
    return "api.admin.collection.cards.item";
  }

  if (/^\/api\/pokemon\/cards\/[^/]+$/.test(pathname)) {
    return "api.pokemon.cards.detail";
  }

  const apiRoute = pathname
    .replace(/^\/+/, "")
    .replace(/\/+$/, "")
    .replace(/[^a-zA-Z0-9]+/g, ".")
    .replace(/^\.+|\.+$/g, "")
    .toLowerCase();

  return apiRoute ? `${method.toLowerCase()}.${apiRoute}` : `${method.toLowerCase()}.root`;
}

export function getErrorFields(error: unknown): LogFields {
  if (error instanceof Error) {
    return {
      errorName: error.name,
      errorMessage: error.message,
    };
  }

  return {
    errorName: "UnknownError",
    errorMessage: String(error),
  };
}

export function logWorkerEvent(event: string, fields: LogFields = {}): void {
  console.log({
    service: SERVICE_NAME,
    event,
    timestamp: new Date().toISOString(),
    ...compactFields(fields),
  });
}

export function logWorkerError(event: string, error: unknown, fields: LogFields = {}): void {
  console.error({
    service: SERVICE_NAME,
    event,
    timestamp: new Date().toISOString(),
    ...compactFields(fields),
    ...compactFields(getErrorFields(error)),
  });
}

export function logWorkerRequest(request: Request, response: Response, startedAt: number, fields: LogFields = {}): void {
  const url = new URL(request.url);
  const cf = (request as CloudflareRequest).cf;

  logWorkerEvent("worker.request", {
    method: request.method,
    pathname: url.pathname,
    route: getRouteName(request.method, url.pathname),
    status: response.status,
    ok: response.ok,
    durationMs: elapsedMs(startedAt),
    colo: cf?.colo,
    country: cf?.country,
    cfRay: request.headers.get("cf-ray"),
    ...fields,
  });
}
