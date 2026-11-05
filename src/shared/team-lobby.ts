import type { Match, MatchOpts } from './match.ts';
import { setAscLobby } from './ascension.ts';

export function configureTeamLobby(m: Match, id: string, bots: MatchOpts['difficulty'][], opts: Partial<MatchOpts>, setup: { manual: boolean; shuffle: boolean } | null): boolean {
  if (!['lobby', 'end'].includes(m.phase) || m.mode === 'campaign' || m.mode === 'ascension') return false;
  const owner = m.lobby?.owner ?? m.players.find(p => !p.bot && p.connected && !p.watch)?.id;
  if (owner !== id) return false;
  m.lobby ??= { owner: id, bots: [], opts: {} };
  const previous = m.lobby.teams;
  if (!setAscLobby(m, id, bots, opts)) return false;
  if (setup) {
    m.teamCreator ??= id;
    m.teamChoices ??= {};
    const count = opts.teams ?? m.opts.teams;
    m.lobby.teams = { ...setup, botTeams: bots.map((_, i) => {
      const team = previous?.botTeams[i];
      return team !== undefined && team !== null && team < count ? team : null;
    }) };
    for (const p of m.players) if (p.team !== null && p.team >= count) p.team = null;
    for (const [id, team] of Object.entries(m.teamChoices)) if (team !== null && team >= count) m.teamChoices[id] = null;
  } else {
    delete m.lobby.teams;
    delete m.teamChoices;
    delete m.teamCreator;
    for (const p of m.players) p.team = null;
  }
  return true;
}

export function chooseLobbyTeam(m: Match, id: string, team: number | null, bot?: number): boolean {
  const L = m.lobby, p = m.players.find(p => p.id === id);
  if (!L?.teams?.manual || !['lobby', 'end'].includes(m.phase) || !p?.connected || p.bot || p.watch) return false;
  if (team !== null && (!Number.isInteger(team) || team < 0 || team >= (L.opts.teams ?? m.opts.teams))) return false;
  if (bot !== undefined) {
    if (L.owner !== id || !Number.isInteger(bot) || bot < 0 || bot >= L.bots.length) return false;
    L.teams.botTeams[bot] = team;
  } else {
    p.team = team;
    (m.teamChoices ??= {})[id] = team;
  }
  return true;
}
