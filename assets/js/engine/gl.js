// Small WebGL2 helpers for the stage.
export function createContext(canvas) {
  const gl = canvas.getContext('webgl2', { antialias: false, alpha: false, powerPreference: 'high-performance' });
  if (!gl || !gl.getExtension('EXT_color_buffer_float')) return null;
  gl.bindVertexArray(gl.createVertexArray()); // all draws use gl_VertexID, no attributes
  return gl;
}

export function stageSupported() {
  const gl = createContext(document.createElement('canvas'));
  if (!gl) return false;
  gl.getExtension('WEBGL_lose_context')?.loseContext();
  return true;
}

// Compile and link without asking for the result: asking forces the driver to finish at once.
function shader(gl, type, src) {
  const s = gl.createShader(type);
  gl.shaderSource(s, src);
  gl.compileShader(s);
  return s;
}

export function program(gl, vs, fs) {
  const p = gl.createProgram();
  gl.attachShader(p, shader(gl, gl.VERTEX_SHADER, vs));
  gl.attachShader(p, shader(gl, gl.FRAGMENT_SHADER, fs));
  gl.linkProgram(p);
  const cache = {};
  const u = new Proxy(cache, { get: (o, k) => (k in o ? o[k] : (o[k] = gl.getUniformLocation(p, k))) });
  return { p, u };
}

// With KHR_parallel_shader_compile the driver compiles in the background; this asks without waiting.
export function programsDone(gl, progs, ext) {
  return !ext || progs.every(({ p }) => gl.getProgramParameter(p, ext.COMPLETION_STATUS_KHR));
}

export function checkLinked(gl, progs) {
  for (const { p } of progs) {
    if (gl.getProgramParameter(p, gl.LINK_STATUS)) continue;
    const logs = gl.getAttachedShaders(p).map(s => gl.getShaderInfoLog(s)).filter(Boolean);
    throw new Error([gl.getProgramInfoLog(p), ...logs].filter(Boolean).join('\n') || 'shader link failed');
  }
}

export function texture(gl, w, h, { internal, format, type, data = null, filter }) {
  const t = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, t);
  gl.texImage2D(gl.TEXTURE_2D, 0, internal, w, h, 0, format, type, data);
  const f = filter || gl.NEAREST;
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, f);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, f === gl.NEAREST ? gl.NEAREST : gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  return t;
}

export function framebuffer(gl, textures) {
  const f = gl.createFramebuffer();
  gl.bindFramebuffer(gl.FRAMEBUFFER, f);
  textures.forEach((t, i) => gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0 + i, gl.TEXTURE_2D, t, 0));
  gl.drawBuffers(textures.map((_, i) => gl.COLOR_ATTACHMENT0 + i));
  return f;
}

// Half-float trail buffer with a mip chain (the display pass samples mips for bloom).
export function accumulation(gl, w, h) {
  const t = texture(gl, w, h, { internal: gl.RGBA16F, format: gl.RGBA, type: gl.HALF_FLOAT, filter: gl.LINEAR });
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
  gl.generateMipmap(gl.TEXTURE_2D);
  const f = framebuffer(gl, [t]);
  gl.clearColor(0, 0, 0, 0);
  gl.clear(gl.COLOR_BUFFER_BIT);
  return { t, f };
}

export function freeTarget(gl, target) {
  if (!target) return;
  gl.deleteTexture(target.t);
  gl.deleteFramebuffer(target.f);
}
