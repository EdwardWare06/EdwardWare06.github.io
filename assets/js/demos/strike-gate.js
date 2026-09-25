// Lightning demo safety gate: at most one strike per `gap` seconds of scene time, whatever starts it
// (the storm's own schedule, its bursts, cursor arcs or a click), so the flashes stay under two per second.
export function gateStrikes(emit, gap = 0.51) {
  let last = -Infinity;
  return opts => {
    if (opts.time - last < gap) return false;
    last = opts.time;
    emit(opts);
    return true;
  };
}
