import { DurableObject } from 'cloudflare:workers';
import { GAME_SOUND, SOUND_UPLOADS_PER_PERSON, SOUND_UPLOADS_TOTAL, isPick, pairKey, type SoundMoment, type SoundState } from '../shared/forum-sounds.ts';
import type { ForumUser } from '../shared/forum.ts';
import type { SpellId } from '../shared/spells.ts';

// One named instance ('forum') holds all forum data in SQLite (migration v2). The sound lab (issue #366) is its first data;
// topics and posts arrive with the AI API step. Callers validate every argument first (src/shared/forum-sounds.ts).
export class Forum extends DurableObject<Env> {
  private readonly sql: SqlStorage;

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    this.sql = ctx.storage.sql;
    this.sql.exec(`
      CREATE TABLE IF NOT EXISTS sound_candidates (spell TEXT, moment TEXT, src TEXT, by_id TEXT, by_name TEXT, at INTEGER, PRIMARY KEY (spell, moment, src));
      CREATE TABLE IF NOT EXISTS sound_votes (spell TEXT, moment TEXT, user_id TEXT, src TEXT, at INTEGER, PRIMARY KEY (spell, moment, user_id));
      CREATE TABLE IF NOT EXISTS sound_winners (spell TEXT, moment TEXT, src TEXT, by_name TEXT, at INTEGER, PRIMARY KEY (spell, moment));
      CREATE TABLE IF NOT EXISTS sound_comments (id INTEGER PRIMARY KEY AUTOINCREMENT, spell TEXT, user_id TEXT, name TEXT, avatar TEXT, text TEXT, at INTEGER);
    `);
  }

  soundState(userId: string): SoundState {
    const candidates = this.sql.exec<{ spell: SpellId; moment: SoundMoment; src: string; by: string; at: number }>(
      'SELECT spell, moment, src, by_name AS by, at FROM sound_candidates ORDER BY at').toArray();
    const mine: SoundState['mine'] = {};
    for (const r of this.sql.exec<{ spell: SpellId; moment: SoundMoment; src: string }>('SELECT spell, moment, src FROM sound_votes WHERE user_id = ?', userId)) {
      mine[pairKey(r.spell, r.moment)] = r.src;
    }
    const tally: SoundState['tally'] = {};
    for (const r of this.sql.exec<{ spell: SpellId; moment: SoundMoment; src: string; n: number }>('SELECT spell, moment, src, COUNT(*) AS n FROM sound_votes GROUP BY spell, moment, src')) {
      const k = pairKey(r.spell, r.moment);
      if (k in mine) (tally[k] ??= {})[r.src] = r.n;
    }
    const winners: SoundState['winners'] = {};
    for (const r of this.sql.exec<{ spell: SpellId; moment: SoundMoment; src: string }>('SELECT spell, moment, src FROM sound_winners')) winners[pairKey(r.spell, r.moment)] = r.src;
    const comments = this.sql.exec<SoundState['comments'][number]>('SELECT id, spell, name, avatar, text, at FROM sound_comments ORDER BY id').toArray();
    return { candidates, mine, tally, winners, comments };
  }

  // 'closed': the vote has a winner; 'limit': an upload over the caps. The caps are checked here, in the same synchronous step as the
  // insert, so parallel uploads cannot all pass a count read earlier
  addCandidate(spell: SpellId, moment: SoundMoment, src: string, user: ForumUser): 'ok' | 'closed' | 'limit' {
    if (this.closed(spell, moment)) return 'closed';
    if (src.startsWith('up:')) {
      const count = (by: string, ...args: string[]) => this.sql.exec<{ n: number }>(`SELECT COUNT(*) AS n FROM sound_candidates WHERE src LIKE 'up:%'${by}`, ...args).one().n;
      if (count(' AND by_id = ?', user.id) >= SOUND_UPLOADS_PER_PERSON || count('') >= SOUND_UPLOADS_TOTAL) return 'limit';
    }
    this.sql.exec('INSERT OR IGNORE INTO sound_candidates VALUES (?, ?, ?, ?, ?, ?)', spell, moment, src, user.id, user.name, Date.now());
    return 'ok';
  }

  // false: the pair is closed or the src is not one of its options
  vote(spell: SpellId, moment: SoundMoment, src: string, userId: string): boolean {
    if (this.closed(spell, moment) || !this.isOption(spell, moment, src)) return false;
    this.sql.exec('INSERT OR REPLACE INTO sound_votes VALUES (?, ?, ?, ?, ?)', spell, moment, userId, src, Date.now());
    return true;
  }

  // src null reopens the vote
  setWinner(spell: SpellId, moment: SoundMoment, src: string | null, user: ForumUser): boolean {
    if (src === null) this.sql.exec('DELETE FROM sound_winners WHERE spell = ? AND moment = ?', spell, moment);
    else if (this.isOption(spell, moment, src)) this.sql.exec('INSERT OR REPLACE INTO sound_winners VALUES (?, ?, ?, ?, ?)', spell, moment, src, user.name, Date.now());
    else return false;
    return true;
  }

  comment(spell: SpellId, text: string, user: ForumUser) {
    this.sql.exec('INSERT INTO sound_comments (spell, user_id, name, avatar, text, at) VALUES (?, ?, ?, ?, ?, ?)', spell, user.id, user.name, user.avatar, text, Date.now());
  }

  private closed(spell: SpellId, moment: SoundMoment) {
    return this.sql.exec('SELECT 1 FROM sound_winners WHERE spell = ? AND moment = ?', spell, moment).toArray().length > 0;
  }

  private isOption(spell: SpellId, moment: SoundMoment, src: string) {
    return src === GAME_SOUND || isPick(spell, moment, src) || this.sql.exec('SELECT 1 FROM sound_candidates WHERE spell = ? AND moment = ? AND src = ?', spell, moment, src).toArray().length > 0;
  }
}
