// The stage's forms. Ids match the shader's `field()` and `colF()` branches.
export const FORM = { ATTRACTOR: 0, NEBULA: 1, BLACK_HOLE: 2, PULSAR: 3, GALAXY: 4, PLANET: 5, SINGULARITY: 6 };
export const FORM_NAMES = ['Attractor', 'Nebula', 'Black hole', 'Pulsar', 'Galaxy', 'Storm planet', 'Singularity'];
// ys = yaw speed (rad/s), p = pitch (rad), d = camera distance
export const CAMERA = [
  { ys: 0.13, p: 0.42, d: 5 }, { ys: 0.035, p: 0.55, d: 5.2 }, { ys: 0.03, p: 0.17, d: 5.1 },
  { ys: 0.06, p: 0.36, d: 5.3 }, { ys: 0.05, p: 0.85, d: 5.4 }, { ys: 0, p: 0.28, d: 5.3 }, { ys: 0, p: 0.3, d: 5 }
];
// fraction of the previous frame kept in the trail buffer
export const TRAIL_FADE = [0.6, 0.955, 0.78, 0.84, 0.8, 0.8, 0.7];
// comet cursor tail colour per form
export const TAIL_RGB = ['150,215,255', '124,196,255', '255,170,90', '175,160,255', '255,228,190', '140,195,255', '220,235,255'];
// Home: hero, Hunt, Voice Recorder, Lightning Background, About, Contact
export const HOME_MAPPING = [FORM.GALAXY, FORM.BLACK_HOLE, FORM.PULSAR, FORM.PLANET, FORM.ATTRACTOR, FORM.NEBULA];

const BY_NAME = { attractor: 0, nebula: 1, 'black-hole': 2, pulsar: 3, galaxy: 4, 'storm-planet': 5, singularity: 6 };
export function formFromName(name) {
  if (!(name in BY_NAME)) throw new Error(`unknown stage form "${name}"`);
  return BY_NAME[name];
}
