import { afterEach, expect, it, vi } from 'vitest';
import { addPlayer, castBallot, kick, newMatch, startMatch, startVote, removePlayer, resume, type Match } from '../src/shared/match.ts';
import { configureTeamLobby, chooseLobbyTeam, lobbyOwner, replayTeams, teamStartLocked } from '../src/shared/team-lobby.ts';
import { parseClientMessage, publicRoom } from '../src/shared/protocol.ts';
import { parseServerMessage } from '../src/client/net-message.ts';
import { STEP_MS, toPlaying, until } from './helpers.ts';
import ui from '../src/client/ui.ts?raw';

// the Worker runtime does not exist in Node; the refusal path only needs the base class
vi.mock('cloudflare:workers', () => ({ DurableObject: class { constructor(public ctx: unknown, public env: unknown) {} } }));
afterEach(() => vi.unstubAllGlobals());

function room() {
  const m = newMatch();
  addPlayer(m, 'owner', 'Owner');addPlayer(m, 'guest', 'Guest');
  return m;
}
const manual = { manual: true, shuffle: false };

it('only lets the creator configure the Teams lobby and bot assignments', () => {
  const m = room();
  expect(configureTeamLobby(m, 'guest', ['normal'], { teams: 4 }, manual)).toBe(false);
  expect(m.lobby).toBeUndefined();
  expect(configureTeamLobby(m, 'owner', ['normal'], { teams: 4 }, manual)).toBe(true);
  expect(chooseLobbyTeam(m, 'guest', 3, 0)).toBe(false);
  expect(chooseLobbyTeam(m, 'owner', 3, 0)).toBe(true);
  expect(m.lobby!.teams!.botTeams).toEqual([3]);
  expect(chooseLobbyTeam(m, 'owner', 0, 1)).toBe(false);
});

it('allows each connected participant to pick only their own team', () => {
  const m = room();configureTeamLobby(m, 'owner', [], { teams: 3 }, manual);
  expect(chooseLobbyTeam(m, 'guest', 2)).toBe(true);
  expect(m.players[1].team).toBe(2);expect(m.players[0].team).toBeNull();
  for (const team of [-1, 3, 4, .5]) expect(chooseLobbyTeam(m, 'guest', team)).toBe(false);
  m.players[1].watch = true;expect(chooseLobbyTeam(m, 'guest', 1)).toBe(false);
  m.players[1].watch = false;m.players[1].connected = false;expect(chooseLobbyTeam(m, 'guest', 1)).toBe(false);
});

it('preserves human and bot choices through start, rounds and saved-room resume', () => {
  const m = room();configureTeamLobby(m, 'owner', ['normal', 'normal'], { teams: 4 }, manual);
  chooseLobbyTeam(m, 'owner', 0);chooseLobbyTeam(m, 'guest', 3);
  chooseLobbyTeam(m, 'owner', 0, 0);chooseLobbyTeam(m, 'owner', 3, 1);
  expect(startMatch(m, 0, 0, 'rounds', true, () => .5)).toBe(true);
  expect(m.mode).toBe('teams');expect(m.teamShuffle).toBe(false);
  const before=m.players.map(p=>p.team);expect(before).toEqual([0,3,0,3]);
  let now=toPlaying(m,0,()=>.5);expect(m.players.map(p=>p.team)).toEqual(before);
  for(const z of m.world!.wizards)if(z.team===0)z.alive=false;
  now=until(m,now,()=>m.phase==='shop',1000,()=>.5);toPlaying(m,now,()=>.5);
  expect(m.players.map(p=>p.team)).toEqual(before);
  expect(chooseLobbyTeam(m,'guest',1)).toBe(false);
  resume(m,now);expect(m.manualTeams).toBe(true);expect(m.players.map(p=>p.team)).toEqual(before);
});

it('fills automatic slots without replacing explicit choices and rejects a single chosen team', () => {
  const m=room();configureTeamLobby(m,'owner',['normal'],{teams:3},manual);
  chooseLobbyTeam(m,'owner',2);chooseLobbyTeam(m,'guest',2);
  expect(startMatch(m,0,0,'teams',true,()=>.5)).toBe(true);
  expect(m.players.map(p=>p.team)).toEqual([2,2,0]);
  const same=room();configureTeamLobby(same,'owner',[],{teams:2},manual);
  chooseLobbyTeam(same,'owner',0);chooseLobbyTeam(same,'guest',0);
  expect(startMatch(same,0,0,'teams',false,()=>.5)).toBe(false);
});

it('clears out-of-range choices when reducing team count and preserves owner handoff', () => {
  const m=room();configureTeamLobby(m,'owner',['normal'],{teams:4},manual);
  chooseLobbyTeam(m,'guest',3);chooseLobbyTeam(m,'owner',3,0);
  configureTeamLobby(m,'owner',['normal'],{teams:2},manual);
  expect(m.players[1].team).toBeNull();expect(m.lobby!.teams!.botTeams).toEqual([null]);
  removePlayer(m,'owner');expect(m.lobby!.owner).toBe('guest');
  expect(configureTeamLobby(m,'guest',[],{teams:2},manual)).toBe(true);
});

it('keeps the random assignment option and rejects Campaign or Ascension configuration', () => {
  const m=room();configureTeamLobby(m,'owner',[],{teams:2},{manual:false,shuffle:true});
  expect(chooseLobbyTeam(m,'guest',1)).toBe(false);
  expect(startMatch(m,0,0,'teams',true,()=>.5)).toBe(true);expect(m.teamShuffle).toBe(true);
  for(const mode of ['campaign','ascension'] as const){const other=room();other.mode=mode;expect(configureTeamLobby(other,'owner',[],{},manual)).toBe(false);}
});

it('restores a reconnecting player choice and the creator control without exposing private ids', () => {
  const m=room();configureTeamLobby(m,'owner',['normal'],{teams:4},manual);
  chooseLobbyTeam(m,'owner',3);chooseLobbyTeam(m,'guest',1);chooseLobbyTeam(m,'owner',2,0);
  removePlayer(m,'owner');expect(m.lobby!.owner).toBe('guest');
  addPlayer(m,'owner','Owner');expect(m.lobby!.owner).toBe('owner');
  expect(m.players.find(p=>p.id==='owner')!.team).toBe(3);expect(m.lobby!.teams!.botTeams).toEqual([2]);
  removePlayer(m,'guest');addPlayer(m,'guest','Guest');expect(m.players.find(p=>p.id==='guest')!.team).toBe(1);
  expect(publicRoom('ABCD',m,0)).not.toHaveProperty('teamChoices');
});

it('validates the selection protocol and broadcasts the shared lobby safely', () => {
  const parse=(msg:unknown)=>parseClientMessage(JSON.stringify(msg));
  for(const team of [null,0,1,2,3])expect(parse({t:'team',team})).not.toBeNull();
  for(const msg of [{t:'team',team:4},{t:'team',team:0,target:'guest'},{t:'team',team:0,bot:7},{t:'teamSetup',bots:[],opts:{teams:4},setup:{manual:'yes',shuffle:false}}])expect(parse(msg)).toBeNull();
  const m=room();configureTeamLobby(m,'owner',['normal'],{teams:4},manual);chooseLobbyTeam(m,'guest',3);
  const r=publicRoom('ABCD',m,0);
  expect(parseServerMessage({t:'room',room:r,you:r.players[0].id})).not.toBeNull();
});

const half = () => .5;
const vote = (m: Match, kind: 'mode' | 'opt' | 'shuffle' | 'addBot' | 'end', target: string, now: number) => {
  expect(startVote(m, 'owner', kind, target, now, half)).toBe(true);
  for (const p of m.players) if (m.vote && !p.bot && p.id !== 'owner') castBallot(m, p.id, true, now, half);
  expect(m.vote).toBeNull();
};
const nextRound = (m: Match, now: number) => {
  for (const z of m.world!.wizards) if (z.team === 0) z.alive = false;
  return toPlaying(m, until(m, now + STEP_MS, () => m.phase === 'shop', 1000, half), half);
};
// what the owner's Play again sends: the voted setup, then the start
const playAgain = (m: Match, now: number) => {
  const r = publicRoom('ABCD', m, now);
  const levels = r.players.filter(p => p.bot).map(p => p.difficulty ?? r.opts.difficulty);
  if (r.lobby?.teams) expect(configureTeamLobby(m, 'owner', levels, r.opts, replayTeams(r))).toBe(true);
  return startMatch(m, now, levels.length, r.mode, r.teamShuffle, half, r.opts);
};
const started = (players = room()) => {
  configureTeamLobby(players, 'owner', ['normal'], { teams: 2 }, { manual: false, shuffle: false });
  expect(startMatch(players, 0, 0, 'teams', false, half)).toBe(true);
  return toPlaying(players, 0, half);
};

it('refuses a guest start in a configured Teams room with an error, so their loading screen is released', async () => {
  vi.stubGlobal('WebSocketRequestResponsePair', class {});
  const worker = '../src/worker/room-do.ts'; // variable path: the Worker types live in a separate tsconfig
  const { Room } = await import(/* @vite-ignore */ worker);
  const m = room();
  configureTeamLobby(m, 'owner', ['normal'], { teams: 2 }, manual);
  const door = new Room({ setWebSocketAutoResponse() {} }, {});
  door.saved = { id: 'ABCD', match: m };
  const sent: { t: string; code?: string }[] = [];
  const ws = { deserializeAttachment: () => ({ playerId: 'guest' }), send: (raw: string) => sent.push(JSON.parse(raw)) };
  await door.webSocketMessage(ws, JSON.stringify({ t: 'start', bots: 1, mode: 'teams', shuffle: true, opts: {} }));
  expect(m.phase).toBe('lobby');
  expect(sent).toEqual([expect.objectContaining({ t: 'error', code: 'bad_msg' })]);
});

it('locks the start only for non-owners of a configured Teams room, on the server and on Play again', () => {
  const m = room();
  expect(teamStartLocked(m.lobby, 'guest')).toBe(false);
  configureTeamLobby(m, 'owner', [], { teams: 2 }, manual);
  expect(teamStartLocked(m.lobby, 'guest')).toBe(true);
  expect(teamStartLocked(m.lobby, 'owner')).toBe(false);
  expect(teamStartLocked({ owner: 'ana', bots: [], opts: {} }, 'guest')).toBe(false); // Ascension stays open
  expect(ui).toContain('disabled: startLocked || (campaign');
});

it('hands off a dropped owner mid-match, so the next match can start, and gives the room back to the returning creator', () => {
  const m = room();
  const now = started(m);
  removePlayer(m, 'owner');
  expect(m.lobby!.owner).toBe('guest');
  addPlayer(m, 'owner', 'Owner');
  expect(m.lobby!.owner).toBe('owner');
  removePlayer(m, 'owner');
  expect(startVote(m, 'guest', 'end', '', now, half)).toBe(true);
  expect(m.phase).toBe('end');
  expect(teamStartLocked(m.lobby, 'guest')).toBe(false);
  expect(configureTeamLobby(m, 'guest', ['normal'], { teams: 2 }, manual)).toBe(true);
  expect(startMatch(m, now, 1, 'teams', false, half)).toBe(true);
});

it('hands off when the owner is kicked', () => {
  const m = room();
  addPlayer(m, 'third', 'Third');
  const now = started(m);
  // the bot's ✕ leaves the post alone; a vote can remove an owner who is still connected
  expect(kick(m, m.players.find(p => p.bot)!.id)).toBe(true);
  expect(m.lobby!.owner).toBe('owner');
  expect(startVote(m, 'guest', 'kick', 'owner', now, half)).toBe(true);
  expect(castBallot(m, 'third', true, now, half)).toBe(true);
  expect(m.players.some(p => p.id === 'owner')).toBe(false);
  expect(m.lobby!.owner).toBe('guest');
});

it('passes a dropped owner to a connected spectator before anyone offline', () => {
  const m = room();
  addPlayer(m, 'fan', 'Fan', false, true);
  started(m);
  removePlayer(m, 'guest');
  removePlayer(m, 'owner');
  expect(m.lobby!.owner).toBe('fan');
});

it('keeps a dropped Ascension owner in place', () => {
  const m = Object.assign(newMatch(), { mode: 'ascension' as const, lobby: { owner: null, bots: [], opts: {} } });
  addPlayer(m, 'ana', 'Ana');
  addPlayer(m, 'bia', 'Bia');
  m.phase = 'shop';
  removePlayer(m, 'ana');
  expect(m.lobby!.owner).toBe('ana');
  addPlayer(m, 'ana', 'Ana');
  expect(m.lobby!.owner).toBe('ana');
});

it('Play again repeats the voted mode, options and bots instead of the frozen lobby', () => {
  const m = room();
  let now = started(m);
  vote(m, 'mode', 'deathmatch', now);
  vote(m, 'opt', 'goal:3', now);
  vote(m, 'addBot', '', now);
  now = nextRound(m, now);
  expect(m.mode).toBe('deathmatch');
  vote(m, 'end', '', now);
  expect(playAgain(m, now)).toBe(true);
  expect(m.mode).toBe('deathmatch');
  expect(m.opts.goal).toBe(3);
  expect(m.players.filter(p => p.bot)).toHaveLength(2);
  expect(m.lobby).toBeUndefined();
});

it('Play again keeps Teams with the voted team count and shuffle', () => {
  const m = room();
  let now = started(m);
  vote(m, 'opt', 'goal:7', now);
  vote(m, 'shuffle', '', now);
  now = nextRound(m, now);
  vote(m, 'end', '', now);
  expect(playAgain(m, now)).toBe(true);
  expect(m.mode).toBe('teams');
  expect(m.opts.goal).toBe(7);
  expect(m.teamShuffle).toBe(true);
  expect(m.lobby!.opts.goal).toBe(7);
  expect(ui).toContain('if (r.lobby?.teams) act.lobby(levels, r.opts, replayTeams(r));');
});

it('replays manual selection only while the match stayed manual', () => {
  const lobby = { owner: 'owner', bots: [], opts: {}, teams: { manual: true, shuffle: false, botTeams: [] } };
  expect(replayTeams({ mode: 'teams', teamShuffle: false, lobby })).toEqual({ manual: true, shuffle: false });
  expect(replayTeams({ mode: 'teams', teamShuffle: true, lobby })).toEqual({ manual: false, shuffle: true });
  expect(replayTeams({ mode: 'rounds', teamShuffle: false, lobby })).toBeNull();
});

it('keeps manual selection owner-only before any shared setup exists', () => {
  const m = room();
  const r = publicRoom('ABCD', m, 0);
  expect(lobbyOwner(r)).toBe(r.players[0].id);
  expect(lobbyOwner(r)).not.toBe(r.players[1].id);
  expect(configureTeamLobby(m, 'guest', [], {}, manual)).toBe(false);
  expect(chooseLobbyTeam(m, 'guest', 1)).toBe(false);
  // the screen must not offer what the server refuses, nor keep a guest in manual mode
  expect(ui).toContain("locked ? () => true : isOwner ? undefined : k => k === 'manual'");
  expect(ui).toContain('manualTeams = isOwner ? manualTeams ?? L?.teams?.manual ?? false : L?.teams?.manual ?? false;');
});

it('leaving Teams removes the owner lock, so Rounds and Deathmatch work as before', () => {
  const m = room();
  configureTeamLobby(m, 'owner', ['normal'], { teams: 4 }, manual);
  chooseLobbyTeam(m, 'guest', 3);
  expect(configureTeamLobby(m, 'owner', ['normal'], { teams: 4 }, null)).toBe(true);
  expect(m.lobby).toBeUndefined();
  expect(m.teamChoices).toBeUndefined();
  expect(m.teamCreator).toBeUndefined();
  expect(m.players.map(p => p.team)).toEqual([null, null]);
  expect(publicRoom('ABCD', m, 0).lobby).toBeUndefined();
  expect(teamStartLocked(m.lobby, 'guest')).toBe(false);
  expect(startMatch(m, 0, 1, 'deathmatch', true, half, { goal: 7 })).toBe(true);
  expect(m.mode).toBe('deathmatch');
  expect(m.opts.goal).toBe(7);
  // a guest who followed the setup must not stay on Teams with Start disabled
  expect(ui).toContain('if (followedTeams && !L?.teams) mode = r.mode;');
});

it('lets a spectating creator assign bots and skips unchanged choices', () => {
  const m = room();
  configureTeamLobby(m, 'owner', ['normal'], { teams: 2 }, manual);
  m.players[0].watch = true;
  expect(chooseLobbyTeam(m, 'owner', 1, 0)).toBe(true);
  expect(chooseLobbyTeam(m, 'owner', 1, 0)).toBe(false);
  expect(chooseLobbyTeam(m, 'owner', 1)).toBe(false);
  expect(chooseLobbyTeam(m, 'guest', 1)).toBe(true);
  expect(chooseLobbyTeam(m, 'guest', 1)).toBe(false);
});
