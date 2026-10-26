import { FORUM_NAME_MAX, FORUM_ORG, type ForumMe, type ForumUser } from '../shared/forum.ts';
import { t } from './i18n.ts';
import { soundLab } from './forum-sounds.ts';
import { el } from './icons.ts';

// Forum shell (issue #366): sign-in, the page frame and, signed in, the spell sound-effect lab (forum-sounds.ts); topics arrive later.
const root = document.getElementById('forum')!;

// ?erro= comes back from the GitHub callback (src/worker/forum-api.ts)
const ERRORS: Record<string, string> = {
  membro: t(`Só membros da organização ${FORUM_ORG} no GitHub entram no fórum. Peça um convite ao Fernando e entre de novo.`,
    `Only members of the ${FORUM_ORG} organization on GitHub can enter the forum. Ask Fernando for an invite and sign in again.`),
  estado: t('O login expirou ou começou em outra aba. Tente de novo.', 'The sign-in expired or started in another tab. Try again.'),
  github: t('O GitHub não respondeu. Tente de novo em instantes.', 'GitHub did not answer. Try again in a moment.'),
};
const params = new URLSearchParams(location.search);
const erro = params.get('erro') ?? '';
const error = Object.hasOwn(ERRORS, erro) ? ERRORS[erro] : undefined;
// a reload must not show the same error again
if (params.has('erro')) history.replaceState(null, '', location.pathname);

// ?aba= names the test tab only on localhost, like main.ts: on the live site the title never changes
const LOCAL = location.hostname === 'localhost' || location.hostname === '127.0.0.1';
const aba = LOCAL && params.get('aba');
document.title = `${aba ? `🧪 ${aba} · ` : ''}${t('Fórum', 'Forum')} · Warlock Wars`;

const avatar = (u: ForumUser) =>
  u.avatar ? el('img', { class: 'fm-avatar', src: u.avatar, alt: '', width: 32, height: 32 }) : el('span', { class: 'fm-avatar', 'aria-hidden': 'true' }, u.name[0].toUpperCase());

async function logout() {
  await fetch('/api/forum/logout', { method: 'POST' }).catch(() => null);
  await load();
}

function header(user: ForumUser | null) {
  return el('header', { class: 'fm-top' },
    el('div', { class: 'fm-top-in' },
      el('a', { class: 'fm-brand', href: '/' },
        el('img', { src: '/warlock-wars.svg', alt: '', width: 36, height: 36 }),
        el('span', {}, 'Warlock Wars'),
        el('span', { class: 'fm-brand-sub' }, t('Fórum', 'Forum'))),
      user && el('div', { class: 'fm-user' },
        avatar(user),
        el('span', { class: 'fm-user-name' }, user.name, user.tester && el('span', { class: 'fm-tag' }, t('teste', 'tester'))),
        el('button', { type: 'button', class: 'fm-btn', onclick: logout }, t('Sair', 'Sign out')))));
}

function testerForm() {
  const label = t('Seu apelido', 'Your nickname');
  const input = el('input', { class: 'fm-input', maxlength: FORUM_NAME_MAX, required: true, placeholder: label, 'aria-label': label, autocomplete: 'nickname' });
  const status = el('p', { class: 'fm-error', role: 'alert', hidden: true });
  async function submit(e: Event) {
    e.preventDefault();
    const res = await fetch('/api/forum/tester', { method: 'POST', body: JSON.stringify({ name: input.value }) }).catch(() => null);
    if (res?.ok) return load();
    status.hidden = false;
    status.textContent = res?.status === 400
      ? t(`Escreva um apelido de 1 a ${FORUM_NAME_MAX} letras.`, `Write a nickname of 1 to ${FORUM_NAME_MAX} letters.`)
      : t('Não foi possível entrar. Tente de novo.', 'Could not sign in. Try again.');
  }
  return el('form', { class: 'fm-tester', onsubmit: submit },
    el('p', { class: 'fm-note' }, t('Ambiente de teste deste PR: o login do GitHub fica desligado aqui.', 'Test environment of this PR: GitHub sign-in is off here.')),
    el('div', { class: 'fm-row' }, input, el('button', { type: 'submit', class: 'fm-btn primary' }, t('Entrar como teste', 'Sign in as tester'))),
    status);
}

function signedOut(me: ForumMe) {
  return el('section', { class: 'fm-card fm-hero' },
    el('h1', {}, t('Fórum do Warlock Wars', 'Warlock Wars forum')),
    el('p', { class: 'fm-lead' }, t('Discussões, votações e testes do jogo, para quem ajuda a construí-lo.', 'Discussions, votes and tests of the game, for the people who help build it.')),
    error && el('p', { class: 'fm-error', role: 'alert' }, error),
    me.login === 'github' && el('div', { class: 'fm-signin' },
      el('a', { class: 'fm-btn primary big', href: '/api/forum/login' }, t('Entrar com GitHub', 'Sign in with GitHub')),
      el('p', { class: 'fm-note' }, t(`Só membros da organização ${FORUM_ORG} entram. O GitHub vai pedir para ler as suas organizações (read:org), só para conferir isso; o fórum não guarda o seu token.`,
        `Only members of the ${FORUM_ORG} organization can enter. GitHub will ask to read your organizations (read:org), only to check that; the forum does not keep your token.`))),
    me.login === 'tester' && testerForm(),
    me.login === 'off' && el('p', { class: 'fm-note' }, t('O login ainda não está configurado neste servidor.', 'Sign-in is not set up on this server yet.')));
}

async function load() {
  let me: ForumMe;
  try {
    me = await (await fetch('/api/forum/me')).json();
  } catch {
    root.replaceChildren(header(null), el('main', { class: 'fm-main' },
      el('p', { class: 'fm-error', role: 'alert' }, t('Não foi possível carregar o fórum. Recarregue a página.', 'Could not load the forum. Reload the page.'))));
    return;
  }
  root.replaceChildren(header(me.user), el('main', { class: 'fm-main' }, me.user ? soundLab() : signedOut(me)));
}

void load();
