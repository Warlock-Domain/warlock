export const FORUM_ORG = 'Warlock-Domain';
export const FORUM_NAME_MAX = 24;

// admin: the org role 'admin' at sign-in (today only Fernando, the single Owner); confirms sound-lab winners
export type ForumUser = { id: string; login: string; name: string; avatar: string; tester?: true; admin?: true };
// How this deployment signs people in: GitHub on localhost and live, a tester button only on PR environments (one OAuth callback
// URL cannot cover every pr-<n> host; Fernando, 25/10), 'off' when the GitHub secrets are missing (a fresh local checkout)
export type ForumLogin = 'github' | 'tester' | 'off';
export type ForumMe = { user: ForumUser | null; login: ForumLogin };

// Trust boundary of POST /api/forum/tester: a JSON object with a string `name`, 1 to FORUM_NAME_MAX characters after trimming.
export function parseTesterName(raw: string): string | null {
  let m: unknown;
  try {
    m = JSON.parse(raw);
  } catch {
    return null;
  }
  if (typeof m !== 'object' || m === null || !('name' in m) || typeof m.name !== 'string') return null;
  const name = m.name.trim();
  return name && name.length <= FORUM_NAME_MAX ? name : null;
}
