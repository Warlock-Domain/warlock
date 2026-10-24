import { FORUM_NOTE_MAX, type ForumNote } from '../shared/forum.ts';
import { t } from './i18n.ts';
import { el } from './icons.ts';

// Skeleton page (step 1 of issue #366): proves the page, the worker route and the storage round-trip.
const list = el('ul');
const input = el('input', { maxlength: FORUM_NOTE_MAX, placeholder: t('Registro de teste', 'Test record') });
const status = el('p');

async function refresh() {
  try {
    const notes: ForumNote[] = await (await fetch('/api/forum')).json();
    list.replaceChildren(...notes.map((n) => el('li', {}, n.text)));
    status.textContent = '';
  } catch {
    status.textContent = t('Não foi possível carregar.', 'Could not load.');
  }
}

async function send(e: Event) {
  e.preventDefault();
  const res = await fetch('/api/forum', { method: 'POST', body: JSON.stringify({ text: input.value }) });
  status.textContent = res.ok ? '' : t('Registro recusado.', 'Record rejected.');
  if (res.ok) input.value = '';
  await refresh();
}

const aba = new URLSearchParams(location.search).get('aba');
document.title = `${aba ? `🧪 ${aba} · ` : ''}${t('Fórum', 'Forum')} · Warlock Wars`;
document.getElementById('forum')!.append(
  el('h1', {}, t('Fórum de testes', 'Test forum')),
  el('form', { onsubmit: send }, input, el('button', {}, t('Gravar', 'Save'))),
  status,
  list,
);
void refresh();
