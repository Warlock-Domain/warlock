import { expect, it } from 'vitest';
import { addPlayer, newMatch, startMatch, removePlayer, resume } from '../src/shared/match.ts';
import { configureTeamLobby, chooseLobbyTeam } from '../src/shared/team-lobby.ts';
import { parseClientMessage, publicRoom } from '../src/shared/protocol.ts';
import { parseServerMessage } from '../src/client/net-message.ts';
import { toPlaying, until } from './helpers.ts';

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
