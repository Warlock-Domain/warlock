import { el, icon, iconButton, UI_ICON } from './icons.ts';
import { t } from './i18n.ts';
import { radialIndex } from './taunt-wheel.ts';

// Roda de escolha: o mesmo índice serve ao mouse, ao teclado e ao analógico. Só as 10 primeiras posições
// levam número, porque o atalho de dígitos vai de 1 a 9 e 0.
// `inline` embute a roda numa tela (Configurações): não abre sobre a partida, não escolhe só por foco e leva a dica própria.
export function radialPicker(title: HTMLElement, labels: string[], pick: (i: number) => void, cancel: () => void, options: { inline?: boolean; hint?: string } = {}) {
  let selected: number | null = null;
  const select = (i: number | null) => {
    selected = i;
    buttons.forEach((b, j) => { b.classList.toggle('on', j === i); b.setAttribute('aria-pressed', String(j === i)); });
  };
  const text = (i: number, label: string) => (i < 10 ? `${(i + 1) % 10} · ${label}` : label);
  // Up to 15 entries keep the original ring (41%, 14% buttons). With more, the ring widens to 44% (button edge stays inside
  // the stage) and buttons shrink to the chord between neighbouring centres minus a 2.5% gap, so click targets do not overlap.
  const crowded = labels.length > 15;
  const radius = crowded ? 44 : 41;
  const width = Math.min(14, 2 * radius * Math.sin(Math.PI / labels.length) - 2.5);
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
  const stage = el('div', { role: 'group', 'aria-label': title.textContent ?? '', style: `--radial-step:${360 / labels.length}deg;--radial-start:${-180 / labels.length}deg;--radial-w:${width}%`, class: crowded ? 'radial-stage radial-crowded' : 'radial-stage' },
    ...buttons, iconButton(icon(UI_ICON.taunt), t('Cancelar', 'Cancel'), cancel, { class: 'radial-center' }));
  const panel = el('div', { class: `vol-panel radial-picker${options.inline ? ' radial-inline' : ''}`, hidden: !options.inline }, title, stage,
    el('small', { class: 'muted' }, options.hint ?? t('Segure o atalho, aponte e solte para falar · Esc cancela', 'Hold the shortcut, point and release to speak · Esc cancels')));
  return { panel, point, setLabels: (next: string[]) => buttons.forEach((b, i) => { b.textContent = text(i, next[i]); }), choose: select, reset: () => select(null),
    step: (n: number) => select(selected === null ? 0 : (selected + n + labels.length) % labels.length),
    confirm: () => { if (selected !== null) pick(selected); },
  };
}
