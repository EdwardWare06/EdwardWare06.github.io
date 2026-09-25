/*
 Post chain: bright pass, separable bloom at half resolution, an afterglow
 persistence buffer that smears bolt light across frames, then a composite pass
 that adds chromatic aberration, scanline shimmer, vignette, tonemapping and
 dithering. The flash envelope drives exposure and both stylized effects at
 once so a strike reads as a single event rather than three filters.
*/
const BRIGHT_FS = `#version 300 es
precision highp float;
in vec2 vUv;
uniform sampler2D uScene;
uniform float uThreshold;
out vec4 outColor;
void main() {
  vec3 c = texture(uScene, vUv).rgb;
  float lum = dot(c, vec3(0.2126, 0.7152, 0.0722));
  float knee = max(0.0, lum - uThreshold);
  outColor = vec4(c * (knee / max(lum, 1e-4)), 1.0);
}`;

const BLUR_FS = `#version 300 es
precision highp float;
in vec2 vUv;
uniform sampler2D uSrc;
uniform vec2 uStep;      // texel step, already oriented H or V
out vec4 outColor;
void main() {
  // 9 tap gaussian using 5 linearly filtered samples.
  vec3 sum = texture(uSrc, vUv).rgb * 0.227027;
  sum += (texture(uSrc, vUv + uStep * 1.3846).rgb + texture(uSrc, vUv - uStep * 1.3846).rgb) * 0.316216;
  sum += (texture(uSrc, vUv + uStep * 3.2308).rgb + texture(uSrc, vUv - uStep * 3.2308).rgb) * 0.070270;
  outColor = vec4(sum, 1.0);
}`;

const GLOW_FS = `#version 300 es
precision highp float;
in vec2 vUv;
uniform sampler2D uPrev;
uniform sampler2D uBloom;
uniform float uDecay;
out vec4 outColor;
void main() {
  vec3 prev = texture(uPrev, vUv).rgb * uDecay;
  vec3 cur = texture(uBloom, vUv).rgb;
  outColor = vec4(max(prev, cur), 1.0);
}`;

const COMPOSITE_FS = `#version 300 es
precision highp float;
in vec2 vUv;

uniform sampler2D uScene;
uniform sampler2D uBloom;
uniform sampler2D uGlow;
uniform vec2 uRes;
uniform float uTime;
uniform float uExposure;
uniform float uBloomStrength;
uniform float uGlowStrength;
uniform float uAberration;
uniform float uScanlines;
uniform float uVignette;
uniform float uFlash;
uniform vec3 uVoidColor;

out vec4 outColor;

vec3 aces(vec3 x) {
  return clamp((x * (2.51 * x + 0.03)) / (x * (2.43 * x + 0.59) + 0.14), 0.0, 1.0);
}

void main() {
  vec2 uv = vUv;
  vec2 fromCenter = uv - 0.5;

  // Radial channel split, stronger during a flash and toward the edges.
  float ca = uAberration * (0.0018 + 0.006 * uFlash);
  vec3 scene;
  vec3 bloom;
  if (ca > 0.0) {
    vec2 off = fromCenter * ca;
    scene = vec3(
      texture(uScene, uv + off).r,
      texture(uScene, uv).g,
      texture(uScene, uv - off).b
    );
    bloom = vec3(
      texture(uBloom, uv + off * 1.6).r,
      texture(uBloom, uv).g,
      texture(uBloom, uv - off * 1.6).b
    );
  } else {
    scene = texture(uScene, uv).rgb;
    bloom = texture(uBloom, uv).rgb;
  }

  vec3 glow = texture(uGlow, uv).rgb;
  vec3 col = scene + bloom * uBloomStrength + glow * uGlowStrength;

  col *= uExposure * (1.0 + uFlash * 0.5);

  // Electric shimmer: fine scanlines plus a slow rolling band, both scaled by
  // how much light is actually in the frame.
  if (uScanlines > 0.0) {
    float lum = dot(col, vec3(0.2126, 0.7152, 0.0722));
    float gate = uScanlines * (0.35 + 0.65 * clamp(uFlash * 2.0 + lum * 0.6, 0.0, 1.0));
    float lines = sin(uv.y * uRes.y * 1.9 - uTime * 9.0) * 0.5 + 0.5;
    float band = smoothstep(0.0, 1.0, sin(uv.y * 3.1 - uTime * 0.7) * 0.5 + 0.5);
    col *= 1.0 - gate * 0.055 * lines;
    col += col * gate * 0.05 * band;
  }

  float vig = 1.0 - uVignette * dot(fromCenter, fromCenter) * 1.25;
  col *= clamp(vig, 0.0, 1.0);

  col = aces(col);
  col = max(col, uVoidColor * 0.35);

  // Dither to kill banding in the large dark areas.
  float n = fract(sin(dot(uv * uRes, vec2(12.9898, 78.233))) * 43758.5453);
  col += (n - 0.5) / 255.0;

  outColor = vec4(col, 1.0);
}`;

export class PostChain {
  constructor(gl, helpers, caps, cfg) {
    const { createProgram, getUniforms, RenderTarget, createFullscreenQuad, QUAD_VS } = helpers;
    this.gl = gl;
    this.quad = createFullscreenQuad(gl);

    this.bright = createProgram(gl, QUAD_VS, BRIGHT_FS, 'bright');
    this.brightU = getUniforms(gl, this.bright);
    this.blur = createProgram(gl, QUAD_VS, BLUR_FS, 'blur');
    this.blurU = getUniforms(gl, this.blur);
    this.glow = createProgram(gl, QUAD_VS, GLOW_FS, 'glow');
    this.glowU = getUniforms(gl, this.glow);
    this.composite = createProgram(gl, QUAD_VS, COMPOSITE_FS, 'composite');
    this.compositeU = getUniforms(gl, this.composite);

    this.scene = new RenderTarget(gl, caps, { name: 'scene' });
    this.bloomA = new RenderTarget(gl, caps, { name: 'bloomA' });
    this.bloomB = new RenderTarget(gl, caps, { name: 'bloomB' });
    this.glowA = new RenderTarget(gl, caps, { name: 'glowA' });
    this.glowB = new RenderTarget(gl, caps, { name: 'glowB' });
    this.glowCleared = false;
  }

  resize(width, height) {
    const hw = Math.max(1, width >> 1);
    const hh = Math.max(1, height >> 1);
    this.scene.resize(width, height);
    this.bloomA.resize(hw, hh);
    this.bloomB.resize(hw, hh);
    this.glowA.resize(hw, hh);
    this.glowB.resize(hw, hh);
    this.glowCleared = false;
  }

  beginScene(voidColor) {
    const gl = this.gl;
    this.scene.bind();
    gl.clearColor(voidColor[0], voidColor[1], voidColor[2], 1);
    gl.clear(gl.COLOR_BUFFER_BIT);
  }

  // Returns the number of draw calls issued.
  run(cfg, time, flash, outWidth, outHeight) {
    const gl = this.gl;
    const post = cfg.post;
    const fx = cfg.effects;
    let calls = 0;

    gl.disable(gl.BLEND);

    if (fx.bloom) {
      this.bloomA.bind();
      gl.useProgram(this.bright);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, this.scene.tex);
      gl.uniform1i(this.brightU.uScene, 0);
      gl.uniform1f(this.brightU.uThreshold, post.bloomThreshold);
      this.quad.draw();
      calls++;

      const tx = 1 / this.bloomA.width;
      const ty = 1 / this.bloomA.height;
      // One wide blur iteration by default: a second pass costs two more
      // full half-res passes per frame for a barely visible difference.
      const iterations = cfg.quality === 'high' ? 2 : 1;
      for (let i = 0; i < iterations; i++) {
        const spread = iterations === 1 ? 2.2 : 1 + i * 1.7;
        // Horizontal.
        this.bloomB.bind();
        gl.useProgram(this.blur);
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, this.bloomA.tex);
        gl.uniform1i(this.blurU.uSrc, 0);
        gl.uniform2f(this.blurU.uStep, tx * spread, 0);
        this.quad.draw();
        calls++;
        // Vertical.
        this.bloomA.bind();
        gl.bindTexture(gl.TEXTURE_2D, this.bloomB.tex);
        gl.uniform2f(this.blurU.uStep, 0, ty * spread);
        this.quad.draw();
        calls++;
      }
    } else {
      this.bloomA.bind({ clear: true });
    }

    if (fx.afterglow) {
      if (!this.glowCleared) {
        this.glowA.bind({ clear: true });
        this.glowCleared = true;
      }
      this.glowB.bind();
      gl.useProgram(this.glow);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, this.glowA.tex);
      gl.uniform1i(this.glowU.uPrev, 0);
      gl.activeTexture(gl.TEXTURE1);
      gl.bindTexture(gl.TEXTURE_2D, this.bloomA.tex);
      gl.uniform1i(this.glowU.uBloom, 1);
      gl.uniform1f(this.glowU.uDecay, post.afterglowDecay);
      this.quad.draw();
      calls++;
      const tmp = this.glowA;
      this.glowA = this.glowB;
      this.glowB = tmp;
    }

    // Composite to the default framebuffer.
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, outWidth, outHeight);
    gl.useProgram(this.composite);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.scene.tex);
    gl.uniform1i(this.compositeU.uScene, 0);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, this.bloomA.tex);
    gl.uniform1i(this.compositeU.uBloom, 1);
    gl.activeTexture(gl.TEXTURE2);
    gl.bindTexture(gl.TEXTURE_2D, this.glowA.tex);
    gl.uniform1i(this.compositeU.uGlow, 2);

    gl.uniform2f(this.compositeU.uRes, outWidth, outHeight);
    gl.uniform1f(this.compositeU.uTime, time);
    gl.uniform1f(this.compositeU.uExposure, post.exposure);
    gl.uniform1f(this.compositeU.uBloomStrength, fx.bloom ? post.bloomStrength : 0);
    gl.uniform1f(this.compositeU.uGlowStrength, fx.afterglow ? post.afterglowStrength : 0);
    gl.uniform1f(this.compositeU.uAberration, fx.aberration ? post.aberration : 0);
    gl.uniform1f(this.compositeU.uScanlines, fx.scanlines ? post.scanlineStrength : 0);
    gl.uniform1f(this.compositeU.uVignette, post.vignette);
    gl.uniform1f(this.compositeU.uFlash, flash);
    gl.uniform3fv(this.compositeU.uVoidColor, cfg.palette.void);
    this.quad.draw();
    calls++;

    return calls;
  }
}
