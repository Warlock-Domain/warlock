import { DurableObject } from 'cloudflare:workers';
import { FORUM_KEEP, type ForumNote } from '../shared/forum.ts';

// One named instance ('forum') holds all forum data in SQLite; later steps add tables here.
export class Forum extends DurableObject<Env> {
  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    ctx.storage.sql.exec('CREATE TABLE IF NOT EXISTS notes (id INTEGER PRIMARY KEY AUTOINCREMENT, text TEXT NOT NULL, at INTEGER NOT NULL)');
  }

  list(): ForumNote[] {
    return this.ctx.storage.sql.exec<ForumNote>('SELECT id, text, at FROM notes ORDER BY id DESC').toArray();
  }

  add(text: string): ForumNote {
    const sql = this.ctx.storage.sql;
    const note = sql.exec<ForumNote>('INSERT INTO notes (text, at) VALUES (?, ?) RETURNING id, text, at', text, Date.now()).one();
    sql.exec('DELETE FROM notes WHERE id <= ?', note.id - FORUM_KEEP);
    return note;
  }
}
