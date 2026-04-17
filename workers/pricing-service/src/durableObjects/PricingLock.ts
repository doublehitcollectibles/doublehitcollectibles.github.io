interface LockRecord {
  holder: string;
  lockUntil: string;
}

function json(data: unknown, init?: ResponseInit): Response {
  const headers = new Headers(init?.headers);
  headers.set("content-type", "application/json; charset=utf-8");
  return new Response(JSON.stringify(data), { ...init, headers });
}

export class PricingLock {
  constructor(private readonly state: DurableObjectState) {}

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);

    if (request.method === "POST" && url.pathname === "/acquire") {
      const payload = (await request.json()) as { holder: string; ttlSeconds: number };
      const record = (await this.state.storage.get<LockRecord>("lock")) ?? null;
      const now = Date.now();

      if (record && new Date(record.lockUntil).getTime() > now) {
        return json({ acquired: false, holder: record.holder, lockUntil: record.lockUntil }, { status: 409 });
      }

      const nextRecord: LockRecord = {
        holder: payload.holder,
        lockUntil: new Date(now + payload.ttlSeconds * 1_000).toISOString(),
      };
      await this.state.storage.put("lock", nextRecord);

      return json({ acquired: true, holder: nextRecord.holder, lockUntil: nextRecord.lockUntil });
    }

    if (request.method === "POST" && url.pathname === "/release") {
      const payload = (await request.json()) as { holder: string };
      const record = (await this.state.storage.get<LockRecord>("lock")) ?? null;

      if (!record || record.holder !== payload.holder) {
        return json({ released: false }, { status: 409 });
      }

      await this.state.storage.delete("lock");
      return json({ released: true });
    }

    return new Response("Not found", { status: 404 });
  }
}
