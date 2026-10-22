import { el, icon, iconButton, UI_ICON } from './icons.ts';
import { t } from './i18n.ts';
import { radialIndex } from './taunt-wheel.ts';

// Selecionador radial compartilhável: o mesmo índice serve ao mouse, teclado e analógico.
export function radialPicker(title: HTMLElement, labels: string[], pick: (i: number) => void, cancel: () => void, options: { inline?: boolean; hint?: string } = {}) {
  let selected: number | null = null;
  const select = (i: number | null) => {
    selected = i;
    buttons.forEach((b, j) => { b.classList.toggle('on', j === i); b.setAttribute('aria-pressed', String(j === i)); });
  };
  const buttons = labels.map((label, i) => {
    const angle = i / labels.length * Math.PI * 2;
    return el('button', { type: 'button', 'aria-pressed': 'false',
      style: `left:${50 + 41 * Math.sin(angle)}%;top:${50 - 41 * Math.cos(angle)}%`,
      onfocus: () => { if (!options.inline) select(i); }, onclick: () => { select(i); pick(i); },
    }, `${(i + 1) % 10} · ${label}`);
  });
  const point = (x: number, y: number) => {
    const r = stage.getBoundingClientRect();
    select(radialIndex((x - r.left - r.width / 2) / (r.width / 2), (y - r.top - r.height / 2) / (r.height / 2), labels.length));
  };
  const stage = el('div', { class: 'radial-stage', role: 'group', 'aria-label': title.textContent ?? '', style: `--radial-step:${360 / labels.length}deg;--radial-start:${-180 / labels.length}deg`,
    onpointermove: (e: PointerEvent) => { if (!options.inline) point(e.clientX, e.clientY); },
  }, ...buttons, iconButton(icon(UI_ICON.taunt), t('Cancelar', 'Cancel'), cancel, { class: 'radial-center' }));
  const panel = el('div', { class: `vol-panel radial-picker${options.inline ? ' radial-inline' : ''}`, hidden: !options.inline }, title, stage,
    el('small', { class: 'muted' }, options.hint ?? t('Segure o atalho, aponte e solte para falar · Esc cancela', 'Hold the shortcut, point and release to speak · Esc cancels')));
  return { panel, setLabels: (next: string[]) => buttons.forEach((b, i) => { b.textContent = `${i + 1} · ${next[i]}`; }),
    point, choose: select, reset: () => select(null), select: (x: number, y: number) => select(radialIndex(x, y, labels.length)),
    step: (n: number) => select(selected === null ? 0 : (selected + n + labels.length) % labels.length),
    confirm: () => { if (selected !== null) pick(selected); },
  };
}
