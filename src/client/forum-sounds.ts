import {
  GAME_SOUND, SOUND_COMMENT_MAX, SOUND_UPLOAD_MAX_BYTES, SOUND_UPLOAD_MAX_S, UPLOAD_TYPES, hasMoment, pairKey, picksFor, soundKey,
  type PackEntry, type SoundMoment, type SoundState,
} from '../shared/forum-sounds.ts';
import { SPELL_IDS, type SpellId } from '../shared/spells.ts';
import { LOCALE, spellName, t } from './i18n.ts';
import { ICON, el, icon } from './icons.ts';
import { SPELL_SOUND, createSound } from './sound.ts';

// Sound lab of the forum (issue #366, docs/plans/2026-10-25-forum-sound-lab-design.md): per spell, the cast and impact candidates,
// one vote each (always open: the group reads the counts and decides, Fernando 25/10), comments, adding from the pack or uploading.
// The 3D arena loads on demand.
const API = '/api/forum/sons';
const MOMENT_NAME: Record<SoundMoment, string> = { cast: t('Lançamento', 'Cast'), hit: t('Impacto', 'Impact') };
const PACK_SHOWN = 40;

const sound = createSound(0);
const fileUrl = (src: string) => `${API}/arquivo/${soundKey(src)}`;
// the last two folders say what the sound is (Human/Avatar/Avatar → Avatar / Avatar)
const packLabel = (path: string) => path.split('/').slice(-2).join(' / ');
const seconds = (s: number) => `${s.toLocaleString(LOCALE, { maximumFractionDigits: 1 })} s`;

export function soundLab() {
  let state: SoundState | null = null;
  let pack: PackEntry[] | null = null;
  let spell: SpellId = SPELL_IDS.find((id) => location.hash === `#som/${id}`) ?? 'fireball';
  // what the arena plays for each moment: my vote until I pick another one to try
  const trying: Partial<Record<string, string>> = {};
  let lab: { reset(): void; pause(on: boolean): void } | null = null;

  const status = el('p', { class: 'fm-error', role: 'alert', hidden: true });
  const nav = el('nav', { class: 'fm-spells', 'aria-label': t('Magias', 'Spells') });
  const panel = el('div', { class: 'fm-spell-panel' });
  const home = el('div', { class: 'fm-lab-grid' }, nav, panel);
  // full screen like the game (the scene sizes itself to the window); the spell panel moves to its side while it is open
  const stage = el('div', { class: 'fm-stage' });
  const hint = el('p', { class: 'fm-arena-hint' }, t('Botão direito anda · Q ou clique esquerdo lança · S para (segure para Manter base) · Esc sai',
    'Right click walks · Q or left click casts · S stops (hold it to Hold ground) · Esc leaves'));
  const side = el('aside', { class: 'fm-arena-side', 'aria-label': t('Efeitos sonoros na arena', 'Sound effects in the arena') });
  const overlay = el('div', { class: 'fm-arena-full', role: 'dialog', 'aria-modal': 'true', 'aria-label': t('Arena de teste', 'Test arena'), hidden: true }, stage, hint, side);
  const inArena = () => !overlay.hidden;

  const fail = (text: string) => {
    status.hidden = false;
    status.textContent = text;
  };
  async function call(path: string, body: BodyInit, type = 'application/json') {
    status.hidden = true;
    const res = await fetch(`${API}${path}`, { method: 'POST', headers: { 'content-type': type }, body }).catch(() => null);
    const next: SoundState | null = res?.ok ? await res.json().catch(() => null) : null;
    if (next) return set(next);
    fail(res?.status === 409 ? t('Essa opção sumiu. Recarregue a página.', 'That option is gone. Reload the page.')
      : res?.status === 429 ? t('Você chegou ao limite de envios.', 'You reached the upload limit.')
      : res?.status === 413 ? t('O arquivo passa de 1 MB.', 'The file is over 1 MB.')
      : t('Não deu certo. Tente de novo.', 'That did not work. Try again.'));
  }
  const send = (path: string, body: object) => call(path, JSON.stringify(body));

  function set(s: SoundState) {
    state = s;
    render();
  }

  const playing = (moment: SoundMoment) => trying[pairKey(spell, moment)] ?? state?.mine[pairKey(spell, moment)] ?? GAME_SOUND;
  function listen(moment: SoundMoment, src: string) {
    if (src !== GAME_SOUND) return void sound.playUrl(fileUrl(src));
    void sound.playReady(moment === 'cast' ? SPELL_SOUND[spell] : 'hit');
  }

  // pick: the AI's rank (1 = best fit) and reason, shown under the name
  function candidateRow(moment: SoundMoment, src: string, by: string | null, pick?: { rank: number; why: string }) {
    const key = pairKey(spell, moment);
    const mine = state!.mine[key] === src;
    const votes = state!.tally[key]?.[src] ?? 0;
    const label = src === GAME_SOUND ? t('Atual do jogo', 'Current in-game') : src.startsWith('pack:') ? packLabel(src.slice(5)) : t('Arquivo enviado', 'Uploaded file');
    return el('li', { class: 'fm-cand' },
      el('button', { type: 'button', class: 'fm-btn', 'aria-label': t(`Ouvir ${label}`, `Listen to ${label}`), onclick: () => listen(moment, src) }, '▶'),
      el('span', { class: 'fm-cand-name' }, pick && el('span', { class: 'fm-rank' }, `${pick.rank}`), label, by && el('small', {}, t(` · por ${by}`, ` · by ${by}`)),
        pick && el('small', { class: 'fm-why' }, pick.why)),
      el('label', { class: 'fm-try' },
        el('input', { type: 'radio', name: `try-${key}`, checked: playing(moment) === src, onchange: () => (trying[key] = src) }),
        t('Na arena', 'In the arena')),
      el('span', { class: 'fm-votes' }, t(`${votes} ${votes === 1 ? 'voto' : 'votos'}`, `${votes} ${votes === 1 ? 'vote' : 'votes'}`)),
      el('button', { type: 'button', class: `fm-btn${mine ? ' primary' : ''}`, 'aria-pressed': String(mine), onclick: () => send('/voto', { spell, moment, src }) },
        mine ? t('Seu voto', 'Your vote') : t('Votar', 'Vote')));
  }

  async function upload(moment: SoundMoment, file: File) {
    const ext = file.name.split('.').pop()?.toLowerCase();
    const type = file.type in UPLOAD_TYPES ? file.type : ext === 'mp3' ? 'audio/mpeg' : ext === 'ogg' ? 'audio/ogg' : ext === 'wav' ? 'audio/wav' : '';
    if (!type) return fail(t('Envie um arquivo mp3, ogg ou wav.', 'Upload an mp3, ogg or wav file.'));
    if (file.size > SOUND_UPLOAD_MAX_BYTES) return fail(t('O arquivo passa de 1 MB.', 'The file is over 1 MB.'));
    // the server only checks size and type: the length is checked here, where the browser can decode the audio
    let length = Infinity;
    try {
      length = (await new OfflineAudioContext(1, 1, 44100).decodeAudioData(await file.arrayBuffer())).duration;
    } catch {
      return fail(t('Não deu para ler esse áudio.', 'Could not read that audio.'));
    }
    if (length > SOUND_UPLOAD_MAX_S) return fail(t(`O efeito sonoro passa de ${SOUND_UPLOAD_MAX_S} s.`, `The sound effect is over ${SOUND_UPLOAD_MAX_S} s.`));
    await call(`/envio?spell=${spell}&moment=${moment}`, file, type);
  }

  function adder(moment: SoundMoment) {
    const list = el('ul', { class: 'fm-pack' });
    const search = el('input', { class: 'fm-input', type: 'search', placeholder: t('Buscar no pacote (ex.: fire, frost, lightning)', 'Search the pack (e.g. fire, frost, lightning)'), 'aria-label': t('Buscar no pacote', 'Search the pack') });
    const fill = () => {
      if (!pack) return list.replaceChildren(el('li', {}, t('O pacote ainda não foi carregado neste servidor.', 'The pack is not loaded on this server yet.')));
      const words = search.value.toLowerCase().split(/\s+/).filter(Boolean);
      const found = pack.filter((p) => words.every((w) => p.path.toLowerCase().includes(w)));
      list.replaceChildren(...found.slice(0, PACK_SHOWN).map((p) => el('li', { class: 'fm-cand' },
        el('button', { type: 'button', class: 'fm-btn', 'aria-label': t(`Ouvir ${packLabel(p.path)}`, `Listen to ${packLabel(p.path)}`), onclick: () => listen(moment, `pack:${p.path}`) }, '▶'),
        el('span', { class: 'fm-cand-name', title: p.path }, packLabel(p.path), el('small', {}, ` · ${seconds(p.s)}`)),
        el('button', { type: 'button', class: 'fm-btn', onclick: () => send('/candidato', { spell, moment, src: `pack:${p.path}` }) }, t('Adicionar', 'Add')))),
        ...(found.length > PACK_SHOWN ? [el('li', { class: 'fm-note' }, t(`Mais ${found.length - PACK_SHOWN}: refine a busca.`, `${found.length - PACK_SHOWN} more: narrow the search.`))] : []));
    };
    search.addEventListener('input', fill);
    const file = el('input', { type: 'file', accept: '.mp3,.ogg,.wav,audio/mpeg,audio/ogg,audio/wav', 'aria-label': t('Enviar o seu efeito sonoro', 'Upload your sound effect'),
      onchange: () => file.files?.[0] && void upload(moment, file.files[0]).finally(() => (file.value = '')) });
    return el('details', { class: 'fm-add', ontoggle: (e: Event) => (e.target as HTMLDetailsElement).open && fill() },
      el('summary', {}, t('Adicionar do pacote ou enviar o seu', 'Add from the pack or upload your own')),
      search, list,
      el('p', { class: 'fm-note' }, t(`Ou envie o seu (mp3, ogg ou wav, até 1 MB e ${SOUND_UPLOAD_MAX_S} s): `, `Or upload your own (mp3, ogg or wav, up to 1 MB and ${SOUND_UPLOAD_MAX_S} s): `), file));
  }

  function momentBlock(moment: SoundMoment) {
    const picks = picksFor(spell, moment);
    const cands = state!.candidates.filter((c) => c.spell === spell && c.moment === moment && !picks.some((p) => p.src === c.src));
    return el('section', { class: 'fm-moment', 'aria-labelledby': `m-${moment}` },
      el('h3', { id: `m-${moment}` }, MOMENT_NAME[moment]),
      el('ul', { class: 'fm-cands' }, candidateRow(moment, GAME_SOUND, null),
        ...picks.map((p, i) => candidateRow(moment, p.src, null, { rank: i + 1, why: t(p.pt, p.en) })),
        ...cands.map((c) => candidateRow(moment, c.src, c.by))),
      picks.length > 0 && el('p', { class: 'fm-note' }, t('Os números são a ordem de encaixe sugerida pela IA (1 = melhor), pelo tempo e tipo da magia e pela duração e timbre do arquivo.',
        "The numbers are the AI's suggested fit order (1 = best), from the spell's timing and kind and the file's length and tone.")),
      adder(moment));
  }

  function comments() {
    const text = el('textarea', { class: 'fm-input', maxlength: SOUND_COMMENT_MAX, rows: 3, required: true, 'aria-label': t('Seu comentário', 'Your comment') });
    const list = state!.comments.filter((c) => c.spell === spell);
    return el('section', { class: 'fm-moment', 'aria-labelledby': 'm-com' },
      el('h3', { id: 'm-com' }, t('Comentários', 'Comments')),
      el('ul', { class: 'fm-comments' }, ...list.map((c) => el('li', {},
        el('strong', {}, c.name), el('small', {}, ` · ${new Date(c.at).toLocaleString(LOCALE, { dateStyle: 'short', timeStyle: 'short' })}`),
        el('p', {}, c.text)))),
      el('form', { class: 'fm-row', onsubmit: (e: Event) => (e.preventDefault(), void send('/comentario', { spell, text: text.value })) },
        text, el('button', { type: 'submit', class: 'fm-btn primary' }, t('Comentar', 'Comment'))));
  }

  function openArena() {
    overlay.hidden = false;
    side.append(panel);
    if (lab) {
      lab.reset();
      lab.pause(false);
    } else {
      stage.replaceChildren(el('p', { class: 'fm-arena-hint' }, t('Carregando a arena…', 'Loading the arena…')));
      void import('./sound-lab.ts').then((m) => {
        stage.replaceChildren();
        lab = m.openLab(stage, { spell: () => spell, play: (moment) => listen(moment, playing(moment)) });
      }, () => stage.replaceChildren(el('p', { class: 'fm-error' }, t('Não deu para carregar a arena. Recarregue a página.', 'Could not load the arena. Reload the page.'))));
    }
    render();
  }
  function closeArena() {
    overlay.hidden = true;
    lab?.pause(true);
    home.append(panel);
    render();
  }
  addEventListener('keydown', (e) => e.code === 'Escape' && inArena() && closeArena());

  function render() {
    if (!state) return;
    const done = (id: SpellId) => (['cast', 'hit'] as const).filter((m) => hasMoment(id, m)).every((m) => pairKey(id, m) in state!.mine);
    nav.replaceChildren(...SPELL_IDS.map((id) => el('a', { href: `#som/${id}`, class: 'fm-spell', 'aria-current': id === spell ? 'true' : undefined },
      icon(ICON[id]), el('span', {}, spellName(id)), done(id) && el('small', { class: 'fm-done' }, t('votada', 'voted')))));
    panel.replaceChildren(
      el('h2', {}, icon(ICON[spell]), spellName(spell)),
      el('div', { class: 'fm-row' }, inArena()
        ? el('button', { type: 'button', class: 'fm-btn', onclick: closeArena }, t('Sair da arena', 'Leave the arena'))
        : el('button', { type: 'button', class: 'fm-btn primary', onclick: openArena }, t('Testar na arena', 'Try it in the arena'))),
      momentBlock('cast'),
      hasMoment(spell, 'hit') ? momentBlock('hit') : el('p', { class: 'fm-note' }, t('Esta magia não causa dano: só o lançamento tem efeito sonoro.', 'This spell deals no damage: only the cast has a sound effect.')),
      comments());
  }

  addEventListener('hashchange', () => {
    const id = SPELL_IDS.find((s) => location.hash === `#som/${s}`);
    if (id) spell = id;
    render();
  });

  void (async () => {
    const [s, p] = await Promise.all([
      fetch(API).then((r) => (r.ok ? r.json() : null), () => null),
      fetch(`${API}/arquivo/pack/index.json`).then((r) => (r.ok ? r.json() : null), () => null),
    ]);
    pack = p;
    if (s) set(s);
    else fail(t('Não deu para carregar a votação. Recarregue a página.', 'Could not load the vote. Reload the page.'));
  })();

  return el('section', { class: 'fm-card fm-lab' },
    el('h1', {}, t('Efeitos sonoros das magias', 'Spell sound effects')),
    el('p', { class: 'fm-lead' }, t('Escolha uma magia, teste na arena e vote no melhor efeito sonoro de lançamento e de impacto.',
      'Pick a spell, try it in the arena and vote for the best cast and impact sound effect.')),
    status,
    home, overlay);
}
