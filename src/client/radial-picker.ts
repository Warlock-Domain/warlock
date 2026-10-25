import { el, icon, iconButton, UI_ICON } from './icons.ts';
import { t } from './i18n.ts';
import { radialIndex } from './taunt-wheel.ts';

// Choice wheel: the same index serves the mouse, the keyboard and the stick. Every slot gets its digit, since the taunt
// wheel has eight slots (TAUNT_WHEEL_SIZE) and the digit shortcut covers 1 to 8.
// `inline` embeds the wheel in a screen (Settings): it does not open over the match, does not pick on focus alone and has its own hint.
export function radialPicker(title: HTMLElement, labels: string[], pick: (i: number) => void, cancel: () => void, options: { inline?: boolean; hint?: string } = {}) {
  let selected: number | null = null;
  const select = (i: number | null) => {
    selected = i;
    buttons.forEach((b, j) => { b.classList.toggle('on', j === i); b.setAttribute('aria-pressed', String(j === i)); });
  };
  const text = (i: number, label: string) => `${i + 1} · ${label}`;
  const radius = 41;
  const buttons = labels.map((label, i) => {
    const angle = i / labels.length * Math.PI * 2;
    return el('button', { type: 'button', 'aria-pressed': 'false',
      style: `left:${50 + radius * Math.sin(angle)}%;top:${50 - radius * Math.cos(angle)}%`,
      onfocus: () => { if (!options.inline) select(i); }, onclick: () => { select(i); pick(i); },
    }, text(i, label));
  });
  const point = (x: number, y: number) => {
    const r = stage.getBoundingClientRect();
    select(radialIndex((x - r.left - r.width / 2) / (r.width / 2), (y - r.top - r.height / 2) / (r.height / 2), labels.length));
  };
  const stage = el('div', { role: 'group', 'aria-label': title.textContent ?? '', style: `--radial-step:${360 / labels.length}deg;--radial-start:${-180 / labels.length}deg`, class: 'radial-stage' },
    ...buttons, iconButton(icon(UI_ICON.taunt), t('Cancelar', 'Cancel'), cancel, { class: 'radial-center' }));
  const panel = el('div', { class: `vol-panel radial-picker${options.inline ? ' radial-inline' : ''}`, hidden: !options.inline }, title, stage,
    el('small', { class: 'muted' }, options.hint ?? t('Segure o atalho, aponte e solte para falar · Esc cancela', 'Hold the shortcut, point and release to speak · Esc cancels')));
  return { panel, point, setLabels: (next: string[]) => buttons.forEach((b, i) => { b.textContent = text(i, next[i]); }), choose: select, reset: () => select(null),
    step: (n: number) => select(selected === null ? 0 : (selected + n + labels.length) % labels.length),
    confirm: () => { if (selected !== null) pick(selected); },
  };
}
