import type { VisitorLeavePayload, VisitorStats, VisitorTrackAction, VisitorTrackPayload } from "../types";

const DEFAULT_SITE_KEY = "doublehitcollectibles.github.io";
const VISITOR_ID_PATTERN = /^[A-Za-z0-9._:-]{6,128}$/;
export const VISITOR_SESSION_TTL_SECONDS = 45;

function toIsoTimestamp(date: Date = new Date()): string {
  return date.toISOString();
}

function buildStaleCutoff(date: Date = new Date(), ttlSeconds: number = VISITOR_SESSION_TTL_SECONDS): string {
  return new Date(date.getTime() - ttlSeconds * 1000).toISOString();
}

function readCount(row: { count?: number | string } | null | undefined): number {
  const parsed = Number(row?.count ?? 0);
  return Number.isFinite(parsed) ? Math.max(0, Math.trunc(parsed)) : 0;
}

function normalizeVisitorIdentifier(value: unknown, fieldName: string): string {
  const normalized = String(value ?? "").trim();

  if (!VISITOR_ID_PATTERN.test(normalized)) {
    throw new Error(`${fieldName} is required.`);
  }

  return normalized;
}

function normalizeUrlLikeValue(value: string): string {
  try {
    return new URL(value).origin.toLowerCase();
  } catch (_error) {
    return value.toLowerCase();
  }
}

export function normalizeVisitorSiteKey(value: unknown, fallback: string = DEFAULT_SITE_KEY): string {
  const rawValue = String(value ?? "").trim();
  const candidate = rawValue || fallback;
  const normalized = normalizeUrlLikeValue(candidate)
    .replace(/\/+$/, "")
    .replace(/[^a-z0-9:/._-]+/g, "-")
    .slice(0, 160);

  return normalized || DEFAULT_SITE_KEY;
}

export function normalizeVisitorAction(value: unknown): VisitorTrackAction {
  return String(value ?? "").trim().toLowerCase() === "visit" ? "visit" : "heartbeat";
}

export function parseVisitorTrackPayload(payload: unknown, fallbackSiteKey: string): VisitorTrackPayload {
  const body = payload && typeof payload === "object" ? payload as Record<string, unknown> : {};

  return {
    siteKey: normalizeVisitorSiteKey(body.siteKey, fallbackSiteKey),
    visitorId: normalizeVisitorIdentifier(body.visitorId, "visitorId"),
    visitId: normalizeVisitorIdentifier(body.visitId, "visitId"),
    action: normalizeVisitorAction(body.action),
  };
}

export function parseVisitorLeavePayload(payload: unknown, fallbackSiteKey: string): VisitorLeavePayload {
  const body = payload && typeof payload === "object" ? payload as Record<string, unknown> : {};

  return {
    siteKey: normalizeVisitorSiteKey(body.siteKey, fallbackSiteKey),
    visitId: normalizeVisitorIdentifier(body.visitId, "visitId"),
  };
}

async function cleanupStaleSessions(db: D1Database, siteKey: string, now: Date = new Date()): Promise<string> {
  const staleCutoff = buildStaleCutoff(now);

  await db.prepare(
    `
      UPDATE visitor_sessions
      SET active = 0,
          left_at = COALESCE(left_at, last_seen_at)
      WHERE site_key = ?
        AND active = 1
        AND last_seen_at < ?
    `,
  ).bind(siteKey, staleCutoff).run();

  return staleCutoff;
}

export async function getVisitorStats(db: D1Database, siteKey: string, now: Date = new Date()): Promise<VisitorStats> {
  const normalizedSiteKey = normalizeVisitorSiteKey(siteKey);
  const staleCutoff = await cleanupStaleSessions(db, normalizedSiteKey, now);
  const visitsRow = await db.prepare(
    "SELECT COUNT(*) AS count FROM visitor_sessions WHERE site_key = ?",
  ).bind(normalizedSiteKey).first<{ count: number | string }>();
  const uniqueVisitorsRow = await db.prepare(
    "SELECT COUNT(*) AS count FROM visitor_identities WHERE site_key = ?",
  ).bind(normalizedSiteKey).first<{ count: number | string }>();
  const onSiteRow = await db.prepare(
    `
      SELECT COUNT(*) AS count
      FROM visitor_sessions
      WHERE site_key = ?
        AND active = 1
        AND last_seen_at >= ?
    `,
  ).bind(normalizedSiteKey, staleCutoff).first<{ count: number | string }>();

  return {
    visits: readCount(visitsRow),
    uniqueVisitors: readCount(uniqueVisitorsRow),
    onSite: readCount(onSiteRow),
  };
}

export async function trackVisitor(db: D1Database, payload: VisitorTrackPayload, now: Date = new Date()): Promise<VisitorStats> {
  const normalizedSiteKey = normalizeVisitorSiteKey(payload.siteKey);
  const nowIso = toIsoTimestamp(now);

  await cleanupStaleSessions(db, normalizedSiteKey, now);
  await db.prepare(
    `
      INSERT OR IGNORE INTO visitor_identities (
        site_key,
        visitor_id,
        first_seen_at
      )
      VALUES (?, ?, ?)
    `,
  ).bind(normalizedSiteKey, payload.visitorId, nowIso).run();
  await db.prepare(
    `
      INSERT INTO visitor_sessions (
        visit_id,
        site_key,
        visitor_id,
        active,
        first_seen_at,
        last_seen_at,
        left_at
      )
      VALUES (?, ?, ?, 1, ?, ?, NULL)
      ON CONFLICT(visit_id) DO UPDATE SET
        site_key = excluded.site_key,
        visitor_id = excluded.visitor_id,
        active = 1,
        last_seen_at = excluded.last_seen_at,
        left_at = NULL
    `,
  ).bind(
    payload.visitId,
    normalizedSiteKey,
    payload.visitorId,
    nowIso,
    nowIso,
  ).run();

  return getVisitorStats(db, normalizedSiteKey, now);
}

export async function leaveVisitor(db: D1Database, payload: VisitorLeavePayload, now: Date = new Date()): Promise<VisitorStats> {
  const normalizedSiteKey = normalizeVisitorSiteKey(payload.siteKey);
  const nowIso = toIsoTimestamp(now);

  await db.prepare(
    `
      UPDATE visitor_sessions
      SET active = 0,
          left_at = ?,
          last_seen_at = ?
      WHERE site_key = ?
        AND visit_id = ?
    `,
  ).bind(nowIso, nowIso, normalizedSiteKey, payload.visitId).run();

  return getVisitorStats(db, normalizedSiteKey, now);
}
