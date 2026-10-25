export const FORUM_NOTE_MAX = 200;
// the endpoint is public and unauthenticated until login lands (step 2), so the table keeps only a short tail
export const FORUM_KEEP = 20;

export type ForumNote = { id: number; text: string; at: number };

// Trust boundary of POST /api/forum: only a JSON object with a non-empty string `text` gets through.
export function parseForumPost(raw: string): string | null {
  let m: unknown;
  try {
    m = JSON.parse(raw);
  } catch {
    return null;
  }
  if (typeof m !== 'object' || m === null || !('text' in m) || typeof m.text !== 'string') return null;
  const text = m.text.trim();
  return text && text.length <= FORUM_NOTE_MAX ? text : null;
}
