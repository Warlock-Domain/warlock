import { describe, expect, it } from 'vitest';
import { FORUM_NOTE_MAX, parseForumPost } from '../src/shared/forum.ts';

describe('forum post', () => {
  it('accepts a trimmed text and rejects everything else', () => {
    expect(parseForumPost('{"text":"  hello "}')).toBe('hello');
    expect(parseForumPost('{"text":"   "}')).toBeNull();
    expect(parseForumPost(JSON.stringify({ text: 'x'.repeat(FORUM_NOTE_MAX + 1) }))).toBeNull();
    expect(parseForumPost(JSON.stringify({ text: 'x'.repeat(FORUM_NOTE_MAX) }))).not.toBeNull();
    for (const bad of ['not json', 'null', '[]', '{}', '{"text":5}']) expect(parseForumPost(bad)).toBeNull();
  });
});
