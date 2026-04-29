import type {
  StoryArticlePayload,
  StoryArticleRecord,
  StoryArticleStatus,
  StoryMediaPayload,
  StoryMediaRecord,
} from "../types";

const MAX_TITLE_LENGTH = 140;
const MAX_SUBTITLE_LENGTH = 260;
const MAX_DESCRIPTION_LENGTH = 420;
const MAX_BODY_LENGTH = 60000;
const MAX_FILENAME_LENGTH = 180;
const MAX_MEDIA_BYTES = 3 * 1024 * 1024;
const ALLOWED_MEDIA_TYPES = new Set(["image/gif", "image/jpeg", "image/png", "image/webp"]);

function nowIso(): string {
  return new Date().toISOString();
}

function normalizeOwnerUsername(ownerUsername: string): string {
  return ownerUsername.trim();
}

function normalizeOptionalText(value: unknown, maxLength: number): string | undefined {
  const normalized = String(value ?? "").trim();
  return normalized ? normalized.slice(0, maxLength) : undefined;
}

function normalizeRequiredText(value: unknown, fieldName: string, maxLength: number): string {
  const normalized = normalizeOptionalText(value, maxLength);

  if (!normalized) {
    throw new Error(`${fieldName} is required.`);
  }

  return normalized;
}

function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/['"]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

function normalizeStoryStatus(value: unknown): StoryArticleStatus {
  return String(value ?? "").trim().toLowerCase() === "published" ? "published" : "draft";
}

function normalizeStorySlug(value: unknown, title: string): string {
  const rawSlug = normalizeOptionalText(value, 120);
  const slug = slugify(rawSlug || title);

  if (!slug) {
    throw new Error("slug could not be generated.");
  }

  return slug;
}

function normalizeHeroMediaId(value: unknown): number | null {
  if (value == null || value === "") {
    return null;
  }

  const id = Number(value);
  return Number.isFinite(id) && id > 0 ? Math.trunc(id) : null;
}

function parseDataUrl(value: unknown): { contentType: string; bytes: number } {
  const dataUrl = String(value ?? "").trim();
  const match = /^data:([^;,]+);base64,([A-Za-z0-9+/=]+)$/i.exec(dataUrl);

  if (!match) {
    throw new Error("Upload must be a base64 data URL.");
  }

  const contentType = match[1].toLowerCase();

  if (!ALLOWED_MEDIA_TYPES.has(contentType)) {
    throw new Error("Only PNG, JPG, WebP, and GIF uploads are supported.");
  }

  const bytes = Math.floor((match[2].replace(/=+$/, "").length * 3) / 4);

  if (bytes > MAX_MEDIA_BYTES) {
    throw new Error("Upload is too large. Keep images and GIFs under 3 MB.");
  }

  return { contentType, bytes };
}

function mapStoryRow(row: StoryArticleRow): StoryArticleRecord {
  const heroMedia = row.hero_media_id
    ? {
      id: row.hero_media_id,
      filename: row.hero_filename || "",
      contentType: row.hero_content_type || "",
      alt: row.hero_alt || undefined,
      sizeBytes: Number(row.hero_size_bytes || 0),
      createdAt: row.hero_created_at || "",
      url: `/api/story-media/${row.hero_media_id}`,
    }
    : undefined;

  return {
    id: row.id,
    ownerUsername: row.owner_username,
    slug: row.slug,
    title: row.title,
    subtitle: row.subtitle || undefined,
    description: row.description || undefined,
    bodyMarkdown: row.body_markdown,
    status: row.status === "published" ? "published" : "draft",
    heroMediaId: row.hero_media_id || undefined,
    heroMedia,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    publishedAt: row.published_at || undefined,
  };
}

type StoryArticleRow = {
  id: number;
  owner_username: string;
  slug: string;
  title: string;
  subtitle: string | null;
  description: string | null;
  body_markdown: string;
  status: string;
  hero_media_id: number | null;
  created_at: string;
  updated_at: string;
  published_at: string | null;
  hero_filename: string | null;
  hero_content_type: string | null;
  hero_alt: string | null;
  hero_size_bytes: number | null;
  hero_created_at: string | null;
};

const STORY_SELECT = `
  SELECT
    story_articles.id,
    story_articles.owner_username,
    story_articles.slug,
    story_articles.title,
    story_articles.subtitle,
    story_articles.description,
    story_articles.body_markdown,
    story_articles.status,
    story_articles.hero_media_id,
    story_articles.created_at,
    story_articles.updated_at,
    story_articles.published_at,
    story_media.filename AS hero_filename,
    story_media.content_type AS hero_content_type,
    story_media.alt AS hero_alt,
    story_media.size_bytes AS hero_size_bytes,
    story_media.created_at AS hero_created_at
  FROM story_articles
  LEFT JOIN story_media ON story_media.id = story_articles.hero_media_id
`;

export function parseStoryArticlePayload(payload: unknown): StoryArticlePayload {
  const body = payload && typeof payload === "object" ? payload as Record<string, unknown> : {};
  const title = normalizeRequiredText(body.title, "title", MAX_TITLE_LENGTH);
  const bodyMarkdown = normalizeRequiredText(body.bodyMarkdown, "bodyMarkdown", MAX_BODY_LENGTH);
  const status = normalizeStoryStatus(body.status);

  return {
    title,
    slug: normalizeStorySlug(body.slug, title),
    subtitle: normalizeOptionalText(body.subtitle, MAX_SUBTITLE_LENGTH),
    description: normalizeOptionalText(body.description, MAX_DESCRIPTION_LENGTH),
    bodyMarkdown,
    status,
    heroMediaId: normalizeHeroMediaId(body.heroMediaId),
  };
}

export function parseStoryMediaPayload(payload: unknown): StoryMediaPayload {
  const body = payload && typeof payload === "object" ? payload as Record<string, unknown> : {};
  const filename = normalizeRequiredText(body.filename, "filename", MAX_FILENAME_LENGTH)
    .replace(/[\\/:*?"<>|]+/g, "-");
  const { contentType, bytes } = parseDataUrl(body.dataUrl);

  return {
    filename,
    contentType,
    dataUrl: String((body as Record<string, unknown>).dataUrl).trim(),
    sizeBytes: bytes,
    alt: normalizeOptionalText(body.alt, MAX_DESCRIPTION_LENGTH),
  };
}

export async function insertStoryMedia(
  db: D1Database,
  ownerUsername: string,
  payload: StoryMediaPayload,
): Promise<StoryMediaRecord> {
  const createdAt = nowIso();
  const owner = normalizeOwnerUsername(ownerUsername);
  const result = await db
    .prepare(
      `INSERT INTO story_media (
         owner_username,
         filename,
         content_type,
         data_url,
         size_bytes,
         alt,
         created_at
       ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)`,
    )
    .bind(owner, payload.filename, payload.contentType, payload.dataUrl, payload.sizeBytes, payload.alt ?? null, createdAt)
    .run();
  const id = Number(result.meta?.last_row_id || 0);

  return {
    id,
    ownerUsername: owner,
    filename: payload.filename,
    contentType: payload.contentType,
    dataUrl: payload.dataUrl,
    sizeBytes: payload.sizeBytes,
    alt: payload.alt,
    createdAt,
  };
}

export async function getStoryMedia(db: D1Database, id: number): Promise<StoryMediaRecord | null> {
  const row = await db
    .prepare(
      `SELECT id, owner_username, filename, content_type, data_url, size_bytes, alt, created_at
       FROM story_media
       WHERE id = ?1`,
    )
    .bind(id)
    .first<{
      id: number;
      owner_username: string;
      filename: string;
      content_type: string;
      data_url: string;
      size_bytes: number;
      alt: string | null;
      created_at: string;
    }>();

  if (!row) {
    return null;
  }

  return {
    id: row.id,
    ownerUsername: row.owner_username,
    filename: row.filename,
    contentType: row.content_type,
    dataUrl: row.data_url,
    sizeBytes: Number(row.size_bytes || 0),
    alt: row.alt ?? undefined,
    createdAt: row.created_at,
  };
}

export async function listPublishedStories(db: D1Database): Promise<StoryArticleRecord[]> {
  const result = await db
    .prepare(
      `${STORY_SELECT}
       WHERE story_articles.status = 'published'
       ORDER BY story_articles.published_at DESC, story_articles.updated_at DESC, story_articles.id DESC`,
    )
    .all<StoryArticleRow>();

  return result.results.map(mapStoryRow);
}

export async function listStoriesForOwner(db: D1Database, ownerUsername: string): Promise<StoryArticleRecord[]> {
  const owner = normalizeOwnerUsername(ownerUsername);
  const result = await db
    .prepare(
      `${STORY_SELECT}
       WHERE story_articles.owner_username = ?1
       ORDER BY story_articles.updated_at DESC, story_articles.id DESC`,
    )
    .bind(owner)
    .all<StoryArticleRow>();

  return result.results.map(mapStoryRow);
}

export async function getPublishedStoryBySlug(db: D1Database, slug: string): Promise<StoryArticleRecord | null> {
  const row = await db
    .prepare(
      `${STORY_SELECT}
       WHERE story_articles.slug = ?1
         AND story_articles.status = 'published'
       LIMIT 1`,
    )
    .bind(slugify(slug))
    .first<StoryArticleRow>();

  return row ? mapStoryRow(row) : null;
}

export async function insertStoryArticle(
  db: D1Database,
  ownerUsername: string,
  payload: StoryArticlePayload,
): Promise<StoryArticleRecord> {
  const now = nowIso();
  const owner = normalizeOwnerUsername(ownerUsername);
  const publishedAt = payload.status === "published" ? now : null;
  const result = await db
    .prepare(
      `INSERT INTO story_articles (
         owner_username,
         slug,
         title,
         subtitle,
         description,
         body_markdown,
         status,
         hero_media_id,
         created_at,
         updated_at,
         published_at
       ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?9, ?10)`,
    )
    .bind(
      owner,
      payload.slug,
      payload.title,
      payload.subtitle ?? null,
      payload.description ?? null,
      payload.bodyMarkdown,
      payload.status,
      payload.heroMediaId ?? null,
      now,
      publishedAt,
    )
    .run();
  const id = Number(result.meta?.last_row_id || 0);
  const created = await getStoryArticleForOwner(db, id, owner);

  if (!created) {
    throw new Error("Story was created but could not be reloaded.");
  }

  return created;
}

export async function getStoryArticleForOwner(
  db: D1Database,
  id: number,
  ownerUsername: string,
): Promise<StoryArticleRecord | null> {
  const owner = normalizeOwnerUsername(ownerUsername);
  const row = await db
    .prepare(
      `${STORY_SELECT}
       WHERE story_articles.id = ?1
         AND story_articles.owner_username = ?2
       LIMIT 1`,
    )
    .bind(id, owner)
    .first<StoryArticleRow>();

  return row ? mapStoryRow(row) : null;
}

export async function updateStoryArticle(
  db: D1Database,
  id: number,
  ownerUsername: string,
  payload: StoryArticlePayload,
): Promise<StoryArticleRecord | null> {
  const owner = normalizeOwnerUsername(ownerUsername);
  const existing = await getStoryArticleForOwner(db, id, owner);

  if (!existing) {
    return null;
  }

  const now = nowIso();
  const publishedAt = payload.status === "published"
    ? existing.publishedAt || now
    : null;

  await db
    .prepare(
      `UPDATE story_articles
       SET slug = ?3,
           title = ?4,
           subtitle = ?5,
           description = ?6,
           body_markdown = ?7,
           status = ?8,
           hero_media_id = ?9,
           updated_at = ?10,
           published_at = ?11
       WHERE id = ?1 AND owner_username = ?2`,
    )
    .bind(
      id,
      owner,
      payload.slug,
      payload.title,
      payload.subtitle ?? null,
      payload.description ?? null,
      payload.bodyMarkdown,
      payload.status,
      payload.heroMediaId ?? null,
      now,
      publishedAt,
    )
    .run();

  return getStoryArticleForOwner(db, id, owner);
}

export async function deleteStoryArticle(db: D1Database, id: number, ownerUsername: string): Promise<boolean> {
  const owner = normalizeOwnerUsername(ownerUsername);
  const result = await db
    .prepare("DELETE FROM story_articles WHERE id = ?1 AND owner_username = ?2")
    .bind(id, owner)
    .run();

  return Number(result.meta?.changes || 0) > 0;
}

export function decodeMediaDataUrl(media: StoryMediaRecord): { body: Uint8Array; contentType: string } {
  const match = /^data:([^;,]+);base64,([A-Za-z0-9+/=]+)$/i.exec(media.dataUrl);

  if (!match) {
    throw new Error("Stored media is invalid.");
  }

  const binary = atob(match[2]);
  const body = Uint8Array.from(binary, (char) => char.charCodeAt(0));
  return {
    body,
    contentType: media.contentType || match[1],
  };
}
