/* 
Fixed isometric camera: orthographic projection with no perspective divide,
 which is what makes the scene read as a true isometric projection rather than
 a wide angle 3D shot. A very slow yaw drift keeps it from feeling like a still.
*/

import * as mat4 from './mat4.js';

const DEG = Math.PI / 180;

export class IsoCamera {
  constructor(cfg) {
    this.cfg = cfg;
    this.view = new Float32Array(16);
    this.proj = new Float32Array(16);
    this.mvp = new Float32Array(16);

    this.eye = [0, 0, 0];
    this.right = [1, 0, 0];
    this.up = [0, 1, 0];
    this.forward = [0, 0, -1];

    this.halfW = 1;
    this.halfH = 1;
    this.aspect = 1;
    this.yaw = cfg.yaw;
  }

  resize(width, height) {
    this.aspect = width / Math.max(1, height);
  }

  update(time) {
    const cfg = this.cfg;
    this.yaw = cfg.yaw + Math.sin(time * cfg.driftSpeed) * cfg.driftDegrees;

    const pitch = cfg.pitch * DEG;
    const yaw = this.yaw * DEG;
    const cp = Math.cos(pitch);

    // Unit vector from the target toward the camera.
    const dx = cp * Math.sin(yaw);
    const dy = Math.sin(pitch);
    const dz = cp * Math.cos(yaw);

    const target = cfg.target;
    const dist = cfg.distance;
    this.eye[0] = target[0] + dx * dist;
    this.eye[1] = target[1] + dy * dist;
    this.eye[2] = target[2] + dz * dist;

    mat4.lookAt(this.view, this.eye, target, [0, 1, 0]);

    this.halfH = cfg.halfHeight;
    this.halfW = cfg.halfHeight * this.aspect;
    mat4.ortho(this.proj, this.halfW, this.halfH, 1, dist * 4);
    mat4.multiply(this.mvp, this.proj, this.view);

    // Basis vectors pulled back out of the view matrix for ray casting.
    this.right[0] = this.view[0]; this.right[1] = this.view[4]; this.right[2] = this.view[8];
    this.up[0] = this.view[1]; this.up[1] = this.view[5]; this.up[2] = this.view[9];
    this.forward[0] = -this.view[2]; this.forward[1] = -this.view[6]; this.forward[2] = -this.view[10];
  }

  // Normalized device coords (-1..1) to the point where that pixel's ray meets
  // the ground plane. Used for cursor reactive strikes.
  screenToGround(nx, ny, out) {
    const ox = this.eye[0] + this.right[0] * nx * this.halfW + this.up[0] * ny * this.halfH;
    const oy = this.eye[1] + this.right[1] * nx * this.halfW + this.up[1] * ny * this.halfH;
    const oz = this.eye[2] + this.right[2] * nx * this.halfW + this.up[2] * ny * this.halfH;

    const dy = this.forward[1];
    if (Math.abs(dy) < 1e-5) {
      out[0] = ox; out[1] = oz;
      return out;
    }
    const t = -oy / dy;
    out[0] = ox + this.forward[0] * t;
    out[1] = oz + this.forward[2] * t;
    return out;
  }
}
