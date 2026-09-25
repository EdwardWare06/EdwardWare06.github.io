/*
 Small WebGL2 helper layer: program compilation with useful errors, render
 targets with float fallback, and a shared fullscreen quad.
*/

export function createContext(canvas) {
  const gl = canvas.getContext('webgl2', {
    alpha: false,
    antialias: false,
    depth: false,
    stencil: false,
    premultipliedAlpha: false,
    preserveDrawingBuffer: false,
    powerPreference: 'high-performance',
    desynchronized: true,
  });
  if (!gl) throw new Error('WebGL2 unavailable');

  const caps = {
    floatTargets: !!gl.getExtension('EXT_color_buffer_float'),
    floatBlend: !!gl.getExtension('EXT_float_blend'),
    linearFloat: !!gl.getExtension('OES_texture_float_linear'),
  };
  return { gl, caps };
}

function compile(gl, type, source, label) {
  const sh = gl.createShader(type);
  gl.shaderSource(sh, source);
  gl.compileShader(sh);
  if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(sh);
    gl.deleteShader(sh);
    throw new Error(`${label} shader failed to compile:\n${log}`);
  }
  return sh;
}

export function createProgram(gl, vsSource, fsSource, label = 'program') {
  const vs = compile(gl, gl.VERTEX_SHADER, vsSource, `${label} vertex`);
  const fs = compile(gl, gl.FRAGMENT_SHADER, fsSource, `${label} fragment`);
  const prog = gl.createProgram();
  gl.attachShader(prog, vs);
  gl.attachShader(prog, fs);
  gl.linkProgram(prog);
  gl.deleteShader(vs);
  gl.deleteShader(fs);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
    const log = gl.getProgramInfoLog(prog);
    gl.deleteProgram(prog);
    throw new Error(`${label} failed to link:\n${log}`);
  }
  return prog;
}

// Uniform locations are looked up once and cached; the render loop never calls
// getUniformLocation.
export function getUniforms(gl, prog) {
  const out = {};
  const count = gl.getProgramParameter(prog, gl.ACTIVE_UNIFORMS);
  for (let i = 0; i < count; i++) {
    const info = gl.getActiveUniform(prog, i);
    const name = info.name.replace(/\[0\]$/, '');
    out[name] = gl.getUniformLocation(prog, name);
  }
  return out;
}

export class RenderTarget {
  constructor(gl, caps, { float = true, linear = true, name = 'rt' } = {}) {
    this.gl = gl;
    this.name = name;
    this.useFloat = float && caps.floatTargets;
    this.linear = linear && (!this.useFloat || caps.linearFloat);
    this.width = 0;
    this.height = 0;

    this.tex = gl.createTexture();
    this.fb = gl.createFramebuffer();
  }

  resize(width, height) {
    width = Math.max(1, width | 0);
    height = Math.max(1, height | 0);
    if (width === this.width && height === this.height) return;

    const gl = this.gl;
    this.width = width;
    this.height = height;

    gl.bindTexture(gl.TEXTURE_2D, this.tex);
    const internal = this.useFloat ? gl.RGBA16F : gl.RGBA8;
    const type = this.useFloat ? gl.HALF_FLOAT : gl.UNSIGNED_BYTE;
    gl.texImage2D(gl.TEXTURE_2D, 0, internal, width, height, 0, gl.RGBA, type, null);
    const filter = this.linear ? gl.LINEAR : gl.NEAREST;
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, filter);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, filter);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

    gl.bindFramebuffer(gl.FRAMEBUFFER, this.fb);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, this.tex, 0);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  }

  bind({ clear = false } = {}) {
    const gl = this.gl;
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.fb);
    gl.viewport(0, 0, this.width, this.height);
    if (clear) {
      gl.clearColor(0, 0, 0, 1);
      gl.clear(gl.COLOR_BUFFER_BIT);
    }
  }

  dispose() {
    this.gl.deleteTexture(this.tex);
    this.gl.deleteFramebuffer(this.fb);
  }
}

// One quad reused by every screen space pass.
export function createFullscreenQuad(gl) {
  const vao = gl.createVertexArray();
  const buf = gl.createBuffer();
  gl.bindVertexArray(vao);
  gl.bindBuffer(gl.ARRAY_BUFFER, buf);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([
    -1, -1, 3, -1, -1, 3,
  ]), gl.STATIC_DRAW);
  gl.enableVertexAttribArray(0);
  gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
  gl.bindVertexArray(null);
  return {
    vao,
    draw() {
      gl.bindVertexArray(vao);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    },
  };
}

export const QUAD_VS = `#version 300 es
layout(location = 0) in vec2 aPos;
out vec2 vUv;
void main() {
  vUv = aPos * 0.5 + 0.5;
  gl_Position = vec4(aPos, 0.0, 1.0);
}`;
