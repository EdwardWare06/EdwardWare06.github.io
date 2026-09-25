// Spark renderer: one instanced draw call for the whole particle pool.

import { SPARK_STRIDE } from '../sim/sparks.js';

const BYTES = SPARK_STRIDE * 4;

const VS = `#version 300 es
layout(location = 0) in vec2 aCorner;
layout(location = 1) in vec3 aPos;
layout(location = 2) in vec4 aParams;  // size, age, life, heat

uniform mat4 uMVP;
uniform vec2 uRes;
uniform float uPxScale;

out vec2 vLocal;
out float vI;

void main() {
  float size = aParams.x, age = aParams.y, life = max(aParams.z, 1e-3), heat = aParams.w;
  float n = clamp(age / life, 0.0, 1.0);

  // Sparks flare then fade fast, with a flicker so they read as embers.
  vI = heat * pow(1.0 - n, 1.7) * (0.7 + 0.3 * sin(age * 90.0 + aPos.x * 4.0));

  vec4 clip = uMVP * vec4(aPos, 1.0);
  vec2 screen = (clip.xy / clip.w * 0.5 + 0.5) * uRes;
  // Also pixel based at a 1080p reference, for the same reason as the channels.
  float px = max(1.1, size * uPxScale * 1.6) * (0.6 + 0.8 * min(vI, 1.5));

  vLocal = aCorner;
  vec2 pos = screen + aCorner * px;
  gl_Position = vec4(pos / uRes * 2.0 - 1.0, 0.0, 1.0);
}`;

const FS = `#version 300 es
precision highp float;
in vec2 vLocal;
in float vI;
uniform vec3 uCore;
uniform vec3 uHalo;
out vec4 outColor;
void main() {
  float d = length(vLocal);
  if (d > 1.0 || vI <= 0.002) discard;
  float core = pow(max(0.0, 1.0 - d), 6.0);
  float glow = pow(max(0.0, 1.0 - d), 1.6);
  outColor = vec4((uCore * core * 1.6 + uHalo * glow * 0.5) * vI, 1.0);
}`;

export class SparkRenderer {
  constructor(gl, helpers, capacity) {
    const { createProgram, getUniforms } = helpers;
    this.gl = gl;
    this.prog = createProgram(gl, VS, FS, 'sparks');
    this.u = getUniforms(gl, this.prog);

    this.cornerBuf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, this.cornerBuf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([
      -1, -1, -1, 1, 1, -1, 1, 1,
    ]), gl.STATIC_DRAW);

    this.instBuf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, this.instBuf);
    gl.bufferData(gl.ARRAY_BUFFER, capacity * BYTES, gl.DYNAMIC_DRAW);

    this.vao = gl.createVertexArray();
    gl.bindVertexArray(this.vao);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.cornerBuf);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.instBuf);
    gl.enableVertexAttribArray(1);
    gl.vertexAttribPointer(1, 3, gl.FLOAT, false, BYTES, 0);
    gl.vertexAttribDivisor(1, 1);
    gl.enableVertexAttribArray(2);
    gl.vertexAttribPointer(2, 4, gl.FLOAT, false, BYTES, 12);
    gl.vertexAttribDivisor(2, 1);
    gl.bindVertexArray(null);
  }

  draw(sparks, camera, res, palette) {
    const n = sparks.instanceCount;
    if (n === 0) return 0;

    const gl = this.gl;
    gl.bindBuffer(gl.ARRAY_BUFFER, this.instBuf);
    gl.bufferSubData(gl.ARRAY_BUFFER, 0, sparks.instances, 0, n * SPARK_STRIDE);

    gl.useProgram(this.prog);
    gl.bindVertexArray(this.vao);
    gl.uniformMatrix4fv(this.u.uMVP, false, camera.mvp);
    gl.uniform2f(this.u.uRes, res[0], res[1]);
    gl.uniform1f(this.u.uPxScale, res[1] / 1080);
    gl.uniform3fv(this.u.uCore, palette.core);
    gl.uniform3fv(this.u.uHalo, palette.halo);
    gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, n);
    return 1;
  }
}
