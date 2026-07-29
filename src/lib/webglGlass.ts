const MAX_RECTS = 16;

interface Params {
  edge: number;
  refr: number;
  curve: number;
  frost: number;
  ca: number;
  alpha: number;
}

const DEFAULT_PARAMS: Params = {
  edge: 30, refr: 15, curve: 0.75, frost: 0.15, ca: 6, alpha: 0.04,
};

const BOOST = {
  refr: 2.0,
  frost: 5.0,
  ca: 1.5,
};

export interface WebGLOptics {
  strength?: number;
  curvature?: number;
  frost?: number;
  dispersion?: number;
  brightness?: number;
  sheenWidth?: number;
  depth?: number;
}

export function mapOpticsToParams(optics: WebGLOptics | undefined): Params {
  const o = optics ?? {};
  const strength = o.strength ?? 0.15;
  const frost = o.frost ?? 3;
  const dispersion = o.dispersion ?? 0.10;
  const brightness = o.brightness ?? 0.04;
  const sheenWidth = o.sheenWidth ?? 30;
  const depth = o.depth ?? 0.5;

  return {
    edge: sheenWidth * (0.5 + depth),
    refr: strength * 100 * BOOST.refr,
    curve: DEFAULT_PARAMS.curve,
    frost: frost * BOOST.frost,
    ca: dispersion * 60 * BOOST.ca,
    alpha: Math.max(0, Math.min(1, brightness)),
  };
}

let instance: WebGLGlass | null = null;

export function initWebGLGlass(optics?: WebGLOptics): WebGLGlass | null {
  const params = mapOpticsToParams(optics);
  if (instance) {
    instance.setParams(params);
    return instance;
  }
  instance = new WebGLGlass(params);
  if (!instance.gl) { instance = null; return null; }
  return instance;
}

export function getWebGLGlass() { return instance; }

export function destroyWebGLGlass() {
  instance?.destroy();
  instance = null;
}

class WebGLGlass {
  canvas: HTMLCanvasElement;
  gl: WebGLRenderingContext | null = null;
  params: Params;
  prog: WebGLProgram | null = null;
  tex: WebGLTexture | null = null;
  hasUserBg = false;
  private rectsData!: Float32Array;
  private radiusData!: Float32Array;
  private U: Record<string, WebGLUniformLocation | null> = {};
  private observer: MutationObserver | null = null;
  private resizeTimer: number | null = null;
  private animFrameId = 0;
  private lastBgCss = '';

  constructor(params?: Partial<Params>) {
    this.params = { ...DEFAULT_PARAMS, ...params };
    this.canvas = document.createElement('canvas');
    this.canvas.id = 'lg-webgl-canvas';
    this.canvas.style.cssText = 'position:fixed;inset:0;width:100%;height:100%;z-index:0;pointer-events:none';
    document.body.prepend(this.canvas);

    const gl = this.canvas.getContext('webgl', {
      antialias: true, premultipliedAlpha: false, alpha: true,
    }) || this.canvas.getContext('experimental-webgl') as WebGLRenderingContext | null;
    if (!gl) { this.canvas.remove(); return; }
    this.gl = gl;
    this.rectsData = new Float32Array(MAX_RECTS * 4);
    this.radiusData = new Float32Array(MAX_RECTS);
    this.initGL();
    this.initBg();
    this.bindEvents();
    this.refresh();
  }

  private vsSrc = `
    attribute vec2 a_position;
    varying vec2 v_uv;
    void main() {
      gl_Position = vec4(a_position, 0.0, 1.0);
      v_uv = a_position * 0.5 + 0.5;
    }
  `;

  private get fsSrc() {
    return `
      precision highp float;
      varying vec2 v_uv;
      uniform vec2  u_resolution;
      uniform int   u_rectCount;
      uniform vec4  u_rects[${MAX_RECTS}];
      uniform float u_radius[${MAX_RECTS}];
      uniform float u_edgeThickness;
      uniform float u_refractionStrength;
      uniform float u_distortionCurve;
      uniform float u_frostiness;
      uniform float u_chromaticAmount;
      uniform float u_glassAlpha;
      uniform sampler2D u_bgImage;
      uniform float u_hasUserBg;

      float sdRoundedBox(vec2 p, vec2 b, float r) {
        vec2 q = abs(p) - b + r;
        return min(max(q.x, q.y), 0.0) + length(max(q, 0.0)) - r;
      }

      vec4 sampleRect(vec2 fragCoord, vec4 rect, float radius) {
        vec2 center = rect.xy;
        vec2 halfExt = rect.zw;
        vec2 p = fragCoord - center;
        float sdf = sdRoundedBox(p, halfExt, radius);
        float distToEdge = -sdf;
        float edgeAmt = clamp(1.0 - distToEdge / max(u_edgeThickness, 1.0), 0.0, 1.0);
        float distMag = u_refractionStrength * pow(edgeAmt, u_distortionCurve);
        vec2 normDir = (length(p) > 0.001) ? normalize(-p) : vec2(0.0);

        vec4 total = vec4(0.0);
        float cnt = 0.0;
        int steps = u_frostiness > 0.5 ? 3 : 1;
        bool caActive = u_chromaticAmount > 0.001;

        for (int sx = 0; sx < 3; sx++) {
          if (sx >= steps) break;
          for (int sy = 0; sy < 3; sy++) {
            if (sy >= steps) break;
            float sMax = max(float(steps - 1), 1.0);
            vec2 frostOffset = vec2(
              (float(sx) - float(steps - 1) * 0.5) / sMax * 2.0,
              (float(sy) - float(steps - 1) * 0.5) / sMax * 2.0
            ) * max(u_frostiness, 0.05);
            vec2 sampleP = p + frostOffset;
            float sampleSdf = sdRoundedBox(sampleP, halfExt, radius);
            if (sampleSdf > 0.0) continue;
            float sampleDist = -sampleSdf;
            float sampleEdge = clamp(1.0 - sampleDist / max(u_edgeThickness, 1.0), 0.0, 1.0);
            float sampleMag = u_refractionStrength * pow(sampleEdge, u_distortionCurve);
            vec2 sampleNormDir = (length(sampleP) > 0.001) ? normalize(-sampleP) : vec2(0.0);
            vec2 sampleFragCoord = sampleP + center;

            if (caActive) {
              float rDist = max(0.0, sampleMag - u_chromaticAmount * 0.5);
              float gDist = sampleMag;
              float bDist = sampleMag + u_chromaticAmount * 0.5;
              vec2 rUv = (sampleFragCoord + sampleNormDir * rDist) / u_resolution;
              vec2 gUv = (sampleFragCoord + sampleNormDir * gDist) / u_resolution;
              vec2 bUv = (sampleFragCoord + sampleNormDir * bDist) / u_resolution;
              total.r += texture2D(u_bgImage, rUv).r;
              total.g += texture2D(u_bgImage, gUv).g;
              total.b += texture2D(u_bgImage, bUv).b;
              total.a += 1.0;
            } else {
              vec2 uv2 = (sampleFragCoord + sampleNormDir * sampleMag) / u_resolution;
              vec4 c = texture2D(u_bgImage, uv2);
              total += c;
              cnt += 1.0;
            }
          }
        }

        vec4 sampled;
        if (caActive) {
          float denom = float(steps * steps);
          sampled = vec4(total.rgb / denom, 1.0);
        } else if (cnt > 0.0) {
          sampled = total / cnt;
        } else {
          sampled = texture2D(u_bgImage, (fragCoord + normDir * distMag) / u_resolution);
        }

        vec4 tint = vec4(1.0, 1.0, 1.0, u_glassAlpha);
        vec4 finalColor = mix(sampled, tint, tint.a);
        float rimGlow = pow(edgeAmt, 3.0) * 0.3;
        finalColor.rgb += vec3(rimGlow);
        return finalColor;
      }

      void main() {
        vec2 fragCoord = v_uv * u_resolution;
        vec4 bgColor;
        if (u_hasUserBg > 0.5) {
          bgColor = texture2D(u_bgImage, v_uv);
        } else {
          bgColor = vec4(mix(vec3(0.06,0.09,0.16), vec3(0.10,0.05,0.15), v_uv.y), 1.0);
        }
        vec4 outColor = bgColor;
        bool painted = false;
        for (int i = 0; i < ${MAX_RECTS}; i++) {
          if (i >= u_rectCount) break;
          vec4 rect = u_rects[i];
          vec2 p = fragCoord - rect.xy;
          float sdf = sdRoundedBox(p, rect.zw, u_radius[i]);
          if (sdf <= 0.0 && !painted) {
            outColor = sampleRect(fragCoord, rect, u_radius[i]);
            painted = true;
          }
        }
        gl_FragColor = vec4(outColor.rgb, 1.0);
      }
    `;
  }

  private initGL() {
    const gl = this.gl!;
    const vs = this.compile(gl.VERTEX_SHADER, this.vsSrc);
    const fs = this.compile(gl.FRAGMENT_SHADER, this.fsSrc);
    if (!vs || !fs) return;
    const prog = gl.createProgram()!;
    gl.attachShader(prog, vs);
    gl.attachShader(prog, fs);
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
      console.error('[WebGLGlass] link fail:', gl.getProgramInfoLog(prog));
      return;
    }
    gl.useProgram(prog);
    this.prog = prog;

    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1,-1, 1,-1, -1,1, -1,1, 1,-1, 1,1]), gl.STATIC_DRAW);
    const aPos = gl.getAttribLocation(prog, 'a_position');
    gl.enableVertexAttribArray(aPos);
    gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0);

    const U = (name: string) => gl.getUniformLocation(prog, name);
    this.U = {
      res: U('u_resolution'), count: U('u_rectCount'),
      rects: U('u_rects'), radius: U('u_radius'),
      edge: U('u_edgeThickness'), refr: U('u_refractionStrength'),
      curve: U('u_distortionCurve'), frost: U('u_frostiness'),
      ca: U('u_chromaticAmount'), alpha: U('u_glassAlpha'),
      bg: U('u_bgImage'), hasBg: U('u_hasUserBg'),
    };
  }

  private compile(type: number, src: string) {
    const gl = this.gl!;
    const s = gl.createShader(type)!;
    gl.shaderSource(s, src);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
      console.error('[WebGLGlass] shader fail:', gl.getShaderInfoLog(s));
      return null;
    }
    return s;
  }

  private initBg() {
    const gl = this.gl!;
    this.tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, this.tex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([6, 9, 22, 255]));
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.uniform1i(this.U.bg, 0);
    gl.uniform1f(this.U.hasBg, 0);

    const observer = new MutationObserver(() => this.syncBodyBg());
    observer.observe(document.body, { attributes: true, attributeFilter: ['style'] });
    this.observer = observer;
    this.syncBodyBg();
  }

  private syncBodyBg() {
    const css = document.body.style.backgroundImage || '';
    if (css === this.lastBgCss) return;
    this.lastBgCss = css;
    const m = css.match(/url\(["']?(.+?)["']?\)/);
    if (m) this.loadBg(m[1]);
    else this.clearBg();
  }

  private loadBg(url: string) {
    const gl = this.gl;
    if (!gl) return;
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      if (!this.gl) return;
      this.gl.bindTexture(this.gl.TEXTURE_2D, this.tex);
      this.gl.pixelStorei(this.gl.UNPACK_FLIP_Y_WEBGL, true);
      this.gl.texImage2D(this.gl.TEXTURE_2D, 0, this.gl.RGBA, this.gl.RGBA, this.gl.UNSIGNED_BYTE, img);
      this.gl.pixelStorei(this.gl.UNPACK_FLIP_Y_WEBGL, false);
      this.hasUserBg = true;
      this.gl.uniform1f(this.U.hasBg, 1);
      this.refresh();
    };
    img.onerror = () => this.clearBg();
    img.src = url;
  }

  private clearBg() {
    this.hasUserBg = false;
    if (this.gl) this.gl.uniform1f(this.U.hasBg, 0);
    this.refresh();
  }

  private bindEvents() {
    window.addEventListener('scroll', () => this.refresh(), { passive: true });
    window.addEventListener('resize', () => {
      if (this.resizeTimer) clearTimeout(this.resizeTimer);
      this.resizeTimer = window.setTimeout(() => this.refresh(), 100);
    });
    const domObserver = new MutationObserver(() => this.refresh());
    domObserver.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['class', 'style'] });
  }

  private collectRects() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const ch = this.canvas.height / dpr;
    const nodes = document.querySelectorAll('.glass-element');
    let count = 0;
    for (let i = 0; i < nodes.length && count < MAX_RECTS; i++) {
      const el = nodes[i];
      const r = el.getBoundingClientRect();
      if (r.width < 1 || r.height < 1) continue;
      const cs = getComputedStyle(el);
      if (cs.display === 'none' || cs.visibility === 'hidden' || cs.opacity === '0') continue;
      if (r.bottom < -50 || r.top > ch + 50) continue;
      let parent = el.parentElement;
      let hidden = false;
      while (parent && parent !== document.body) {
        const pcs = getComputedStyle(parent);
        if (pcs.display === 'none' || pcs.visibility === 'hidden') { hidden = true; break; }
        parent = parent.parentElement;
      }
      if (hidden) continue;
      const cx = (r.left + r.width / 2) * dpr;
      const cyFromTop = (r.top + r.height / 2) * dpr;
      const cy = this.canvas.height - cyFromTop;
      const hw = (r.width / 2) * dpr;
      const hh = (r.height / 2) * dpr;
      let radius = 0;
      const br = cs.borderRadius || cs.borderTopLeftRadius || '0';
      const pxVals = br.split(/\s+/).map(p => {
        if (p.endsWith('px')) return parseFloat(p);
        if (p.endsWith('%')) return Math.min(parseFloat(p) / 100 * Math.min(r.width, r.height), Math.min(r.width, r.height));
        if (p.endsWith('rem')) return parseFloat(p) * 16;
        return 0;
      });
      radius = Math.max(...pxVals, 0) * dpr;
      const idx = count * 4;
      this.rectsData[idx] = cx;
      this.rectsData[idx + 1] = cy;
      this.rectsData[idx + 2] = hw;
      this.rectsData[idx + 3] = hh;
      this.radiusData[count] = Math.min(radius, Math.min(hw, hh));
      count++;
    }
    return count;
  }

  refresh() {
    const gl = this.gl;
    if (!gl || !this.prog) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const cssW = window.innerWidth;
    const cssH = window.innerHeight;
    const pxW = Math.floor(cssW * dpr);
    const pxH = Math.floor(cssH * dpr);
    if (this.canvas.width !== pxW) this.canvas.width = pxW;
    if (this.canvas.height !== pxH) this.canvas.height = pxH;
    if (this.canvas.style.width !== cssW + 'px') this.canvas.style.width = cssW + 'px';
    if (this.canvas.style.height !== cssH + 'px') this.canvas.style.height = cssH + 'px';
    gl.viewport(0, 0, this.canvas.width, this.canvas.height);
    const count = this.collectRects();
    gl.uniform2f(this.U.res, this.canvas.width, this.canvas.height);
    gl.uniform1i(this.U.count, count);
    gl.uniform4fv(this.U.rects, this.rectsData);
    gl.uniform1fv(this.U.radius, this.radiusData);
    gl.uniform1f(this.U.edge, this.params.edge * dpr);
    gl.uniform1f(this.U.refr, this.params.refr);
    gl.uniform1f(this.U.curve, this.params.curve);
    gl.uniform1f(this.U.frost, this.params.frost);
    gl.uniform1f(this.U.ca, this.params.ca);
    gl.uniform1f(this.U.alpha, this.params.alpha);
    gl.drawArrays(gl.TRIANGLES, 0, 6);
  }

  setParams(p: Partial<Params>) {
    Object.assign(this.params, p);
    this.refresh();
  }

  destroy() {
    this.observer?.disconnect();
    this.canvas.remove();
    if (this.gl) {
      const ext = this.gl.getExtension('WEBGL_lose_context');
      if (ext) ext.loseContext();
    }
    cancelAnimationFrame(this.animFrameId);
  }
}

export type { Params as WebGLGlassParams };
