import type { Match, MatchOpts, Mode } from './match.ts';
import { setAscLobby, type AscLobby } from './ascension.ts';

// The server and the lobby screen must agree: with no shared setup yet, the first connected playing human configures it.
export const lobbyOwner = (r: { lobby?: AscLobby; players: { id: string; bot: boolean; connected: boolean; watch?: boolean }[] }) =>
  r.lobby?.owner ?? r.players.find(p => !p.bot && p.connected && !p.watch)?.id;

// Only a configured Teams room is owner-started; Ascension and unconfigured rooms stay open to any human.
export const teamStartLocked = (lobby: AscLobby | undefined, id: string) => !!lobby?.teams && lobby.owner !== id;

// Votes change the running match, not the lobby; Play again promises what was played, so it replays the voted mode and shuffle.
// ponytail: manualTeams is not public, so manual -> shuffled -> fixed by votes replays as manual; publish it if that matters.
export const replayTeams = (r: { mode: Mode; teamShuffle: boolean; lobby?: AscLobby }) =>
  r.mode === 'teams' ? { manual: !!r.lobby?.teams?.manual && !r.teamShuffle, shuffle: r.teamShuffle } : null;

export function configureTeamLobby(m: Match, id: string, bots: MatchOpts['difficulty'][], opts: Partial<MatchOpts>, setup: { manual: boolean; shuffle: boolean } | null): boolean {
  if (!['lobby', 'end'].includes(m.phase) || m.mode === 'campaign' || m.mode === 'ascension') return false;
  if (lobbyOwner(m) !== id) return false;
  if (!setup) {
    // Rounds and Deathmatch have no owner: each human picks bots and options and may start, so the lock must not outlive Teams.
    delete m.lobby;
    delete m.teamChoices;
    delete m.teamCreator;
    for (const p of m.players) p.team = null;
    return true;
  }
  m.lobby ??= { owner: id, bots: [], opts: {} };
  const previous = m.lobby.teams;
  if (!setAscLobby(m, id, bots, opts)) return false;
  m.teamCreator ??= id;
  m.teamChoices ??= {};
  const count = opts.teams ?? m.opts.teams;
  m.lobby.teams = { ...setup, botTeams: bots.map((_, i) => previous?.botTeams[i] ?? null) }; // setAscLobby already dropped out-of-range teams
  for (const p of m.players) if (p.team !== null && p.team >= count) p.team = null;
  for (const [id, team] of Object.entries(m.teamChoices)) if (team !== null && team >= count) m.teamChoices[id] = null;
  return true;
}

export function chooseLobbyTeam(m: Match, id: string, team: number | null, bot?: number): boolean {
  const L = m.lobby, p = m.players.find(p => p.id === id);
  if (!L?.teams?.manual || !['lobby', 'end'].includes(m.phase) || !p?.connected || p.bot) return false;
  if (team !== null && (!Number.isInteger(team) || team < 0 || team >= (L.opts.teams ?? m.opts.teams))) return false;
  if (bot !== undefined) {
    if (L.owner !== id || !Number.isInteger(bot) || bot < 0 || bot >= L.bots.length || L.teams.botTeams[bot] === team) return false;
    L.teams.botTeams[bot] = team;
  } else {
    if (p.watch || p.team === team) return false;
    p.team = team;
    (m.teamChoices ??= {})[id] = team;
  }
  return true;
}
