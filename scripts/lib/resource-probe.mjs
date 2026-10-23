// Instrumentação só no navegador de teste; WeakRef evita manter vivos os objetos que estamos medindo.
export function installResourceProbe({ mutation }) {
  let nextId = 0;
  const ids = new WeakMap();
  const id = (object) => { if (!ids.has(object)) ids.set(object, ++nextId); return ids.get(object); };
  const gpu = {};
  for (const [kind, suffix] of [['textures', 'Texture'], ['buffers', 'Buffer']]) {
    const active = new Set();
    gpu[kind] = { created: 0, deleted: 0, active };
    for (const Type of [WebGLRenderingContext, WebGL2RenderingContext]) {
      const create = Type.prototype[`create${suffix}`], remove = Type.prototype[`delete${suffix}`];
      Type.prototype[`create${suffix}`] = function (...args) {
        const resource = create.apply(this, args);
        if (resource) { active.add(id(resource)); gpu[kind].created++; }
        return resource;
      };
      Type.prototype[`delete${suffix}`] = function (resource) {
        if (resource && active.delete(id(resource))) gpu[kind].deleted++;
        return remove.call(this, resource);
      };
    }
  }
  const listeners = new Map();
  const add = EventTarget.prototype.addEventListener, remove = EventTarget.prototype.removeEventListener;
  const tracked = (target) => target === document || target instanceof MediaQueryList;
  const listenerKey = (target, type, fn, options) => `${id(target)}:${type}:${id(fn)}:${typeof options === 'boolean' ? options : !!options?.capture}`;
  EventTarget.prototype.addEventListener = function (type, fn, options) {
    if (fn && tracked(this)) listeners.set(listenerKey(this, type, fn, options), { target: new WeakRef(this), fn: new WeakRef(fn), type });
    return add.call(this, type, fn, options);
  };
  EventTarget.prototype.removeEventListener = function (type, fn, options) {
    if (mutation === 'connection-listener' && this === document && type === 'visibilitychange') return;
    if (fn && tracked(this)) listeners.delete(listenerKey(this, type, fn, options));
    return remove.call(this, type, fn, options);
  };
  const timers = new Map();
  for (const [set, clear, repeat] of [['setTimeout', 'clearTimeout', false], ['setInterval', 'clearInterval', true]]) {
    const originalSet = window[set], originalClear = window[clear];
    window[set] = (fn, delay, ...args) => {
      const timer = originalSet(() => { if (!repeat) timers.delete(timer); fn(...args); }, delay);
      timers.set(timer, repeat ? 'interval' : 'timeout');
      return timer;
    };
    window[clear] = (timer) => { timers.delete(timer); return originalClear(timer); };
  }
  const rafs = new Set();
  const request = window.requestAnimationFrame, cancel = window.cancelAnimationFrame;
  window.requestAnimationFrame = (fn) => {
    const frame = request((now) => { rafs.delete(frame); fn(now); });
    rafs.add(frame); return frame;
  };
  window.cancelAnimationFrame = (frame) => { rafs.delete(frame); cancel(frame); };
  const observers = new Map();
  let observerCallbacks = 0;
  for (const name of ['IntersectionObserver', 'ResizeObserver']) {
    const Native = window[name];
    window[name] = class extends Native {
      constructor(fn, options) {
        super((...args) => { observerCallbacks++; fn(...args); }, options);
        observers.set(id(this), { ref: new WeakRef(this), targets: new Map() });
      }
      observe(target, options) { observers.get(id(this)).targets.set(id(target), new WeakRef(target)); return super.observe(target, options); }
      unobserve(target) { observers.get(id(this)).targets.delete(id(target)); return super.unobserve(target); }
      disconnect() { observers.get(id(this)).targets.clear(); return super.disconnect(); }
    };
  }
  const renderers = new Map();
  let mixerUpdates = 0, renders = 0;
  window.resourceProbe = {
    attachThree(THREE) {
      window.resourceThree = THREE;
      const render = THREE.WebGLRenderer.prototype.render, update = THREE.AnimationMixer.prototype.update;
      THREE.WebGLRenderer.prototype.render = function (...args) { renders++; renderers.set(id(this), new WeakRef(this)); return render.apply(this, args); };
      THREE.AnimationMixer.prototype.update = function (...args) { mixerUpdates++; return update.apply(this, args); };
      if (mutation === 'skeleton-dispose') THREE.Skeleton.prototype.dispose = function () {};
    },
    sample() {
      for (const [key, record] of listeners) if (!record.target.deref() || !record.fn.deref()) listeners.delete(key);
      for (const [key, record] of observers) {
        if (!record.ref.deref()) { observers.delete(key); continue; }
        for (const [target, ref] of record.targets) if (!ref.deref()) record.targets.delete(target);
      }
      const rendererMemory = [];
      for (const [key, ref] of renderers) {
        const renderer = ref.deref();
        if (!renderer) { renderers.delete(key); continue; }
        rendererMemory.push({ id: key, ...renderer.info.memory, programs: renderer.info.programs.length });
      }
      return {
        gpu: Object.fromEntries(Object.entries(gpu).map(([key, value]) => [key, { created: value.created, deleted: value.deleted, active: value.active.size }])),
        listeners: listeners.size, visibilityListeners: [...listeners.values()].filter((r) => r.type === 'visibilitychange').length,
        observers: [...observers.values()].filter((r) => r.targets.size).length,
        observedTargets: [...observers.values()].reduce((n, r) => n + r.targets.size, 0),
        intervals: [...timers.values()].filter((kind) => kind === 'interval').length,
        timeouts: [...timers.values()].filter((kind) => kind === 'timeout').length,
        rafs: rafs.size, renders, mixerUpdates, observerCallbacks, rendererMemory,
      };
    },
  };
}
