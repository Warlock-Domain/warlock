// Consume both edges: Space keyup normally recentres the game camera.
export function messageSpace() {
  let held = false;
  return (e: { code: string; type: string; repeat?: boolean }, visible: boolean, blocked: boolean) => {
    if (e.code !== 'Space') return { consume: false, advance: false };
    if (e.type === 'keyup') {
      const consume = held;
      held = false;
      return { consume, advance: false };
    }
    if (!visible || blocked) return { consume: held, advance: false };
    const advance = !held && !e.repeat;
    held = true;
    return { consume: true, advance };
  };
}
