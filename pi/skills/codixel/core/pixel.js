"use strict";

const P = {};

P.clamp = (v, a = 0, b = 1) => (v < a ? a : v > b ? b : v);
P.lerp = (a, b, u) => a + (b - a) * u;
P.ease = {
  io: (u) => (u < 0.5 ? 4 * u * u * u : 1 - Math.pow(-2 * u + 2, 3) / 2),
  out: (u) => (u >= 1 ? 1 : 1 - Math.pow(2, -10 * u)),
  in: (u) => (u <= 0 ? 0 : Math.pow(2, 10 * u - 10)),
  sine: (u) => 0.5 - 0.5 * Math.cos(Math.PI * u),
  quad: (u) => 1 - (1 - u) * (1 - u),
};

P.rgb = (r, g, b) => ((0xff000000 | (b << 16) | (g << 8) | r) >>> 0);
P.col = (c) => (typeof c === "number" ? c : P.rgb(c[0] | 0, c[1] | 0, c[2] | 0));
P.mix = (a, b, u) => {
  u = P.clamp(u);
  return [a[0] + (b[0] - a[0]) * u, a[1] + (b[1] - a[1]) * u, a[2] + (b[2] - a[2]) * u];
};
P.ramp = (cols, u) => {
  u = P.clamp(u) * (cols.length - 1);
  const i = Math.min(cols.length - 2, Math.floor(u));
  return P.mix(cols[i], cols[i + 1], u - i);
};
P.palette = (cols, n) => Array.from({ length: n }, (_, i) => P.col(P.ramp(cols, i / (n - 1))));

P.BT = new Float32Array([0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map((v) => (v + 0.5) / 16));
P.bt = (x, y) => P.BT[((y & 3) << 2) | (x & 3)];
P.ditherIndex = (v, n, x, y, width = 0.35) => {
  v = P.clamp(v, 0, 0.9999) * (n - 1);
  let k = Math.floor(v);
  const f = v - k;
  if ((f - (1 - width)) / width > P.bt(x, y)) k++;
  return Math.min(n - 1, k);
};

P.rng = (seed) => {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};

P.hash = (a, b, s = 0) => {
  let h = Math.imul(a | 0, 374761393) + Math.imul(b | 0, 668265263) + Math.imul(s | 0, 2246822519);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
};
P.noise = (x, y, s = 0) => {
  const ix = Math.floor(x), iy = Math.floor(y), fx = x - ix, fy = y - iy;
  const sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy);
  const a = P.hash(ix, iy, s), b = P.hash(ix + 1, iy, s), c = P.hash(ix, iy + 1, s), d = P.hash(ix + 1, iy + 1, s);
  return a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy;
};
P.fbm = (x, y, oct = 4, s = 0) => {
  let v = 0, amp = 0.5, f = 1, sum = 0;
  for (let i = 0; i < oct; i++) {
    v += P.noise(x * f, y * f, s + i * 17) * amp;
    sum += amp;
    amp *= 0.5;
    f *= 2;
  }
  return v / sum;
};

class Buf {
  constructor(w, h) {
    this.w = w;
    this.h = h;
    this.px = new Uint32Array(w * h);
    this.ox = 0;
    this.oy = 0;
  }

  clear(c = 0) {
    this.px.fill(c ? P.col(c) : 0);
  }

  put(i, c) {
    this.px[i] = c;
  }

  get(x, y) {
    x = Math.round(x) - this.ox;
    y = Math.round(y) - this.oy;
    return x < 0 || y < 0 || x >= this.w || y >= this.h ? 0 : this.px[y * this.w + x];
  }

  pset(x, y, c) {
    x = Math.round(x) - this.ox;
    y = Math.round(y) - this.oy;
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) return;
    this.put(y * this.w + x, P.col(c));
  }

  rect(x0, y0, x1, y1, c) {
    c = P.col(c);
    const a = Math.max(Math.round(x0) - this.ox, 0), b = Math.min(Math.round(x1) - this.ox, this.w);
    const p = Math.max(Math.round(y0) - this.oy, 0), q = Math.min(Math.round(y1) - this.oy, this.h);
    for (let y = p; y < q; y++) for (let x = a; x < b; x++) this.put(y * this.w + x, c);
  }

  blob(cx, cy, r, color, dens = 1, edge = 0, sy = 1) {
    if (r <= 0 || dens <= 0) return;
    const c = P.col(color), R = r * (1 + edge);
    const x0 = Math.max(Math.floor(cx - R) - 1, this.ox), x1 = Math.min(Math.ceil(cx + R) + 1, this.ox + this.w - 1);
    const y0 = Math.max(Math.floor(cy - R * sy) - 1, this.oy), y1 = Math.min(Math.ceil(cy + R * sy) + 1, this.oy + this.h - 1);
    const span = R - r + 1e-6, lim = R * R;
    for (let y = y0; y <= y1; y++) {
      const dy = (y + 0.5 - cy) / sy, dy2 = dy * dy;
      if (dy2 > lim) continue;
      for (let x = x0; x <= x1; x++) {
        const dx = x + 0.5 - cx, q = dx * dx + dy2;
        if (q > lim) continue;
        const d = Math.sqrt(q);
        const den = edge > 0 ? dens * P.clamp((R - d) / span) : d <= r ? dens : 0;
        if (P.bt(x, y) < den) this.put((y - this.oy) * this.w + x - this.ox, c);
      }
    }
  }

  ring(cx, cy, r, width, color, dens = 1, sy = 1) {
    if (dens <= 0) return;
    const c = P.col(color), R = r + width;
    const x0 = Math.max(Math.floor(cx - R) - 1, this.ox), x1 = Math.min(Math.ceil(cx + R) + 1, this.ox + this.w - 1);
    const y0 = Math.max(Math.floor(cy - R * sy) - 1, this.oy), y1 = Math.min(Math.ceil(cy + R * sy) + 1, this.oy + this.h - 1);
    for (let y = y0; y <= y1; y++) {
      const dy = (y + 0.5 - cy) / sy;
      for (let x = x0; x <= x1; x++) {
        const dx = x + 0.5 - cx, d = Math.sqrt(dx * dx + dy * dy);
        if (d >= r && d <= R && P.bt(x, y) < dens) this.put((y - this.oy) * this.w + x - this.ox, c);
      }
    }
  }

  line(x0, y0, x1, y1, color, width = 1) {
    const c = P.col(color), n = Math.max(1, Math.ceil(Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0)))), h = (width - 1) / 2;
    for (let i = 0; i <= n; i++) {
      const x = x0 + ((x1 - x0) * i) / n, y = y0 + ((y1 - y0) * i) / n;
      if (width <= 1) this.pset(x, y, c);
      else this.rect(x - h, y - h, x + h + 1, y + h + 1, c);
    }
  }

  poly(pts, color) {
    const c = P.col(color);
    let y0 = Infinity, y1 = -Infinity;
    for (const p of pts) {
      y0 = Math.min(y0, p[1]);
      y1 = Math.max(y1, p[1]);
    }
    y0 = Math.max(Math.floor(y0), this.oy);
    y1 = Math.min(Math.ceil(y1), this.oy + this.h - 1);
    const xs = [];
    for (let y = y0; y <= y1; y++) {
      const sy = y + 0.5;
      xs.length = 0;
      for (let i = 0; i < pts.length; i++) {
        const a = pts[i], b = pts[(i + 1) % pts.length];
        if ((a[1] <= sy && b[1] > sy) || (b[1] <= sy && a[1] > sy)) xs.push(a[0] + ((sy - a[1]) / (b[1] - a[1])) * (b[0] - a[0]));
      }
      xs.sort((p, q) => p - q);
      for (let i = 0; i + 1 < xs.length; i += 2) this.rect(Math.round(xs[i]), y, Math.round(xs[i + 1]) + 1, y + 1, c);
    }
  }

  sprite(s, x, y, flip = false) {
    for (let j = 0; j < s.h; j++)
      for (let i = 0; i < s.w; i++) {
        const c = s.px[j * s.w + (flip ? s.w - 1 - i : i)];
        if (c >>> 24) this.pset(x + i, y + j, c);
      }
  }

  field(fn, pal, width = 0.35) {
    const n = pal.length;
    for (let y = 0; y < this.h; y++)
      for (let x = 0; x < this.w; x++) {
        const wx = x + this.ox, wy = y + this.oy, v = fn(wx, wy);
        if (v == null || v <= 0) continue;
        this.put(y * this.w + x, pal[P.ditherIndex(v, n, wx, wy, width)]);
      }
  }

  dither(k, color) {
    if (k <= 0.02) return;
    const c = P.col(color);
    for (let y = 0; y < this.h; y++)
      for (let x = 0; x < this.w; x++) if (P.bt(x + this.ox, y + this.oy) < k) this.px[y * this.w + x] = c;
  }

  scaled(n) {
    const o = new Buf(this.w * n, this.h * n);
    for (let y = 0; y < o.h; y++) for (let x = 0; x < o.w; x++) o.px[y * o.w + x] = this.px[((y / n) | 0) * this.w + ((x / n) | 0)];
    return o;
  }

  rgba() {
    return new Uint8Array(this.px.buffer.slice(0));
  }
}
P.Buf = Buf;

P.unpack = (c) => [c & 255, (c >>> 8) & 255, (c >>> 16) & 255];

P.volley = (t0, n, opt = {}) => {
  const r = P.rng(opt.seed ?? 1), W = opt.w ?? 240, H = opt.h ?? 135, warn = opt.warn ?? 0.7, life = opt.life ?? 0.45;
  const [w0, w1] = opt.width ?? [5, 9], safe = opt.safe, out = [];
  for (let tries = 0; out.length < n && tries < 4000; tries++) {
    const a = r() * Math.PI, x = 10 + r() * (W - 20), y = 20 + r() * (H - 40), w = w0 + r() * (w1 - w0);
    if (safe && Math.abs((safe[0] - x) * Math.sin(a) - (safe[1] - y) * Math.cos(a)) < safe[2] + w) continue;
    const ts = t0 + (opt.stagger ?? 0) * out.length;
    out.push({ x, y, a, w, warn: ts, fire: ts + warn, end: ts + warn + life });
  }
  return out;
};

P.beams = (buf, list, t, cols = [[255, 255, 255], [255, 255, 255]]) => {
  const W = buf.w, H = buf.h, light = new Float32Array(W * H);
  let glow = 0, any = false;
  for (const b of list) {
    if (t < b.warn || t >= b.end + 0.2) continue;
    const ca = Math.cos(b.a), sa = Math.sin(b.a);
    if (t < b.fire) {
      const k = (t - b.warn) / (b.fire - b.warn);
      if (!(Math.floor(t * 14) % 2 === 0 || k > 0.75)) continue;
      for (let y = 0; y < H; y++)
        for (let x = 0; x < W; x++) {
          const wx = x + buf.ox, wy = y + buf.oy, d = Math.abs((wx - b.x) * sa - (wy - b.y) * ca);
          const along = (wx - b.x) * ca + (wy - b.y) * sa;
          if (d < 0.6 && (Math.floor(along / 3) % 2 === 0 || k > 0.6)) buf.put(y * W + x, P.col(P.mix(P.unpack(buf.px[y * W + x]), cols[cols.length - 1], 0.45 + 0.45 * k)));
        }
      continue;
    }
    any = true;
    const f = t - b.fire, life = b.end - b.fire;
    const grow = 1 - Math.pow(1 - Math.min(f / 0.05, 1), 3);
    const shrink = Math.max(0, 1 - Math.pow(Math.max(0, (f - life * 0.55) / (life * 0.45 + 0.2)), 2));
    for (let y = 0; y < H; y++)
      for (let x = 0; x < W; x++) {
        const wx = x + buf.ox, wy = y + buf.oy, d = Math.abs((wx - b.x) * sa - (wy - b.y) * ca);
        const along = (wx - b.x) * ca + (wy - b.y) * sa;
        const wob = 1 + 0.12 * Math.sin(along / 5 + f * 70) + 0.06 * Math.sin(along / 2.3 - f * 110);
        const w = b.w * grow * shrink * wob, o = Math.max(d - w, 0);
        const core = P.clamp(w - d + 0.5);
        const bloom = Math.exp(-o / (b.w * 0.6 + 1.5)) * grow * shrink;
        const scatter = Math.exp(-o / 22) * 0.18 * grow * shrink;
        const v = Math.max(core, bloom * 0.85, scatter), i = y * W + x;
        if (v > light[i]) light[i] = v;
      }
    glow += 0.06 * grow * shrink + (f < 0.06 ? 0.4 * (1 - f / 0.06) : 0);
  }
  if (any)
    for (let y = 0; y < H; y++)
      for (let x = 0; x < W; x++) {
        const i = y * W + x, v = light[i];
        if (v <= 0.01) continue;
        const q = v * 4, base = Math.floor(q), fr = q - base;
        const lv = P.clamp((base + (fr > 0.6 || (fr > 0.4 && P.bt(x + buf.ox, y + buf.oy) - 0.5 / 16 > 0.5) ? 1 : 0)) / 4);
        if (lv <= 0) continue;
        const src = P.unpack(buf.px[i]), tint = P.ramp(cols, lv);
        buf.put(i, P.col(P.mix(src, tint, lv)));
      }
  if (glow > 0) {
    const k = Math.min(glow, 0.6) * 0.5;
    for (let i = 0; i < W * H; i++) buf.put(i, P.col(P.mix(P.unpack(buf.px[i]), [255, 255, 255], k)));
  }
  return glow;
};

P.novaNoise = () => {
  if (P.NOVA) return P.NOVA;
  const S = 160, a = new Float32Array(S * S), b = new Float32Array(S * S);
  for (let j = 0; j < S; j++)
    for (let i = 0; i < S; i++) {
      a[j * S + i] = P.noise(i * 0.16, j * 0.2);
      b[j * S + i] = P.noise(i * 0.4, j * 0.45);
    }
  return (P.NOVA = { S, a, b });
};

P.SMOKE_GREEN = {
  smoke: [[6, 22, 12], [14, 48, 24], [26, 82, 36], [44, 124, 50], [76, 176, 66], [130, 226, 98], [200, 255, 168], [240, 255, 228]],
  ring: [[236, 255, 220], [130, 240, 100], [50, 170, 60]],
  core: [[245, 255, 235], [150, 245, 120], [60, 180, 64]],
  puff: [[70, 160, 66], [34, 96, 44]],
  spark: [[220, 255, 200], [100, 230, 90]],
  gather: [[60, 170, 60], [230, 255, 210], [90, 220, 80]],
};

P.novaSmoke = (buf, x, te, t, opt = {}) => {
  const C = opt.cols || P.SMOKE_GREEN, fade = opt.fade ?? 1, front = !!opt.front, S = opt.scale ?? 1;
  if (fade <= 0 || te < -0.5) return;
  const NN = P.novaNoise(), NS = NN.S, wrap = (v) => ((Math.round(v) % NS) + NS) % NS;
  if (te < 0) {
    if (front) return;
    const c = (te + 0.5) / 0.5;
    buf.blob(x, -4 * S, (2 + 8 * c) * S, P.mix(C.gather[0], C.gather[1], c), (0.4 + 0.6 * c) * fade, 0.6);
    for (let i = 0; i < 18; i++) {
      const r = P.rng(i * 19 + 7), a = -Math.PI * r(), ph = (t * 2.4 + r()) % 1, d = (1 - ph) * (30 + r() * 24) * S;
      buf.pset(x + Math.cos(a) * d, -4 * S + Math.sin(a) * d * 0.8, ph > 0.6 ? C.gather[1] : C.gather[2]);
    }
    return;
  }
  const rings = [[-2, 130], [-20, 96], [-40, 64]].map(([y, r]) => [y * S, r * S]), ringFade = 1 - P.clamp((te - 0.35) / 0.8);
  const ring = (yo, maxR) => {
    const r = maxR * P.ease.out(P.clamp(te / 0.5)), ry = r * 0.22;
    if (ringFade <= 0 || r < 2) return;
    for (let a = 0; a < Math.PI * 2; a += 0.6 / Math.max(10, r)) {
      if (Math.sin(a) > 0 !== front) continue;
      const px = x + Math.cos(a) * r, py = yo + Math.sin(a) * ry;
      if (P.bt(px, py) >= ringFade * fade) continue;
      buf.pset(px, py, C.ring[0]);
      buf.pset(px, py - 1, C.ring[1]);
      if (P.bt(px + 1, py) < ringFade * 0.6) buf.pset(px, py + 1, C.ring[2]);
    }
  };
  if (front) {
    for (const [yo, mr] of rings) ring(yo, mr);
    for (let i = 0; i < 26; i++) {
      const r = P.rng(i * 37 + 3), ph = (te * (0.25 + r() * 0.2) + r()) % 1, px = x + ((r() - 0.5) * 110 + Math.sin(t * 2 + i) * 6) * S, py = (-2 - ph * 170) * S;
      if (P.bt(px, py) < (1 - ph) * fade) buf.pset(px, py, ph < 0.3 ? C.spark[0] : C.spark[1]);
    }
    return;
  }
  const smoke = C.smoke.map(P.col);
  const spread = 240 * S * P.ease.out(P.clamp(te / 1.4));
  for (let px = Math.max(buf.ox, Math.floor(x - spread)); px < Math.min(buf.ox + buf.w, x + spread); px++) {
    const e = Math.abs(px - x) / spread, h = (60 + 16 * Math.sin((px / S) * 0.045 + t * 0.9) + 12 * Math.sin((px / S) * 0.11 - t * 1.7)) * S * (1 - e * e * e * e), ef = fade * (e > 0.85 ? (1 - e) / 0.15 : 1);
    for (let py = Math.max(buf.oy, Math.floor(-h)); py <= 1; py++) {
      const hy = -py / h;
      const n = NN.a[wrap(py / S + te * 40) * NS + wrap(px / S + te * 6)] * 0.6 + NN.b[wrap(py / S + te * 24) * NS + wrap(px / S - te * 9)] * 0.4;
      const heat = (1 - hy) * 0.95 + (n - 0.5) * 0.9 - 0.04;
      if (heat < 0.1 || P.bt(px, py) >= ef) continue;
      buf.pset(px, py, smoke[P.ditherIndex(P.clamp(heat * 0.85), smoke.length, px, py, 0.35)]);
    }
  }
  for (let i = 0; i < 34; i++) {
    const r = P.rng(i * 53 + 11), ph = (te * (0.16 + r() * 0.1) + r()) % 1;
    if (te < ph * 3) continue;
    const px = x + ((r() - 0.5) * 70 * (0.5 + ph) + Math.sin(t * 0.8 + i) * 5) * S, py = (-6 - ph * 175) * S, sz = (6 + ph * 14 + r() * 5) * S;
    buf.blob(px, py, sz, ph < 0.4 ? C.puff[0] : C.puff[1], (1 - ph) * 0.75 * fade, 0.6);
  }
  for (const [yo, mr] of rings) ring(yo, mr);
  if (te < 1.0) {
    const w = (6 * (1 - te) + 1) * S;
    for (let y = buf.oy; y < 0; y++)
      for (let dx = -Math.ceil(w + 2); dx <= Math.ceil(w + 2); dx++) {
        const d = Math.abs(dx) / w;
        if (d > 1.4 || P.bt(x + dx, y) >= (1 - te) * fade * (d < 1 ? 1 : 1.4 - d)) continue;
        buf.pset(x + dx, y, d < 0.4 ? C.core[0] : d < 1 ? C.core[1] : C.core[2]);
      }
  }
  const R = 62 * S * P.ease.out(P.clamp(te / 0.35)) * (1 + Math.min(te, 3) * 0.08), stretch = 0.74 + 0.55 * P.ease.io(P.clamp(te / 2.4));
  const ry = R * stretch, cy = -R * 0.05 - 34 * S * P.ease.io(P.clamp(te / 2.4));
  if (R > 1)
    for (let py = Math.floor(cy - ry); py <= 1; py++)
      for (let px = Math.floor(x - R); px <= Math.ceil(x + R); px++) {
        const dx = (px - x) / R, dy = (py - cy) / ry, e = dx * dx + dy * dy;
        if (e > 1) continue;
        const n = NN.a[wrap(py / S + te * 44) * NS + wrap(px / S + te * 14)] * 0.6 + NN.b[wrap(py / S + te * 26) * NS + wrap(px / S - te * 10)] * 0.4;
        const heat = (1 - e) * 0.8 + n * 0.55 - Math.min(te, 1.4) * 0.2 - 0.06 + (py > -6 * S ? 0.1 : 0);
        if (e > 0.7 && n < 0.48 && dy < 0.3) continue;
        if (dy < -0.4 && n < 0.32 + (-dy - 0.4) * 0.5) continue;
        if (P.bt(px, py) >= fade * (e > 0.9 ? 1.6 - e : 1)) continue;
        buf.pset(px, py, smoke[P.ditherIndex(P.clamp(heat), smoke.length, px, py, 0.35)]);
      }
};

P.BREATH_GOLD = [[120, 40, 12], [210, 100, 24], [255, 170, 40], [255, 214, 90], [255, 240, 170], [255, 252, 226], [255, 255, 255]];

class Breath {
  constructor(opt = {}) {
    this.LMAX = opt.length ?? 210;
    this.ROWS = Math.ceil(this.LMAX / 2);
    this.V = 96;
    this.a = new Uint8Array(this.ROWS * this.V);
    this.seed = opt.seed ?? 0x2545f491;
    this.pal = Array.from({ length: 37 }, (_, i) => P.col(P.ramp(opt.cols || P.BREATH_GOLD, i / 36)));
    this.wind = new Float32Array(this.LMAX);
  }

  step(on = true, steps = 3) {
    const a = this.a, V = this.V, ROWS = this.ROWS;
    let sd = this.seed;
    const rnd = () => {
      sd ^= sd << 13; sd ^= sd >>> 17; sd ^= sd << 5;
      return (sd >>> 0) / 4294967296;
    };
    for (let s = 0; s < steps; s++) {
      for (let v = 0; v < V; v++) {
        const e = Math.min(v - 16, V - 17 - v);
        a[v] = on && e >= 0 ? Math.max(0, Math.min(36, 22 + e * 1.4) - (rnd() < 0.15 ? 8 : 0)) : 0;
      }
      for (let k = ROWS - 1; k >= 1; k--) {
        const up = (k + s) & 1, o = k * V, ip = o - V;
        for (let q = 0; q < V; q++) {
          const v = up ? q : V - 1 - q, src = a[ip + v], r = rnd() * 3, ri = r | 0, nv = v + ri - 1;
          if (nv < 0 || nv >= V) continue;
          const dec = r - ri < 0.36 ? 1 : 0;
          a[o + nv] = src > dec ? src - dec : 0;
        }
      }
    }
    this.seed = sd;
  }

  draw(buf, hx, hy, aA, aB, t, open = 1, floor = buf.oy + buf.h) {
    const LMAX = this.LMAX, V = this.V, a = this.a, pal = this.pal;
    const mid = (aA + aB) / 2, half = ((aB - aA) / 2) * (0.25 + 0.75 * open) * (V - 1) / (V - 19), dA = (half * 2) / (V - 1), lo = mid - half, idA = 1 / dA;
    for (let k = 0; k < LMAX; k++) this.wind[k] = Math.sin(k * 0.06 - t * 7) * (1 + k * 0.02) - lo * idA;
    const I0 = Math.max(0, Math.floor(hx - LMAX) - buf.ox), I1 = Math.min(buf.w - 1, Math.ceil(hx + LMAX) - buf.ox);
    const J0 = Math.max(0, Math.floor(hy - LMAX) - buf.oy), J1 = Math.min(buf.h - 1, floor - buf.oy), TAU = Math.PI * 2;
    for (let j = J0; j <= J1; j++) {
      const dy = j + buf.oy + 0.5 - hy;
      for (let i = I0; i <= I1; i++) {
        const dx = i + buf.ox + 0.5 - hx, k = Math.sqrt(dx * dx + dy * dy) | 0;
        if (k < 2 || k >= LMAX) continue;
        let th = Math.atan2(dy, dx);
        if (lo > Math.PI / 2 && th < 0) th += TAU;
        const uu = th * idA + this.wind[k];
        if (uu < 0 || uu >= V) continue;
        const I = a[(k >> 1) * V + (uu | 0)];
        if (I >= 5) buf.px[j * buf.w + i] = pal[I];
      }
    }
  }
}
P.Breath = Breath;

P.HELL_FIRE = [[30, 6, 6], [110, 18, 8], [180, 40, 10], [222, 80, 14], [244, 124, 22], [252, 172, 40], [255, 214, 90], [255, 244, 186], [255, 255, 255]];

class HellFire {
  constructor(w, h, opt = {}) {
    this.w = w;
    this.h = h;
    this.a = new Uint8Array(w * h);
    this.seed = opt.seed ?? 0x9e3779b9;
    this.top = h;
    this.pal = Array.from({ length: 37 }, (_, i) => P.col(P.ramp(opt.cols || P.HELL_FIRE, i / 36)));
  }

  step(power = 1, cool = 1, steps = 1) {
    const W = this.w, H = this.h, a = this.a, src = Math.round(36 * P.clamp(power));
    let sd = this.seed, top = this.top;
    for (let s = 0; s < steps; s++) {
      for (let x = 0; x < W; x++) {
        sd ^= sd << 13; sd ^= sd >>> 17; sd ^= sd << 5;
        a[(H - 1) * W + x] = Math.max(0, src - ((sd >>> 0) % 100 < 15 ? 6 : 0));
      }
      let newTop = H;
      for (let y = Math.max(1, top - 1); y < H; y++) {
        const row = y * W, up = row - W;
        for (let x = 0; x < W; x++) {
          const v = a[row + x];
          if (v === 0) {
            a[up + x] = 0;
            continue;
          }
          sd ^= sd << 13; sd ^= sd >>> 17; sd ^= sd << 5;
          const rr = (sd >>> 0) % 6, r = rr % 3, dx = x + r - 1 < 0 ? 0 : x + r - 1 >= W ? W - 1 : x + r - 1;
          const nv = v - ((r & 1) + (cool > 1 && rr >= 3 ? cool - 1 : 0));
          a[up + dx] = nv > 0 ? nv : 0;
          if (nv > 0 && y - 1 < newTop) newTop = y - 1;
        }
      }
      top = newTop;
    }
    this.seed = sd;
    this.top = top;
  }

  draw(buf, x = buf.ox, ground = buf.oy + buf.h) {
    const W = this.w, H = this.h, a = this.a, bx = Math.round(x) - buf.ox, by = Math.round(ground) - H - buf.oy;
    for (let j = Math.max(0, this.top - 1, -by); j < Math.min(H, buf.h - by); j++)
      for (let i = Math.max(0, -bx); i < Math.min(W, buf.w - bx); i++) {
        const v = a[j * W + i];
        if (v > 4) buf.px[(j + by) * buf.w + i + bx] = this.pal[v];
      }
  }
}
P.HellFire = HellFire;

P.FLAME_COLS = [[110, 22, 8], [185, 45, 10], [232, 96, 20], [250, 156, 40], [255, 212, 96], [255, 246, 206]];
P.SMOKE_COLS = [[140, 140, 148], [214, 214, 220]];

class Flow {
  constructor(opt = {}, def = {}) {
    const o = { ...def, ...opt };
    this.o = o;
    const cols = o.cols || P.FLAME_COLS;
    this.rgb = o.alpha ? o.alpha.map((_, i) => P.ramp(cols, o.alpha.length > 1 ? i / (o.alpha.length - 1) : 0).map(Math.round)) : cols;
    this.pal = this.rgb.map(P.col);
    this.r = P.rng(o.seed ?? 9);
    this.bits = [];
  }

  value(dx, h) {
    return 1 - h - dx * dx;
  }

  profile(h) {
    return 1;
  }

  draw(buf, x, ground, t) {
    const o = this.o, n = this.pal.length, top = ground - o.height * 1.35, bot = ground + o.height * 0.12, warp = o.warp ?? 0, calm = o.calm ?? 0.35;
    let wide = 0;
    for (let k = 0; k <= 16; k++) wide = Math.max(wide, this.profile(-0.12 + (k / 16) * 1.47));
    const reach = o.width * wide * 1.6 + o.swayAmp + warp;
    const X0 = Math.max(buf.ox, Math.floor(x - reach)), X1 = Math.min(buf.ox + buf.w - 1, Math.ceil(x + reach));
    const Y0 = Math.max(buf.oy, Math.floor(top)), Y1 = Math.min(buf.oy + buf.h - 1, Math.ceil(bot));
    for (let wy = Y0; wy <= Y1; wy++) {
      const h = (ground - wy) / o.height, pw = this.profile(h);
      if (pw <= 0) continue;
      const sway = (P.fbm(h * 1.5, t * o.sway, 2, 7) - 0.5) * o.swayAmp * h * h, hw = Math.max(0.5, o.width * pw);
      for (let wx = X0; wx <= X1; wx++) {
        let sx = wx - sway;
        if (warp) sx += (P.fbm(sx * o.fx * 0.6, wy * o.fy * 0.6 + t * o.speed * 0.6, 2, 3) - 0.5) * warp * Math.max(0, h);
        const dx = (sx - x) / hw, nz = P.fbm(sx * o.fx, wy * o.fy + t * o.speed, 3, 1);
        const v = this.value(dx, h) + (nz - 0.5) * o.rough * (calm + h);
        if (v <= o.cut) continue;
        const k = P.ditherIndex(P.clamp(v * o.gain), n, wx, wy, o.dither), i = (wy - buf.oy) * buf.w + wx - buf.ox;
        if (!o.alpha) buf.put(i, this.pal[k]);
        else if (buf.px[i] >>> 24) buf.put(i, P.col(P.mix(P.unpack(buf.px[i]), this.rgb[k], o.alpha[k])));
        else buf.put(i, ((Math.round(o.alpha[k] * 255) << 24) | (this.pal[k] & 0xffffff)) >>> 0);
      }
    }
    const r = this.r;
    if (o.bits && r() < o.bits) this.bits.push({ x: x + (r() - 0.5) * o.width, y: ground - o.height * 0.6, vy: -0.5 - r() * 0.5, ph: r() * 6, age: 0, life: 14 + r() * 14 });
    for (const b of this.bits) {
      (b.y += b.vy), (b.x += Math.sin(b.age * 0.35 + b.ph) * 0.5), b.age++;
      const k = b.age / b.life;
      if (P.bt(b.x, b.y) < 1 - k) buf.pset(b.x, b.y, this.pal[k < 0.5 ? n - 2 : n - 3]);
    }
    this.bits = this.bits.filter((b) => b.age <= b.life);
  }
}
P.Flow = Flow;

class Flame extends Flow {
  constructor(opt = {}) {
    super(opt, { height: 48, width: 14, speed: 3.4, fx: 0.16, fy: 0.11, rough: 1.45, sway: 1.6, swayAmp: 9, bits: 0.45, cut: 0.04, gain: 1.02, dither: 0.4 });
  }

  value(dx, h) {
    return 1 - h * 1.05 - dx * dx * 0.75;
  }

  profile(h) {
    return Math.pow(Math.max(0, 1 - h * 0.85), 0.9) * Math.sqrt(P.clamp((h + 0.08) / 0.18));
  }
}
P.Flame = Flame;

class Smoke extends Flow {
  constructor(opt = {}) {
    super(opt, { cols: P.SMOKE_COLS, alpha: [0.08, 0.18, 0.32, 0.5, 0.7, 0.85], height: 84, width: 2.5, speed: 1.5, fx: 0.12, fy: 0.09, rough: 1.3, calm: 0.03, sway: 0.7, swayAmp: 8, warp: 45, bits: 0, cut: 0.02, gain: 1.1, dither: 0.5 });
  }

  value(dx, h) {
    return 0.8 - h * 0.5 - dx * dx * 0.65 - Math.max(0, h - 0.4) * 0.9;
  }

  profile(h) {
    return h < -0.02 ? 0 : 0.8 + h * 5.5;
  }
}
P.Smoke = Smoke;

P.dist2 = (a, b) => {
  const dr = a[0] - b[0], dg = a[1] - b[1], db = a[2] - b[2];
  return dr * dr + dg * dg + db * db;
};
P.nearest = (pal, c) => {
  let best = 0, bd = Infinity;
  for (let k = 0; k < pal.length; k++) {
    const dr = c[0] - pal[k][0], dg = c[1] - pal[k][1], db = c[2] - pal[k][2], d = 2 * dr * dr + 4 * dg * dg + 3 * db * db;
    if (d < bd) (bd = d), (best = k);
  }
  return best;
};

P.unpng = (data) => {
  const zlib = require("zlib"), sig = [137, 80, 78, 71, 13, 10, 26, 10];
  for (let i = 0; i < 8; i++) if (data[i] !== sig[i]) throw new Error("not a PNG file, convert it to PNG first");
  let pos = 8, w = 0, h = 0, depth = 8, type = 6, interlace = 0, plte = null, trns = null;
  const idat = [];
  while (pos + 8 <= data.length) {
    const len = data.readUInt32BE(pos), name = data.toString("latin1", pos + 4, pos + 8), body = data.subarray(pos + 8, pos + 8 + len);
    pos += 12 + len;
    if (name === "IHDR") (w = body.readUInt32BE(0)), (h = body.readUInt32BE(4)), (depth = body[8]), (type = body[9]), (interlace = body[12]);
    else if (name === "PLTE") plte = body;
    else if (name === "tRNS") trns = body;
    else if (name === "IDAT") idat.push(body);
    else if (name === "IEND") break;
  }
  if (interlace) throw new Error("interlaced PNG, save it again without interlacing");
  const ch = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 }[type], bpp = Math.max(1, (ch * depth) >> 3), stride = (w * ch * depth + 7) >> 3;
  const raw = zlib.inflateSync(Buffer.concat(idat)), img = Buffer.alloc(stride * h);
  for (let y = 0; y < h; y++) {
    const f = raw[y * (stride + 1)], s = y * (stride + 1) + 1, o = y * stride;
    for (let x = 0; x < stride; x++) {
      const v = raw[s + x], a = x >= bpp ? img[o + x - bpp] : 0, b = y ? img[o - stride + x] : 0, c = x >= bpp && y ? img[o - stride + x - bpp] : 0;
      let p = v;
      if (f === 1) p = v + a;
      else if (f === 2) p = v + b;
      else if (f === 3) p = v + ((a + b) >> 1);
      else if (f === 4) {
        const q = a + b - c, pa = Math.abs(q - a), pb = Math.abs(q - b), pc = Math.abs(q - c);
        p = v + (pa <= pb && pa <= pc ? a : pb <= pc ? b : c);
      }
      img[o + x] = p & 255;
    }
  }
  const max = (1 << Math.min(depth, 8)) - 1;
  const at = (y, i) => {
    if (depth === 8) return img[y * stride + i];
    if (depth === 16) return img[y * stride + i * 2];
    const bit = i * depth;
    return (img[y * stride + (bit >> 3)] >> (8 - depth - (bit & 7))) & max;
  };
  const up = (v) => (depth < 8 && type !== 3 ? Math.round((v * 255) / max) : v);
  const out = new Buf(w, h);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      let r, g, b, a = 255;
      if (type === 0) {
        const v = at(y, x);
        r = g = b = up(v);
        if (trns && depth <= 8 && v === trns.readUInt16BE(0)) a = 0;
      } else if (type === 2) {
        (r = at(y, x * 3)), (g = at(y, x * 3 + 1)), (b = at(y, x * 3 + 2));
        if (trns && depth === 8 && r === trns.readUInt16BE(0) && g === trns.readUInt16BE(2) && b === trns.readUInt16BE(4)) a = 0;
      } else if (type === 3) {
        const k = at(y, x);
        (r = plte[k * 3]), (g = plte[k * 3 + 1]), (b = plte[k * 3 + 2]);
        if (trns && k < trns.length) a = trns[k];
      } else if (type === 4) (r = g = b = up(at(y, x * 2))), (a = at(y, x * 2 + 1));
      else (r = at(y, x * 4)), (g = at(y, x * 4 + 1)), (b = at(y, x * 4 + 2)), (a = at(y, x * 4 + 3));
      out.px[y * w + x] = a ? ((a << 24) | (b << 16) | (g << 8) | r) >>> 0 : 0;
    }
  return out;
};
P.load = (file) => P.unpng(require("fs").readFileSync(file));
P.save = (buf, file) => require("fs").writeFileSync(file, P.png(buf));

P.crop = (buf, x, y, w, h) => {
  const o = new Buf(w, h);
  for (let j = 0; j < h; j++)
    for (let i = 0; i < w; i++) {
      const sx = x + i, sy = y + j;
      if (sx >= 0 && sy >= 0 && sx < buf.w && sy < buf.h) o.px[j * w + i] = buf.px[sy * buf.w + sx];
    }
  return o;
};
P.bounds = (buf) => {
  let x0 = Infinity, y0 = Infinity, x1 = -1, y1 = -1;
  for (let y = 0; y < buf.h; y++)
    for (let x = 0; x < buf.w; x++)
      if (buf.px[y * buf.w + x] >>> 24) (x0 = Math.min(x0, x)), (y0 = Math.min(y0, y)), (x1 = Math.max(x1, x)), (y1 = Math.max(y1, y));
  return x1 < 0 ? null : { x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1 };
};
P.trim = (buf, pad = 0) => {
  const b = P.bounds(buf);
  return b ? P.crop(buf, b.x - pad, b.y - pad, b.w + pad * 2, b.h + pad * 2) : new Buf(1, 1);
};

P.removeBg = (buf, opt = {}) => {
  const W = buf.w, H = buf.h, src = buf.px, tol2 = (opt.tol ?? 48) ** 2, out = new Buf(W, H);
  out.px.set(src);
  let bg = opt.color;
  if (!bg) {
    const count = new Map();
    const add = (i) => {
      if (!(src[i] >>> 24)) return;
      const c = P.unpack(src[i]), k = ((c[0] >> 4) << 8) | ((c[1] >> 4) << 4) | (c[2] >> 4), e = count.get(k) || [0, 0, 0, 0];
      (e[0] += c[0]), (e[1] += c[1]), (e[2] += c[2]), e[3]++;
      count.set(k, e);
    };
    for (let x = 0; x < W; x++) add(x), add((H - 1) * W + x);
    for (let y = 1; y < H - 1; y++) add(y * W), add(y * W + W - 1);
    let top = null;
    for (const e of count.values()) if (!top || e[3] > top[3]) top = e;
    if (!top) return out;
    bg = [top[0] / top[3], top[1] / top[3], top[2] / top[3]];
  }
  const near = (i) => !(src[i] >>> 24) || P.dist2(P.unpack(src[i]), bg) <= tol2;
  if (opt.flood === false) {
    for (let i = 0; i < W * H; i++) if (near(i)) out.px[i] = 0;
    return P.erode(out, opt.erode ?? 0);
  }
  const seen = new Uint8Array(W * H), q = new Int32Array(W * H);
  let qh = 0, qt = 0;
  const push = (i) => {
    if (!seen[i] && near(i)) (seen[i] = 1), (q[qt++] = i);
  };
  if (opt.seeds) for (const [x, y] of opt.seeds) push(y * W + x);
  else {
    for (let x = 0; x < W; x++) push(x), push((H - 1) * W + x);
    for (let y = 1; y < H - 1; y++) push(y * W), push(y * W + W - 1);
  }
  while (qh < qt) {
    const i = q[qh++], x = i % W;
    out.px[i] = 0;
    if (x > 0) push(i - 1);
    if (x < W - 1) push(i + 1);
    if (i >= W) push(i - W);
    if (i < W * (H - 1)) push(i + W);
  }
  return P.erode(out, opt.erode ?? 0);
};

P.erode = (buf, n = 1) => {
  const W = buf.w, H = buf.h;
  let cur = buf;
  for (let k = 0; k < (n | 0); k++) {
    const s = cur.px, out = new Buf(W, H);
    out.px.set(s);
    for (let y = 0; y < H; y++)
      for (let x = 0; x < W; x++) {
        const i = y * W + x;
        if (!(s[i] >>> 24)) continue;
        if ((x > 0 && !(s[i - 1] >>> 24)) || (x < W - 1 && !(s[i + 1] >>> 24)) || (y > 0 && !(s[i - W] >>> 24)) || (y < H - 1 && !(s[i + W] >>> 24))) out.px[i] = 0;
      }
    cur = out;
  }
  return cur;
};

P.resize = (buf, w, h, opt = {}) => {
  if (h && typeof h === "object") (opt = h), (h = undefined);
  h = h ?? Math.max(1, Math.round((w * buf.h) / buf.w));
  const out = new Buf(w, h), sx = buf.w / w, sy = buf.h / h, cut = (opt.alpha ?? 0.5) * 255, votes = new Map();
  for (let y = 0; y < h; y++) {
    const y0 = Math.min(buf.h - 1, Math.floor(y * sy)), y1 = Math.min(buf.h, Math.max(y0 + 1, Math.floor((y + 1) * sy)));
    for (let x = 0; x < w; x++) {
      const x0 = Math.min(buf.w - 1, Math.floor(x * sx)), x1 = Math.min(buf.w, Math.max(x0 + 1, Math.floor((x + 1) * sx)));
      let r = 0, g = 0, b = 0, a = 0, n = 0;
      votes.clear();
      for (let j = y0; j < y1; j++)
        for (let i = x0; i < x1; i++) {
          const c = buf.px[j * buf.w + i], al = c >>> 24;
          (r += (c & 255) * al), (g += ((c >>> 8) & 255) * al), (b += ((c >>> 16) & 255) * al), (a += al), n++;
          if (opt.mode && al) votes.set(c | 0xff000000, (votes.get(c | 0xff000000) || 0) + al);
        }
      if (!(a / n >= cut && a > 0)) continue;
      if (opt.mode) {
        let top = 0, best = -1;
        for (const [c, v] of votes) if (v > best) (best = v), (top = c);
        out.px[y * w + x] = top >>> 0;
      } else out.px[y * w + x] = P.rgb(Math.round(r / a), Math.round(g / a), Math.round(b / a));
    }
  }
  return out;
};

P.quantize = (buf, n = 16, opt = {}) => {
  const count = new Map();
  for (const c of buf.px) if (c >>> 24) count.set(c, (count.get(c) || 0) + 1);
  const cols = [...count.keys()].map(P.unpack), wt = [...count.values()];
  let pal;
  if (opt.palette) pal = opt.palette.map((c) => (typeof c === "number" ? P.unpack(c) : c.slice(0, 3)));
  else if (cols.length <= n) pal = cols.map((c) => c.slice());
  else {
    let first = 0;
    for (let i = 1; i < cols.length; i++) if (wt[i] > wt[first]) first = i;
    pal = [cols[first].slice()];
    const dmin = cols.map((c) => P.dist2(c, pal[0]));
    while (pal.length < n) {
      let pick = 0, best = -1;
      for (let i = 0; i < cols.length; i++) {
        const score = dmin[i] * Math.sqrt(wt[i]);
        if (score > best) (best = score), (pick = i);
      }
      pal.push(cols[pick].slice());
      for (let i = 0; i < cols.length; i++) dmin[i] = Math.min(dmin[i], P.dist2(cols[i], cols[pick]));
    }
    for (let it = 0; it < 12; it++) {
      const sum = pal.map(() => [0, 0, 0, 0]);
      for (let i = 0; i < cols.length; i++) {
        const k = P.nearest(pal, cols[i]), s = sum[k];
        (s[0] += cols[i][0] * wt[i]), (s[1] += cols[i][1] * wt[i]), (s[2] += cols[i][2] * wt[i]), (s[3] += wt[i]);
      }
      sum.forEach((s, k) => s[3] && (pal[k] = [s[0] / s[3], s[1] / s[3], s[2] / s[3]]));
    }
  }
  pal = pal.map((c) => c.map(Math.round));
  const map = new Map(), out = new Buf(buf.w, buf.h), strip = opt.dither === true ? 1 / 3 : opt.dither || 0;
  const pick = (rgb) => {
    const k1 = P.nearest(pal, rgb);
    if (!strip || pal.length < 2) return [k1, k1, 0];
    let k2 = -1, bd = Infinity;
    pal.forEach((p, k) => { if (k !== k1) { const d = P.dist2(p, rgb); if (d < bd) (bd = d), (k2 = k); } });
    const a = pal[k1], b = pal[k2], ab = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], l = ab[0] ** 2 + ab[1] ** 2 + ab[2] ** 2;
    const t = l ? P.clamp(((rgb[0] - a[0]) * ab[0] + (rgb[1] - a[1]) * ab[1] + (rgb[2] - a[2]) * ab[2]) / l, 0, 0.5) : 0;
    return [k1, k2, t];
  };
  for (let i = 0; i < buf.px.length; i++) {
    const c = buf.px[i];
    if (!(c >>> 24)) continue;
    let k = map.get(c);
    if (k === undefined) map.set(c, (k = pick(P.unpack(c))));
    const x = i % buf.w, y = (i / buf.w) | 0;
    out.px[i] = P.col(pal[strip && P.bt(x + buf.ox, y + buf.oy) < P.clamp((k[2] - 0.5) / strip + 0.5) ? k[1] : k[0]]);
  }
  return { buf: out, palette: pal };
};

P.cleanup = (buf, opt = {}) => {
  const W = buf.w, H = buf.h, s = buf.px, out = new Buf(W, H), tol2 = (opt.tol ?? 60) ** 2;
  out.px.set(s);
  const get = (x, y) => (x < 0 || y < 0 || x >= W || y >= H ? 0 : s[y * W + x]);
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const c = s[y * W + x];
      if (!(c >>> 24)) continue;
      const n4 = [get(x - 1, y), get(x + 1, y), get(x, y - 1), get(x, y + 1)], solid = n4.filter((v) => v >>> 24);
      if (!solid.length) {
        if (!opt.keepLone) out.px[y * W + x] = 0;
        continue;
      }
      if (n4.includes(c) || [get(x - 1, y - 1), get(x + 1, y - 1), get(x - 1, y + 1), get(x + 1, y + 1)].includes(c)) continue;
      const votes = new Map();
      for (const v of solid) votes.set(v, (votes.get(v) || 0) + 1);
      let top = solid[0];
      for (const [v, k] of votes) if (k > votes.get(top)) top = v;
      if (P.dist2(P.unpack(c), P.unpack(top)) <= tol2) out.px[y * W + x] = top;
    }
  return out;
};

P.outline = (buf, color, opt = {}) => {
  const c = P.col(color), W = buf.w + 2, H = buf.h + 2, out = new Buf(W, H);
  for (let y = 0; y < buf.h; y++) for (let x = 0; x < buf.w; x++) out.px[(y + 1) * W + x + 1] = buf.px[y * buf.w + x];
  const src = out.px.slice(), d = opt.corners ? [[-1, -1], [0, -1], [1, -1], [-1, 0], [1, 0], [-1, 1], [0, 1], [1, 1]] : [[0, -1], [-1, 0], [1, 0], [0, 1]];
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      if (src[y * W + x] >>> 24) continue;
      for (const [dx, dy] of d) {
        const nx = x + dx, ny = y + dy;
        if (nx >= 0 && ny >= 0 && nx < W && ny < H && src[ny * W + nx] >>> 24) {
          out.px[y * W + x] = c;
          break;
        }
      }
    }
  return out;
};

P.band = (v, n, x, y, strip = 1 / 3) => {
  const f = P.clamp(v) * (n - 1), k = Math.floor(f), fr = f - k;
  return Math.min(n - 1, k + (P.bt(x, y) < P.clamp((fr - 0.5) / strip + 0.5) ? 1 : 0));
};

P.hsl = (h, s, l) => {
  h = (((h % 360) + 360) % 360) / 60;
  const c = (1 - Math.abs(2 * l - 1)) * s, x = c * (1 - Math.abs((h % 2) - 1)), m = l - c / 2;
  const [r, g, b] = h < 1 ? [c, x, 0] : h < 2 ? [x, c, 0] : h < 3 ? [0, c, x] : h < 4 ? [0, x, c] : h < 5 ? [x, 0, c] : [c, 0, x];
  return [Math.round((r + m) * 255), Math.round((g + m) * 255), Math.round((b + m) * 255)];
};

P.hueRamp = (n, opt = {}) => {
  const hue = opt.hue ?? 110, shift = opt.shift ?? 60, sat = opt.sat ?? 0.55, drop = opt.satDrop ?? 0.35;
  const [l0, l1] = opt.light ?? [0.12, 0.62];
  const toward = (h, target, amt) => {
    const d = ((target - h + 540) % 360) - 180;
    return h + Math.sign(d) * Math.min(Math.abs(d), amt);
  };
  return Array.from({ length: n }, (_, i) => {
    const t = n > 1 ? i / (n - 1) : 0.5, e = Math.abs(2 * t - 1);
    const h = toward(hue, t < 0.5 ? 240 : 60, shift * e);
    return P.col(P.hsl(h, sat * (1 - drop * e), l0 + (l1 - l0) * t));
  });
};

P.toHsl = (c) => {
  const [r, g, b] = (typeof c === "number" ? P.unpack(c) : c).map((v) => v / 255);
  const M = Math.max(r, g, b), m = Math.min(r, g, b), d = M - m, l = (M + m) / 2;
  if (!d) return [0, 0, l];
  const s = d / (1 - Math.abs(2 * l - 1));
  const h = M === r ? ((g - b) / d) % 6 : M === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return [(h * 60 + 360) % 360, s, l];
};

P.hueRampFrom = (cols, n, opt = {}) => {
  const hsl = cols.map(P.toHsl), w = hsl.map(([, s]) => s + 0.01);
  let x = 0, y = 0;
  hsl.forEach(([h], i) => ((x += Math.cos((h * Math.PI) / 180) * w[i]), (y += Math.sin((h * Math.PI) / 180) * w[i])));
  const sats = hsl.map(([, s]) => s).sort((a, b) => a - b), ls = hsl.map(([, , l]) => l);
  return P.hueRamp(n, {
    hue: ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360,
    sat: sats[sats.length >> 1],
    light: [Math.min(...ls), Math.max(...ls)],
    ...opt,
  });
};

P.smoothMask = (m, w, h, opt = {}) => {
  const g = (a, x, y) => (x < 0 || y < 0 || x >= w || y >= h ? 0 : a[y * w + x]);
  let cur = m.slice();
  for (let pass = 0; pass < (opt.passes ?? 4); pass++) {
    const ero = new Uint8Array(w * h), out = new Uint8Array(w * h);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++)
      ero[y * w + x] = g(cur, x, y) && g(cur, x - 1, y) && g(cur, x + 1, y) && g(cur, x, y - 1) && g(cur, x, y + 1) ? 1 : 0;
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++)
      out[y * w + x] = g(cur, x, y) && (g(ero, x, y) || g(ero, x - 1, y) || g(ero, x + 1, y) || g(ero, x, y - 1) || g(ero, x, y + 1)) ? 1 : 0;
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      if (!out[y * w + x]) continue;
      const l = g(out, x - 1, y), r = g(out, x + 1, y), u = g(out, x, y - 1), d = g(out, x, y + 1);
      if (l + r + u + d <= 1 || (l && r && !u && !d) || (u && d && !l && !r)) out[y * w + x] = 0;
    }
    if (opt.fill !== false)
      for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++)
        if (!out[y * w + x] && g(out, x - 1, y) + g(out, x + 1, y) + g(out, x, y - 1) + g(out, x, y + 1) >= 3) out[y * w + x] = 1;
    let same = true;
    for (let i = 0; i < w * h; i++) if (out[i] !== cur[i]) { same = false; break; }
    cur = out;
    if (same) break;
  }
  return cur;
};

P.smoothEdge = (buf, opt = {}) => {
  const W = buf.w, H = buf.h, m = new Uint8Array(W * H);
  for (let i = 0; i < W * H; i++) m[i] = buf.px[i] >>> 24 ? 1 : 0;
  const k = P.smoothMask(m, W, H, opt), out = new Buf(W, H);
  out.ox = buf.ox, out.oy = buf.oy;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = y * W + x;
    if (!k[i]) continue;
    if (buf.px[i] >>> 24) { out.px[i] = buf.px[i]; continue; }
    const votes = new Map();
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = x + dx, ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
      const c = buf.px[ny * W + nx];
      if (c >>> 24) votes.set(c, (votes.get(c) || 0) + 1);
    }
    let top = 0, best = 0;
    for (const [c, n] of votes) if (n > best) (best = n), (top = c);
    out.px[i] = top;
  }
  return out;
};

P.selout = (buf, lit, shade, opt = {}) => {
  const [dx, dy] = opt.dir ?? [-1, -1], W = buf.w + 2, H = buf.h + 2, out = new Buf(W, H);
  for (let y = 0; y < buf.h; y++) for (let x = 0; x < buf.w; x++) out.px[(y + 1) * W + x + 1] = buf.px[y * buf.w + x];
  const src = out.px.slice(), s = (x, y) => x >= 0 && y >= 0 && x < W && y < H && src[y * W + x] >>> 24;
  const cl = P.col(lit), cs = P.col(shade);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    if (s(x, y)) continue;
    const away = (dx && s(x - dx, y)) || (dy && s(x, y - dy)), toward = (dx && s(x + dx, y)) || (dy && s(x, y + dy));
    if (away || toward) out.px[y * W + x] = away && !toward ? cl : cs;
  }
  return out;
};

P.rimLight = (buf, ramp, opt = {}) => {
  const [dx, dy] = opt.dir ?? [-1, -1], steps = opt.steps ?? 1, cols = ramp.map(P.col), W = buf.w, H = buf.h, out = new Buf(W, H);
  out.px.set(buf.px);
  const s = (x, y) => x >= 0 && y >= 0 && x < W && y < H && buf.px[y * W + x] >>> 24;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    if (!s(x, y) || ((!dx || s(x + dx, y)) && (!dy || s(x, y + dy)))) continue;
    const i = cols.indexOf(buf.px[y * W + x]);
    if (i >= 0) out.px[y * W + x] = cols[Math.min(cols.length - 1, i + steps)];
  }
  return out;
};

P.edgeCheck = (buf) => {
  const W = buf.w, H = buf.h, s = (x, y) => (x >= 0 && y >= 0 && x < W && y < H && buf.px[y * W + x] >>> 24 ? 1 : 0);
  const r = { nubs: [], strips: [], holes: [] };
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const l = s(x - 1, y), rt = s(x + 1, y), u = s(x, y - 1), d = s(x, y + 1), n = l + rt + u + d;
    if (s(x, y)) {
      if (n <= 1) r.nubs.push([x, y]);
      else if (n === 2 && ((l && rt) || (u && d))) r.strips.push([x, y]);
    } else if (x > 0 && y > 0 && x < W - 1 && y < H - 1 && n >= 3) r.holes.push([x, y]);
  }
  return r;
};

P.colorCount = (buf) => {
  const m = new Map();
  let total = 0;
  for (const c of buf.px) if (c >>> 24) (m.set(c, (m.get(c) || 0) + 1), total++);
  return [...m].sort((a, b) => b[1] - a[1]).map(([c, n]) => ({ col: P.unpack(c), n, share: n / total }));
};

P.pixelPerfect = (m, w, h) => {
  const out = m.slice(), g = (x, y) => (x < 0 || y < 0 || x >= w || y >= h ? 0 : out[y * w + x]);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    if (!out[y * w + x]) continue;
    const l = g(x - 1, y), r = g(x + 1, y), u = g(x, y - 1), d = g(x, y + 1);
    if (l + r !== 1 || u + d !== 1) continue;
    const sx = l ? -1 : 1, sy = u ? -1 : 1;
    if (!g(x + sx, y + sy) && !g(x - sx, y) && !g(x, y - sy)) out[y * w + x] = 0;
  }
  return out;
};

P.partAreas = (masks) => {
  const top = new Int16Array(masks[0].length).fill(-1);
  masks.forEach((m, i) => { for (let j = 0; j < m.length; j++) if (m[j]) top[j] = i; });
  const n = masks.map(() => 0);
  for (const t of top) if (t >= 0) n[t]++;
  return n;
};

P.balanceParts = (make, count, opt = {}) => {
  const want = opt.want ?? Array(count).fill(1), s = Array(count).fill(1);
  for (let it = 0; it < (opt.iters ?? 12); it++) {
    const a = P.partAreas(make(s)), mean = a.reduce((p, q, i) => p + q / want[i], 0) / count;
    for (let i = 0; i < count; i++) s[i] *= Math.pow((mean * want[i]) / Math.max(1, a[i]), 0.25);
  }
  const masks = make(s);
  return { scales: s, masks, areas: P.partAreas(masks) };
};

P.segDist2 = (px, py, ax, ay, bx, by) => {
  const dx = bx - ax, dy = by - ay, l = dx * dx + dy * dy, t = l ? P.clamp(((px - ax) * dx + (py - ay) * dy) / l) : 0;
  const x = ax + dx * t - px, y = ay + dy * t - py;
  return x * x + y * y;
};
P.inPoly = (x, y, pts) => {
  let ins = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const [xi, yi] = pts[i], [xj, yj] = pts[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) ins = !ins;
  }
  return ins;
};

P.BONE_COLS = [[255, 70, 70], [70, 190, 255], [255, 220, 50], [110, 230, 80], [200, 100, 255], [255, 140, 30], [40, 230, 200], [255, 100, 200], [150, 150, 255], [240, 240, 240]];

class Rig {
  constructor(src) {
    this.src = src;
    this.bones = [];
    this.owner = null;
  }

  index(name) {
    const i = this.bones.findIndex((b) => b.name === name);
    if (i < 0) throw new Error("no bone named " + name);
    return i;
  }

  bone(name, parent, x, y, ex = x, ey = y, z = 0) {
    this.bones.push({ name, parent: parent == null ? -1 : this.index(parent), x, y, ex, ey, z });
    this.owner = null;
    return this;
  }

  bind(opt = {}) {
    const { w, h, px } = this.src, own = new Int16Array(w * h).fill(-1), joint = new Uint8Array(w * h), J = opt.joint ?? 2;
    for (let y = 0; y < h; y++)
      for (let x = 0; x < w; x++) {
        if (!(px[y * w + x] >>> 24)) continue;
        let best = -1, bd = Infinity;
        this.bones.forEach((b, k) => {
          const d = P.segDist2(x + 0.5, y + 0.5, b.x, b.y, b.ex, b.ey);
          if (d < bd) (bd = d), (best = k);
        });
        own[y * w + x] = best;
      }
    for (const [name, poly] of Object.entries(opt.paint || {})) {
      const k = this.index(name);
      for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (px[y * w + x] >>> 24 && P.inPoly(x + 0.5, y + 0.5, poly)) own[y * w + x] = k;
    }
    this.box = this.bones.map(() => null);
    for (let y = 0; y < h; y++)
      for (let x = 0; x < w; x++) {
        const k = own[y * w + x];
        if (k < 0) continue;
        const b = this.bones[k], hit = [k];
        if (b.parent >= 0) {
          let near = false;
          for (let j = Math.max(0, y - J); j <= Math.min(h - 1, y + J) && !near; j++)
            for (let i = Math.max(0, x - J); i <= Math.min(w - 1, x + J); i++)
              if (own[j * w + i] >= 0 && own[j * w + i] !== k) {
                near = true;
                break;
              }
          if (near) (joint[y * w + x] = 1), hit.push(b.parent);
        }
        for (const m of hit) {
          const bb = this.box[m] || (this.box[m] = { x0: x, y0: y, x1: x, y1: y });
          (bb.x0 = Math.min(bb.x0, x)), (bb.y0 = Math.min(bb.y0, y)), (bb.x1 = Math.max(bb.x1, x)), (bb.y1 = Math.max(bb.y1, y));
        }
      }
    this.owner = own;
    this.joint = joint;
    return this;
  }

  pose(p = {}) {
    const T = [];
    this.bones.forEach((b, i) => {
      const v = p[b.name] ?? 0, o = typeof v === "number" ? { a: v } : v;
      let x = b.x, y = b.y, a = o.a ?? 0;
      if (b.parent >= 0) {
        const q = T[b.parent];
        [x, y] = Rig.apply(q, b.x, b.y);
        a += q.a;
      }
      T[i] = { a, c: Math.cos(a), s: Math.sin(a), x: x + (o.dx ?? 0), y: y + (o.dy ?? 0), rx: b.x, ry: b.y };
    });
    return T;
  }

  static apply(t, x, y) {
    const dx = x - t.rx, dy = y - t.ry;
    return [t.x + dx * t.c - dy * t.s, t.y + dx * t.s + dy * t.c];
  }

  draw(buf, x, y, p = {}, opt = {}) {
    if (!this.owner) this.bind();
    const T = this.pose(p), { w, h, px } = this.src, own = this.owner, joint = this.joint, flip = !!opt.flip;
    const order = this.bones.map((_, i) => i).sort((i, j) => this.bones[i].z - this.bones[j].z || i - j);
    for (const k of order) {
      const t = T[k], bb = this.box[k];
      if (!bb) continue;
      let X0 = Infinity, Y0 = Infinity, X1 = -Infinity, Y1 = -Infinity;
      for (const [cx, cy] of [[bb.x0, bb.y0], [bb.x1 + 1, bb.y0], [bb.x0, bb.y1 + 1], [bb.x1 + 1, bb.y1 + 1]]) {
        const [qx, qy] = Rig.apply(t, cx, cy);
        (X0 = Math.min(X0, qx)), (Y0 = Math.min(Y0, qy)), (X1 = Math.max(X1, qx)), (Y1 = Math.max(Y1, qy));
      }
      for (let Y = Math.floor(Y0) - 1; Y <= Math.ceil(Y1); Y++)
        for (let X = Math.floor(X0) - 1; X <= Math.ceil(X1); X++) {
          const dx = X + 0.5 - t.x, dy = Y + 0.5 - t.y;
          const ix = Math.floor(t.rx + dx * t.c + dy * t.s), iy = Math.floor(t.ry - dx * t.s + dy * t.c);
          if (ix < 0 || iy < 0 || ix >= w || iy >= h) continue;
          const i = iy * w + ix, o = own[i];
          if (o < 0 || (o !== k && !(joint[i] && this.bones[o].parent === k))) continue;
          buf.pset(flip ? x + w - 1 - X : x + X, y + Y, px[i]);
        }
    }
  }

  boneColor(name) {
    const k = typeof name === "number" ? name : this.index(name);
    return P.BONE_COLS[k % P.BONE_COLS.length];
  }

  ownerMap(opt = {}) {
    if (!this.owner) this.bind();
    const { w, h, px } = this.src, out = new Buf(w, h), k = opt.mix ?? 0.65;
    for (let i = 0; i < w * h; i++) {
      const o = this.owner[i];
      if (o >= 0) out.px[i] = P.col(P.mix(P.unpack(px[i]), this.boneColor(o), this.joint[i] ? k * 0.4 : k));
    }
    return out;
  }

  legend(scale = 2) {
    const lh = 6 * scale, out = new Buf(Math.max(...this.bones.map((b) => P.textWidth(b.name, scale))) + 6 * scale + 6, this.bones.length * lh + 3);
    out.clear([22, 22, 26]);
    this.bones.forEach((b, k) => {
      const y = 2 + k * lh;
      out.rect(2, y, 2 + 5 * scale, y + 5 * scale, this.boneColor(k));
      P.text(out, 4 + 6 * scale, y, b.name, [235, 235, 235], scale);
    });
    return out;
  }

  drawBones(buf, x, y, p = {}, opt = {}) {
    const T = this.pose(p), s = opt.scale ?? 1, w = this.src.w, flip = !!opt.flip;
    const map = ([qx, qy]) => [x + (flip ? w - qx : qx) * s, y + qy * s];
    this.bones.forEach((b, k) => {
      const [ax, ay] = map([T[k].x, T[k].y]), [bx, by] = map(Rig.apply(T[k], b.ex, b.ey));
      buf.line(ax, ay, bx, by, opt.color ?? [80, 200, 255]);
    });
    this.bones.forEach((_, k) => {
      const [ax, ay] = map([T[k].x, T[k].y]);
      buf.rect(ax - 1, ay - 1, ax + 2, ay + 2, opt.joint ?? [255, 210, 80]);
    });
  }
}
P.Rig = Rig;

P.strip = (pts, r) => {
  const n = pts.length, d = [];
  for (let i = 0; i < n - 1; i++) {
    const dx = pts[i + 1][0] - pts[i][0], dy = pts[i + 1][1] - pts[i][1], l = Math.hypot(dx, dy) || 1;
    d.push([dx / l, dy / l]);
  }
  const head = [pts[0][0] - d[0][0] * r, pts[0][1] - d[0][1] * r], tail = [pts[n - 1][0] + d[n - 2][0] * r, pts[n - 1][1] + d[n - 2][1] * r];
  const P2 = [head, ...pts, tail], D = [d[0], ...d, d[n - 2]], N = [];
  for (let i = 0; i < P2.length; i++) {
    const a = D[Math.max(0, i - 1)], b = D[Math.min(D.length - 1, i)];
    let nx = -(a[1] + b[1]), ny = a[0] + b[0];
    const l = Math.hypot(nx, ny) || 1;
    (nx /= l), (ny /= l);
    const m = Math.min(2, 1 / Math.max(0.5, nx * -b[1] + ny * b[0]));
    N.push([nx * m * r, ny * m * r]);
  }
  return P2.map((p, i) => [[p[0] - N[i][0], p[1] - N[i][1]], [p[0] + N[i][0], p[1] + N[i][1]]]);
};
P.invBilinear = (px, py, a, b, c, d) => {
  const ex = b[0] - a[0], ey = b[1] - a[1], fx = d[0] - a[0], fy = d[1] - a[1];
  const gx = a[0] - b[0] + c[0] - d[0], gy = a[1] - b[1] + c[1] - d[1], hx = px - a[0], hy = py - a[1];
  const k2 = gx * fy - gy * fx, k1 = ex * fy - ey * fx + hx * gy - hy * gx, k0 = hx * ey - hy * ex;
  const uOf = (v) => {
    const dx = ex + gx * v, dy = ey + gy * v;
    return Math.abs(dx) > Math.abs(dy) ? (hx - fx * v) / dx : (hy - fy * v) / dy;
  };
  if (Math.abs(k2) < 1e-9) {
    const v = -k0 / k1;
    return [uOf(v), v];
  }
  let w = k1 * k1 - 4 * k0 * k2;
  if (w < 0) return null;
  w = Math.sqrt(w);
  const v1 = (-k1 - w) / (2 * k2), u1 = uOf(v1);
  if (u1 >= 0 && u1 <= 1 && v1 >= 0 && v1 <= 1) return [u1, v1];
  const v2 = (-k1 + w) / (2 * k2);
  return [uOf(v2), v2];
};
P.bend = (buf, src, rest, pose, opt = {}) => {
  let reach = opt.reach;
  if (!reach) {
    reach = 1;
    for (let y = 0; y < src.h; y++)
      for (let x = 0; x < src.w; x++) {
        if (!(src.px[y * src.w + x] >>> 24)) continue;
        let d = Infinity;
        for (let i = 0; i < rest.length - 1; i++) d = Math.min(d, P.segDist2(x + 0.5, y + 0.5, rest[i][0], rest[i][1], rest[i + 1][0], rest[i + 1][1]));
        reach = Math.max(reach, Math.sqrt(d) + 1.5);
      }
  }
  const R = P.strip(rest, reach), Q = P.strip(pose, reach);
  const X0 = Math.floor(Math.min(...Q.flat().map((p) => p[0]))), X1 = Math.ceil(Math.max(...Q.flat().map((p) => p[0])));
  const Y0 = Math.floor(Math.min(...Q.flat().map((p) => p[1]))), Y1 = Math.ceil(Math.max(...Q.flat().map((p) => p[1])));
  const BW = X1 - X0 + 1, done = new Uint8Array(BW * (Y1 - Y0 + 1));
  for (let i = 0; i < Q.length - 1; i++) {
    const a = Q[i][0], b = Q[i + 1][0], c = Q[i + 1][1], d = Q[i][1];
    const ra = R[i][0], rb = R[i + 1][0], rc = R[i + 1][1], rd = R[i][1];
    const qx0 = Math.floor(Math.min(a[0], b[0], c[0], d[0])), qx1 = Math.ceil(Math.max(a[0], b[0], c[0], d[0]));
    const qy0 = Math.floor(Math.min(a[1], b[1], c[1], d[1])), qy1 = Math.ceil(Math.max(a[1], b[1], c[1], d[1]));
    for (let Y = qy0; Y <= qy1; Y++)
      for (let X = qx0; X <= qx1; X++) {
        const di = (Y - Y0) * BW + X - X0;
        if (done[di]) continue;
        const uv = P.invBilinear(X + 0.5, Y + 0.5, a, b, c, d);
        if (!uv || uv[0] < -1e-6 || uv[0] > 1 + 1e-6 || uv[1] < -1e-6 || uv[1] > 1 + 1e-6) continue;
        const [u, v] = uv, iu = 1 - u, iv = 1 - v;
        const sx = Math.floor(ra[0] * iu * iv + rb[0] * u * iv + rc[0] * u * v + rd[0] * iu * v);
        const sy = Math.floor(ra[1] * iu * iv + rb[1] * u * iv + rc[1] * u * v + rd[1] * iu * v);
        if (sx < 0 || sy < 0 || sx >= src.w || sy >= src.h) continue;
        const col = src.px[sy * src.w + sx];
        if (!(col >>> 24)) continue;
        done[di] = 1;
        buf.pset(X, Y, col);
      }
  }
};
P.wave = (pts, t, amp, len, opt = {}) => {
  const n = pts.length, s = [0];
  for (let i = 1; i < n; i++) s.push(s[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
  const L = s[n - 1] || 1, from = opt.from ?? 0;
  return pts.map((p, i) => {
    const a = pts[Math.max(0, i - 1)], b = pts[Math.min(n - 1, i + 1)], dx = b[0] - a[0], dy = b[1] - a[1], l = Math.hypot(dx, dy) || 1;
    const k = P.clamp((s[i] / L - from) / (1 - from || 1)), off = amp * k * Math.sin(Math.PI * 2 * (s[i] / len - t));
    return [p[0] - (dy / l) * off, p[1] + (dx / l) * off];
  });
};

P.FONT = {
  A: "010101111101101", B: "110101110101110", C: "011100100100011", D: "110101101101110", E: "111100110100111",
  F: "111100110100100", G: "011100101101011", H: "101101111101101", I: "111010010010111", J: "001001001101010",
  K: "101101110101101", L: "100100100100111", M: "101111111101101", N: "110101101101101", O: "010101101101010",
  P: "110101110100100", Q: "010101101110011", R: "110101110101101", S: "011100010001110", T: "111010010010010",
  U: "101101101101111", V: "101101101101010", W: "101101111111101", X: "101101010101101", Y: "101101010010010",
  Z: "111001010100111", 0: "111101101101111", 1: "010110010010111", 2: "110001010100111", 3: "110001010001110",
  4: "101101111001001", 5: "111100110001110", 6: "011100111101111", 7: "111001010010010", 8: "111101111101111",
  9: "111101111001110", "-": "000000111000000", ".": "000000000000010", ":": "000010000010000", "/": "001001010100100",
  "+": "000010111010000", "(": "010100100100010", ")": "010001001001010", "#": "101111101111101",
};
P.textWidth = (str, scale = 1) => Math.max(0, String(str).length * 4 - 1) * scale;
P.text = (buf, x, y, str, color, scale = 1) => {
  const c = P.col(color);
  let cx = x;
  for (const ch of String(str).toUpperCase()) {
    const g = P.FONT[ch];
    if (g) for (let j = 0; j < 5; j++) for (let i = 0; i < 3; i++) if (g[j * 3 + i] === "1") buf.rect(cx + i * scale, y + j * scale, cx + (i + 1) * scale, y + (j + 1) * scale, c);
    cx += 4 * scale;
  }
  return cx - x;
};

P.sheet = (items, opt = {}) => {
  const gap = opt.gap ?? 6, ls = opt.labelScale ?? 2, fit = opt.fit;
  const cells = items.map((it) => {
    const o = it instanceof Buf ? { buf: it } : it;
    let b = o.buf;
    if (fit && b.h > fit && !o.scale) b = P.resize(b, Math.max(1, Math.round((b.w * fit) / b.h)), fit, { alpha: 0.01 });
    const s = o.scale ?? opt.scale ?? (fit ? Math.max(1, Math.floor(fit / b.h)) : 1);
    return { b, s, label: o.label == null ? "" : String(o.label), w: b.w * s, h: b.h * s };
  });
  const cols = Math.max(1, Math.min(opt.cols ?? cells.length, cells.length)), rows = Math.ceil(cells.length / cols);
  const lh = cells.some((c) => c.label) ? 5 * ls + 4 : 0, cw = Array(cols).fill(0), rh = Array(rows).fill(0);
  cells.forEach((c, i) => {
    cw[i % cols] = Math.max(cw[i % cols], c.w, P.textWidth(c.label, ls));
    rh[(i / cols) | 0] = Math.max(rh[(i / cols) | 0], c.h);
  });
  const W = gap + cw.reduce((a, v) => a + v + gap, 0), H = gap + rh.reduce((a, v) => a + v + lh + gap, 0), out = new Buf(W, H);
  out.clear(opt.bg ?? [22, 22, 26]);
  const k1 = P.col(opt.check ? opt.check[0] : [44, 44, 50]), k2 = P.col(opt.check ? opt.check[1] : [36, 36, 42]), ink = opt.ink ?? [235, 235, 235];
  let y0 = gap;
  for (let r = 0; r < rows; r++) {
    let x0 = gap;
    for (let c = 0; c < cols; c++) {
      const cell = cells[r * cols + c];
      if (cell) {
        if (cell.label) P.text(out, x0, y0, cell.label, ink, ls);
        const top = y0 + lh, { b, s } = cell;
        for (let j = 0; j < cell.h; j++)
          for (let i = 0; i < cell.w; i++) {
            const v = b.px[((j / s) | 0) * b.w + ((i / s) | 0)];
            out.px[(top + j) * W + x0 + i] = v >>> 24 ? v : ((i >> 3) ^ (j >> 3)) & 1 ? k1 : k2;
          }
      }
      x0 += cw[c] + gap;
    }
    y0 += rh[r] + lh + gap;
  }
  return out;
};

P.pack = (frames, opt = {}) => {
  const fw = frames[0].w, fh = frames[0].h, pad = opt.pad ?? 0;
  if (frames.some((f) => f.w !== fw || f.h !== fh)) throw new Error("all frames must be the same size");
  const cols = Math.max(1, Math.min(opt.cols ?? frames.length, frames.length)), rows = Math.ceil(frames.length / cols);
  const out = new Buf(cols * (fw + pad) - pad, rows * (fh + pad) - pad);
  frames.forEach((f, i) => {
    const x0 = (i % cols) * (fw + pad), y0 = ((i / cols) | 0) * (fh + pad);
    for (let j = 0; j < fh; j++) out.px.set(f.px.subarray(j * fw, (j + 1) * fw), (y0 + j) * out.w + x0);
  });
  out.frame = { w: fw, h: fh, cols, rows, count: frames.length, pad };
  return out;
};

P.ruler = (buf, scale = 4, opt = {}) => {
  const step = opt.step ?? 8, ink = opt.ink ?? [235, 235, 235], line = opt.line ?? [255, 90, 160];
  const ml = P.textWidth(String(Math.max(buf.w, buf.h))) + 4, mt = 9, W = buf.w * scale + ml + 1, H = buf.h * scale + mt + 1, out = new Buf(W, H);
  out.clear(opt.bg ?? [22, 22, 26]);
  const k1 = P.col([44, 44, 50]), k2 = P.col([36, 36, 42]);
  for (let j = 0; j < buf.h * scale; j++)
    for (let i = 0; i < buf.w * scale; i++) {
      const v = buf.px[((j / scale) | 0) * buf.w + ((i / scale) | 0)];
      out.px[(mt + j) * W + ml + i] = v >>> 24 ? v : ((i >> 3) ^ (j >> 3)) & 1 ? k1 : k2;
    }
  const tint = (x, y) => out.put(y * W + x, P.col(P.mix(P.unpack(out.px[y * W + x]), line, 0.55)));
  for (let gx = 0; gx <= buf.w; gx += step) {
    for (let y = mt - 2; y < H; y++) tint(ml + gx * scale, y);
    P.text(out, ml + gx * scale + 2, 1, gx, ink);
  }
  for (let gy = 0; gy <= buf.h; gy += step) {
    for (let x = ml - 2; x < W; x++) tint(x, mt + gy * scale);
    P.text(out, 1, mt + gy * scale + 2, gy, ink);
  }
  out.ox = -ml;
  out.oy = -mt;
  return out;
};

P.lzw = (idx, mcs) => {
  const out = [], clear = 1 << mcs, eoi = clear + 1;
  let cur = 0, bits = 0, size = mcs + 1, next = eoi + 1, dict = new Map();
  const emit = (c) => {
    cur |= c << bits;
    bits += size;
    while (bits >= 8) out.push(cur & 255), (cur >>>= 8), (bits -= 8);
  };
  emit(clear);
  let pre = idx[0];
  for (let i = 1; i < idx.length; i++) {
    const k = idx[i], key = pre * 256 + k, v = dict.get(key);
    if (v !== undefined) {
      pre = v;
      continue;
    }
    emit(pre);
    if (next === 4096) {
      emit(clear);
      dict = new Map();
      size = mcs + 1;
      next = eoi + 1;
    } else {
      if (next >= 1 << size) size++;
      dict.set(key, next++);
    }
    pre = k;
  }
  emit(pre);
  emit(eoi);
  if (bits > 0) out.push(cur & 255);
  return out;
};
P.gif = (frames, opt = {}) => {
  const s = opt.scale ?? 1, fr = s > 1 ? frames.map((f) => f.scaled(s)) : frames, W = fr[0].w, H = fr[0].h;
  if (fr.some((f) => f.w !== W || f.h !== H)) throw new Error("all frames must be the same size");
  let trans = false;
  const set = new Set();
  for (const f of fr) for (const c of f.px) if (!(c >>> 24)) trans = true; else if (set.size <= 256) set.add(c);
  const room = trans ? 255 : 256, base = trans ? 1 : 0;
  let pal;
  if (set.size <= room) pal = [...set].map(P.unpack);
  else {
    const step = Math.max(1, Math.floor(fr.length / 12)), pick = fr.filter((_, i) => i % step === 0), all = new Buf(W, H * pick.length);
    pick.forEach((f, i) => all.px.set(f.px, i * W * H));
    pal = P.quantize(all, room).palette;
  }
  const map = new Map(), look = (c) => {
    let k = map.get(c);
    if (k === undefined) map.set(c, (k = P.nearest(pal, P.unpack(c)) + base));
    return k;
  };
  const bits = Math.max(1, Math.ceil(Math.log2(pal.length + base))), mcs = Math.max(2, bits), out = [];
  const w16 = (v) => out.push(v & 255, (v >> 8) & 255), str = (t) => out.push(...[...t].map((ch) => ch.charCodeAt(0)));
  str("GIF89a");
  w16(W);
  w16(H);
  out.push(0xf0 | (bits - 1), 0, 0);
  for (let i = 0; i < 1 << bits; i++) {
    const c = i >= base ? pal[i - base] : null;
    out.push(c ? c[0] : 0, c ? c[1] : 0, c ? c[2] : 0);
  }
  out.push(0x21, 0xff, 0x0b);
  str("NETSCAPE2.0");
  out.push(3, 1);
  w16(opt.loop ?? 0);
  out.push(0);
  fr.forEach((f, n) => {
    const d = Array.isArray(opt.delay) ? opt.delay[n % opt.delay.length] : opt.delay ?? 80;
    out.push(0x21, 0xf9, 4, trans ? 9 : 0);
    w16(Math.max(2, Math.round(d / 10)));
    out.push(0, 0, 0x2c);
    w16(0);
    w16(0);
    w16(W);
    w16(H);
    out.push(0, mcs);
    const idx = new Uint8Array(W * H);
    for (let i = 0; i < idx.length; i++) idx[i] = f.px[i] >>> 24 ? look(f.px[i]) : 0;
    const data = P.lzw(idx, mcs);
    for (let i = 0; i < data.length; i += 255) {
      const part = data.slice(i, i + 255);
      out.push(part.length);
      for (const v of part) out.push(v);
    }
    out.push(0);
  });
  out.push(0x3b);
  return typeof Buffer !== "undefined" ? Buffer.from(out) : new Uint8Array(out);
};

P.blit = (buf, ctx, x = 0, y = 0) => ctx.putImageData(new ImageData(new Uint8ClampedArray(buf.px.buffer.slice(0)), buf.w, buf.h), x, y);

P.crc = (() => {
  const T = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    T[n] = c >>> 0;
  }
  return (b) => {
    let c = 0xffffffff;
    for (let i = 0; i < b.length; i++) c = T[(c ^ b[i]) & 255] ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
  };
})();

P.png = (buf) => {
  const zlib = require("zlib");
  const w = buf.w, h = buf.h, raw = Buffer.alloc((w * 4 + 1) * h), rgba = buf.rgba();
  for (let y = 0; y < h; y++) {
    raw[y * (w * 4 + 1)] = 0;
    Buffer.from(rgba.buffer, y * w * 4, w * 4).copy(raw, y * (w * 4 + 1) + 1);
  }
  const chunk = (type, data) => {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length);
    const td = Buffer.concat([Buffer.from(type), data]), crc = Buffer.alloc(4);
    crc.writeUInt32BE(P.crc(td));
    return Buffer.concat([len, td, crc]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk("IHDR", ihdr), chunk("IDAT", zlib.deflateSync(raw)), chunk("IEND", Buffer.alloc(0))]);
};

P.loopNoise = (x, y, t, T, sp, oct = 3, s = 0) => {
  const p = (((t % T) + T) % T) / T, a = P.fbm(x, y - t * sp, oct, s) - 0.5, b = P.fbm(x, y - (t - T) * sp, oct, s) - 0.5;
  return 0.5 + (a * (1 - p) + b * p) / Math.hypot(1 - p, p);
};

P.blend = (buf, x, y, rgb, a) => {
  if (a <= 0) return;
  const c = buf.get(x, y);
  buf.pset(x, y, c >>> 24 ? P.col(P.mix(P.unpack(c), rgb, a)) : P.col(rgb));
};

P.WBuf = class extends P.Buf {
  pset(x, y, c) {
    super.pset((((Math.round(x) - this.ox) % this.w) + this.w) % this.w + this.ox, y, c);
  }
  get(x, y) {
    return super.get((((Math.round(x) - this.ox) % this.w) + this.w) % this.w + this.ox, y);
  }
};

P.tileX = (fn, x, period, m = 24) => {
  const xm = ((x % period) + period) % period, w = P.clamp((xm - (period - m)) / m);
  if (w <= 0) return fn(xm);
  const s = w * w * (3 - 2 * w);
  return fn(xm) * (1 - s) + fn(xm - period) * s;
};

P.tile = (fn, period, m = 24) => (x, y) => P.tileX((xx) => fn(xx, y), x, period, m);

P.wrapBlit = (dst, src, shift) => {
  const s = Math.round(shift), P0 = src.w;
  for (let y = 0; y < Math.min(dst.h, src.h); y++)
    for (let x = 0; x < dst.w; x++) {
      const c = src.px[y * P0 + ((((x + s) % P0) + P0) % P0)];
      if (c >>> 24) dst.px[y * dst.w + x] = c;
    }
};

P.voronoi = (x, y, s = 0) => {
  const ix = Math.floor(x), iy = Math.floor(y);
  let f1 = 9, f2 = 9, cx = 0, cy = 0;
  for (let dy = -1; dy <= 1; dy++)
    for (let dx = -1; dx <= 1; dx++) {
      const gx = ix + dx, gy = iy + dy, px = gx + P.hash(gx, gy, s), py = gy + P.hash(gx, gy, s + 1), d = Math.hypot(x - px, y - py);
      if (d < f1) { f2 = f1; f1 = d; cx = gx; cy = gy; } else if (d < f2) f2 = d;
    }
  return { f1, f2, edge: f2 - f1, cx, cy, r: P.hash(cx, cy, s + 2) };
};

P.rockHeight = (o = {}) => {
  const sx = o.sx ?? 28, sy = o.sy ?? 14, s = o.seed ?? 1, crack = o.crack ?? 0.1, tilt = o.tilt ?? 1.3, warp = o.warp ?? 10, sub = o.sub ?? 0.45;
  const facet = (x, y, ax, ay, ss) => {
    const v = P.voronoi(x / ax, y / ay, ss);
    const tx = (P.hash(v.cx, v.cy, ss + 3) - 0.5) * tilt, ty = (P.hash(v.cx, v.cy, ss + 4) - 0.62) * tilt;
    return { h: tx * (x / ax - v.cx) + ty * (y / ay - v.cy) + v.r * 0.35, c: Math.max(0, 1 - v.edge / crack) };
  };
  return (x, y) => {
    const wx = x + (P.fbm(x * 0.03, y * 0.03, 2, s + 11) - 0.5) * warp * 2, wy = y + (P.fbm(x * 0.03, y * 0.03, 2, s + 13) - 0.5) * warp;
    const a = facet(wx, wy, sx, sy, s), b = facet(wx, wy, sx * 0.42, sy * 0.5, s + 20);
    const keep = P.clamp((P.fbm(x * 0.05, y * 0.05, 2, s + 15) - 0.5) * 4 + 0.5);
    let h = a.h + b.h * sub * 0.6 + P.fbm(x * 0.012, y * 0.02, 2, s + 5) * 1.2 + P.fbm(x * 0.09, y * 0.09, 3, s + 7) * 0.35 + P.fbm(x * 0.4, y * 0.4, 2, s + 9) * 0.07;
    h -= a.c * 0.5 * (0.5 + 0.5 * P.fbm(x * 0.07, y * 0.07, 2, s + 17)) + b.c * 0.3 * keep;
    return h;
  };
};

P.surface = (buf, o) => {
  const L = o.light || [-0.55, -0.65, 0.52], ll = Math.hypot(...L), lx = L[0] / ll, ly = L[1] / ll, lz = L[2] / ll;
  const k = o.relief ?? 4, amb = o.ambient ?? 0.28, pal = o.cols.map(P.col), mossPal = o.moss ? o.moss.map(P.col) : null;
  const x0 = Math.max(o.x0 ?? buf.ox, buf.ox), x1 = Math.min(o.x1 ?? buf.ox + buf.w, buf.ox + buf.w);
  const y0 = Math.max(o.y0 ?? buf.oy, buf.oy), y1 = Math.min(o.y1 ?? buf.oy + buf.h, buf.oy + buf.h);
  for (let y = y0; y < y1; y++)
    for (let x = x0; x < x1; x++) {
      if (o.mask && !o.mask(x, y)) continue;
      const h = o.height(x, y), nx = -(o.height(x + 1, y) - o.height(x - 1, y)) * k, ny = -(o.height(x, y + 1) - o.height(x, y - 1)) * k;
      const nl = Math.hypot(nx, ny, 1), dif = Math.max(0, (nx * lx + ny * ly + lz) / nl);
      const ao = P.clamp(0.55 + (h - (o.height(x - 3, y) + o.height(x + 3, y) + o.height(x, y - 3) + o.height(x, y + 3)) / 4) * 2.2, 0, 1);
      let lum = (amb + (1 - amb) * dif) * (0.45 + 0.55 * ao) * (o.shade ? o.shade(x, y) : 1) * (o.gain ?? 1);
      const up = -ny / nl;
      if (mossPal && up > (o.mossUp ?? 0.18) && P.fbm(x * 0.12, y * 0.12, 3, 41) > (o.mossCut ?? 0.5)) {
        buf.pset(x, y, mossPal[P.ditherIndex(P.clamp(lum * 1.15), mossPal.length, x, y, 0.15)]);
        continue;
      }
      buf.pset(x, y, pal[P.ditherIndex(P.clamp(lum), pal.length, x, y, o.dither ?? 0.15)]);
    }
};

P.reflect = (buf, o) => {
  const src = new P.Buf(buf.w, buf.h);
  src.ox = buf.ox; src.oy = buf.oy; src.px.set(buf.px);
  for (let y = o.y0; y < o.y1; y++) {
    const d = y - o.y0;
    for (let x = buf.ox; x < buf.ox + buf.w; x++) {
      if (o.mask && !o.mask(x, y)) continue;
      const wob = o.wob ? o.wob(x, d) : (P.loopNoise(x * 0.05, d * 0.7, o.t, o.T, o.sp ?? -0.4, 2, 61) - 0.5) * (1.5 + d * 0.35);
      const sy = o.y0 - 1 - Math.round(d * (o.squash ?? 1.4)), c = src.get(x + Math.round(wob), sy);
      const fade = P.clamp((o.keep ?? 0.5) - d * (o.falloff ?? 0.012));
      const base = P.ramp(o.cols, P.clamp(d / (o.y1 - o.y0)));
      buf.pset(x, y, P.col(P.mix(base, c ? P.unpack(c) : base, fade)));
    }
  }
};

P.mist = (buf, o) => {
  const al = o.alpha || [0.1, 0.2, 0.32, 0.46];
  for (let y = Math.floor(o.y - o.h); y <= o.y + o.below; y++)
    for (let x = Math.floor(o.x - o.w - 4); x <= Math.ceil(o.x + o.w + 4); x++) {
      const up = o.y - y, dx = (x - o.x) / (o.w * (0.65 + 0.35 * P.clamp(up / o.h))), dy = up > 0 ? up / o.h : -up / o.below;
      const nz = P.loopNoise(x * 0.07, y * 0.09, o.t, o.T, -(o.rise ?? 0.15), 3, 21);
      const v = (1 - dx * dx - dy * dy) * 0.85 + (nz - 0.5) * 1.5;
      if (v <= 0.06) continue;
      P.blend(buf, x, y, o.col, al[P.ditherIndex(P.clamp(v * 1.1), al.length, x, y, 0.3)] * (o.strength ?? 1));
    }
};

P.sky = (buf, o) => {
  const pal = o.cols.map(P.col);
  for (let y = o.y0 ?? buf.oy; y < o.y1; y++) {
    const v = 1 - (y - (o.y0 ?? buf.oy)) / (o.y1 - (o.y0 ?? buf.oy));
    for (let x = buf.ox; x < buf.ox + buf.w; x++) buf.pset(x, y, pal[P.ditherIndex((P.clamp(v) * pal.length) / (pal.length - 1), pal.length, x, y, o.dither ?? 0.15)]);
  }
};

P.tree = (buf, o) => {
  const r = P.rng(o.seed ?? 1), L = o.light || [-0.55, -0.65, 0.52], ll = Math.hypot(...L), lx = L[0] / ll, ly = L[1] / ll, lz = L[2] / ll;
  const cx = o.x + (r() - 0.5) * o.rx * 0.3, cy = o.base - o.h, amb = o.ambient ?? 0.3;
  const haze = (c) => (o.haze ? P.mix(c, o.hazeCol, o.haze) : c);
  const bark = o.bark.map((c) => P.col(haze(c))), leaf = o.cols.map((c) => P.col(haze(c)));
  const tw = o.trunk ?? 3, ty = cy + o.ry * 0.35;
  for (let y = Math.floor(ty); y <= o.base; y++) {
    const k = (o.base - y) / (o.base - ty), xc = o.x + (cx - o.x) * k * k, hw = tw * (1 - 0.45 * k) + (y > o.base - 3 ? (y - (o.base - 3)) * 0.6 : 0);
    for (let x = Math.floor(xc - hw); x <= Math.ceil(xc + hw); x++) {
      const u = (x - xc) / Math.max(hw, 0.5);
      if (Math.abs(u) > 1) continue;
      const v = 0.62 - u * 0.4 + (P.fbm(x * 0.9, y * 0.12, 2, 5) - 0.5) * 0.5;
      buf.pset(x, y, bark[P.ditherIndex(P.clamp(v), bark.length, x, y, 0.1)]);
    }
  }
  const n = o.clumps ?? 40, rmin = o.clumpR?.[0] ?? 4, rmax = o.clumpR?.[1] ?? 8, cl = [];
  for (let i = 0; i < n; i++) {
    const a = r() * Math.PI * 2, d = Math.sqrt(r()), sz = rmin + (rmax - rmin) * r();
    const px = cx + Math.cos(a) * o.rx * d, py = cy + Math.sin(a) * o.ry * d - (1 - d) * o.ry * 0.15;
    cl.push({ x: px, y: py, r: sz * (1 - 0.25 * d), z: (1 - d) * o.rx * 0.6 + r() * 2 });
    if (o.branches !== false && i % 7 === 0) {
      const bx = o.x + (cx - o.x) * 0.6, by = ty + (o.base - ty) * 0.1;
      buf.line(bx, by, px, py, bark[1], 1);
    }
  }
  const zmax = Math.max(...cl.map((c) => c.z + c.r));
  const X0 = Math.floor(cx - o.rx - rmax), X1 = Math.ceil(cx + o.rx + rmax), Y0 = Math.floor(cy - o.ry - rmax), Y1 = Math.ceil(cy + o.ry + rmax);
  for (let y = Y0; y <= Y1; y++)
    for (let x = X0; x <= X1; x++) {
      let best = null, bz = -1;
      for (const c of cl) {
        const dx = x - c.x, dy = y - c.y, d2 = dx * dx + dy * dy;
        if (d2 >= c.r * c.r) continue;
        const z = c.z + Math.sqrt(c.r * c.r - d2);
        if (z > bz) { bz = z; best = c; }
      }
      if (!best) continue;
      const nx = (x - best.x) / best.r, ny = (y - best.y) / best.r, q = Math.hypot(nx, ny), nz = Math.sqrt(Math.max(0, 1 - q * q));
      const lf = P.fbm(x * (o.leaf ?? 0.5), y * (o.leaf ?? 0.5), 2, (o.seed ?? 1) + 5);
      const crown = Math.hypot((x - cx) / (o.rx + rmax), (y - cy) / (o.ry + rmax));
      if (q > 0.68 && crown > 0.72 && lf < 0.3 + (q - 0.68) * 1.6) continue;
      let dif = Math.max(0, nx * lx + ny * ly + nz * lz) + (lf - 0.5) * 0.7;
      const low = P.clamp((y - (cy - o.ry * 0.3)) / (o.ry * 1.3));
      const lum = (amb + (1 - amb) * P.clamp(dif)) * (1 - 0.4 * low) * (0.6 + 0.4 * bz / zmax) * (q > 0.82 ? 0.8 : 1) * (o.gain ?? 1.05);
      buf.pset(x, y, leaf[P.ditherIndex(P.clamp(lum), leaf.length, x, y, 0.15)]);
    }
};

P.grass = (buf, o) => {
  const r = P.rng(o.seed ?? 3), pal = o.cols.map(P.col), Pd = o.period;
  for (let i = 0; i < o.count; i++) {
    const x0 = o.x0 + r() * (o.x1 - o.x0), keep = r(), hr = r(), lr = r(), ph = r() * 6, tr = r();
    if (o.density && keep > o.density(x0)) continue;
    const base = o.ground(x0), h = (o.hmin + hr * (o.hmax - o.hmin)) * (o.tall ? o.tall(x0) : 1), lean0 = (lr - 0.5) * h * 0.5;
    const sway = o.t === undefined ? 0 : Math.sin((o.t / o.T) * Math.PI * 2 * (o.freq ?? 1) + ph + x0 * 0.08) * (o.sway ?? 1);
    const tone = tr * 0.35;
    let xs = [x0];
    if (Pd) {
      const m = ((((x0 - (o.shift ?? 0)) % Pd) + Pd) % Pd);
      xs = [m, m - Pd].filter((v) => v > -15 && v < buf.w + 15);
    }
    for (const bx of xs)
      for (let k = 0; k <= h; k++) {
        const u = k / h, x = bx + (lean0 + sway) * u * u, y = base - k;
        buf.pset(x, y, pal[P.ditherIndex(P.clamp(0.15 + u * 0.75 + tone - 0.15), pal.length, Math.round(x), y, 0.2)]);
      }
  }
};

P.foliage = (buf, cl, o) => {
  cl = cl.slice();
  const L = o.light || [-0.55, -0.65, 0.52], ll = Math.hypot(...L), lx = L[0] / ll, ly = L[1] / ll, lz = L[2] / ll;
  const sl = Math.hypot(lx, ly), sx = lx / sl, sy = ly / sl, sd = o.shadowDist ?? 5;
  const pal = o.cols.map((c) => P.col(o.haze ? P.mix(c, o.hazeCol, o.haze) : c));
  const cell = o.cell ?? 2.2, amb = o.ambient ?? 0.22, seed = o.seed ?? 1, edge = o.edge ?? 0.7;
  let X0 = 1e9, X1 = -1e9, Y0 = 1e9, Y1 = -1e9, zmax = 0;
  if (o.wind) {
    let top = Infinity, bot = -Infinity;
    for (const c of cl) { top = Math.min(top, c.y); bot = Math.max(bot, c.y); }
    cl = cl.map((c, i) => {
      const hw = P.clamp((bot - c.y) / Math.max(1, bot - top)) * 0.7 + 0.3, ph = P.hash(i, seed, 77) * 0.35;
      return { ...c, x: c.x + Math.sin(Math.PI * 2 * (o.wind.phase - ph)) * o.wind.amp * hw, y: c.y + Math.cos(Math.PI * 2 * (o.wind.phase - ph)) * o.wind.amp * 0.3 * hw };
    });
  }
  for (const c of cl) {
    X0 = Math.min(X0, c.x - c.r); X1 = Math.max(X1, c.x + c.r); Y0 = Math.min(Y0, c.y - c.r); Y1 = Math.max(Y1, c.y + c.r);
    zmax = Math.max(zmax, c.z + c.r);
  }
  const top = (x, y) => {
    let best = null, bz = -1;
    for (const c of cl) {
      const dx = x - c.x, dy = y - c.y, d2 = dx * dx + dy * dy;
      if (d2 >= c.r * c.r) continue;
      const z = c.z + Math.sqrt(c.r * c.r - d2);
      if (z > bz) { bz = z; best = c; }
    }
    return [best, bz];
  };
  for (let y = Math.floor(Y0); y <= Math.ceil(Y1); y++)
    for (let x = Math.floor(X0); x <= Math.ceil(X1); x++) {
      const [c, bz] = top(x, y);
      if (!c) continue;
      const nx = (x - c.x) / c.r, ny = (y - c.y) / c.r, q = Math.hypot(nx, ny), nz = Math.sqrt(Math.max(0, 1 - q * q));
      const v = P.voronoi(x / cell, y / cell, seed), hc = P.hash(v.cx, v.cy, seed + 9);
      if (q > edge && hc < (q - edge) * 3.2) continue;
      if (o.gaps && hc < o.gaps && bz < zmax * 0.6) continue;
      const wf = o.wind ? Math.sin(Math.PI * 2 * (o.wind.phase + P.hash(v.cx, v.cy, seed + 5))) * (o.wind.flutter ?? 0.35) : 0;
      const tx = (P.hash(v.cx, v.cy, seed + 3) - 0.5) * 0.9 + wf, ty = (P.hash(v.cx, v.cy, seed + 4) - 0.5) * 0.9 - wf * 0.5;
      const mx = nx + tx, my = ny + ty, mz = nz + 0.3, ml = Math.hypot(mx, my, mz);
      let dif = Math.max(0, (mx * lx + my * ly + mz * lz) / ml);
      const [sc, sz] = top(x + sx * sd, y + sy * sd);
      if (sc && sz > bz + 1) dif *= 0.35;
      let lum = (amb + (1 - amb) * dif) * (0.55 + 0.45 * bz / zmax);
      if (v.edge < 0.1) lum *= 0.7;
      lum *= o.gain ?? 1;
      buf.pset(x, y, pal[P.ditherIndex(P.clamp(lum), pal.length, x, y, 0.1)]);
    }
};

P.limb = (buf, x0, y0, x1, y1, w0, w1, pal) => {
  const len = Math.hypot(x1 - x0, y1 - y0) || 1, nx = -(y1 - y0) / len, ny = (x1 - x0) / len, n = Math.ceil(len * 2);
  for (let i = 0; i <= n; i++) {
    const u = i / n, x = x0 + (x1 - x0) * u, y = y0 + (y1 - y0) * u, w = w0 + (w1 - w0) * u;
    for (let k = -w; k <= w; k += 0.5) {
      const s = (k / Math.max(w, 0.5)) * Math.sign(nx || 1), px = Math.round(x + nx * k), py = Math.round(y + ny * k);
      const v = 0.6 - s * 0.35 + (P.fbm(px * 0.9, py * 0.15, 2, 5) - 0.5) * 0.4;
      buf.pset(px, py, pal[P.ditherIndex(P.clamp(v), pal.length, px, py, 0.1)]);
    }
  }
};

P.branchTree = (buf, o) => {
  const r = P.rng(o.seed ?? 1), cl = [], bark = o.bark.map((c) => P.col(o.haze ? P.mix(c, o.hazeCol, o.haze) : c));
  const cr = o.clumpR || [4, 7], up = o.up ?? 0.25, tips = [];
  const grow = (x, y, a, len, w, d) => {
    const x1 = x + Math.cos(a) * len, y1 = y + Math.sin(a) * len;
    P.limb(buf, x, y, x1, y1, w, w * 0.7, bark);
    if (d <= (o.midLeaves ?? 1)) cl.push({ x: (x + x1) / 2 + (r() - 0.5) * 3, y: (y + y1) / 2 + (r() - 0.5) * 3, r: cr[0] + (cr[1] - cr[0]) * r() * 0.7, z: r() * 6 });
    if (d === 0) {
      tips.push([x1, y1]);
      for (let i = 0; i < (o.tipClumps ?? 3); i++) cl.push({ x: x1 + (r() - 0.5) * cr[1] * 1.3, y: y1 + (r() - 0.5) * cr[1] * 0.9, r: cr[0] + (cr[1] - cr[0]) * r(), z: 4 + r() * 8 });
      return;
    }
    const n = 2 + (r() < (o.three ?? 0.4) ? 1 : 0);
    for (let i = 0; i < n; i++) {
      let na = a + (n === 1 ? 0 : (i / (n - 1) - 0.5) * 2 * o.spread) + (r() - 0.5) * (o.jitter ?? 0.4);
      na = na + (-Math.PI / 2 - na) * up;
      grow(x1, y1, na, len * (o.decay ?? 0.72) * (0.8 + r() * 0.4), w * 0.66, d - 1);
    }
  };
  grow(o.x, o.base, -Math.PI / 2 + (r() - 0.5) * 0.15 + (o.lean ?? 0), o.trunk, o.width, o.depth);
  if (o.hang)
    for (const [tx, ty] of tips) {
      const L = o.hang * (0.55 + 0.45 * r()), drift = (r() - 0.5) * 0.12, z0 = 3 + r() * 8;
      for (let k = 0; k * 1.8 < L && ty + k * 1.8 < (o.hangTo ?? Infinity); k++) cl.push({ x: tx + drift * k + Math.sin(k * 0.4 + tx) * 0.6, y: ty + k * 1.8, r: 2.4 - (k * 1.8 / L) * 0.8, z: z0 - k * 0.05 });
    }
  P.foliage(buf, cl, { ...o, cols: o.cols });
};

P.conifer = (buf, o) => {
  const r = P.rng(o.seed ?? 1), bark = o.bark.map((c) => P.col(o.haze ? P.mix(c, o.hazeCol, o.haze) : c)), cl = [];
  const topY = o.base - o.h;
  P.limb(buf, o.x, o.base, o.x, topY + 2, o.width ?? 1.6, 0.5, bark);
  for (let y = topY + 2; y < o.base - (o.bare ?? 6); y += 2.2 + r() * 0.8) {
    const k = (y - topY) / (o.base - topY), w = o.rx * k * (0.8 + r() * 0.4);
    for (const side of [-1, 1])
      for (let s = 0; s <= w; s += 1.8) cl.push({ x: o.x + side * s, y: y + s * 0.4 + (r() - 0.5), r: 2.6 - (s / Math.max(w, 1)) * 0.9, z: (w - s) * 0.35 + r() * 2 });
    cl.push({ x: o.x + (r() - 0.5) * 2, y: y + 1, r: 2.4, z: w * 0.4 + 2 });
  }
  cl.push({ x: o.x, y: topY + 1, r: 1.6, z: 3 });
  P.foliage(buf, cl, { cell: 1.7, edge: 0.6, ...o });
};

P.clouds = (buf, o) => {
  const L = o.sun || [-0.65, -0.75], ll = Math.hypot(...L), sx = L[0] / ll, sy = L[1] / ll, pal = o.cols;
  const val = (x, y) => {
    const h = (o.base - y) / o.h;
    if (h < -0.6 || h > 1.4) return -1;
    let v = P.loopNoise(y * 0.06 + P.fbm(x * 0.02, y * 0.05, 2, 91) * 1.5, x * 0.022, o.t, o.T, (o.drift ?? 0.15) * 0.022, 4, o.seed ?? 81) - 0.52 + 0.2 * (1 - Math.abs(h - 0.4) * 1.4);
    if (h < 0) v += h * 0.5;
    return v * (o.amount ?? 1);
  };
  for (let y = Math.floor(o.base - o.h * 1.4); y <= o.base + 3; y++)
    for (let x = buf.ox; x < buf.ox + buf.w; x++) {
      const v = val(x, y);
      if (v <= 0) continue;
      const lit = v - val(x + sx * 3, y + sy * 3), h = (o.base - y) / o.h;
      let lum = 0.55 + lit * 3 - P.clamp((0.25 - h) * 2) * 0.25;
      const k = P.ditherIndex(P.clamp(lum), pal.length, x, y, 0.15), a = v < 0.03 ? 0.3 : v < 0.07 ? 0.65 : 1;
      P.blend(buf, x, y, P.mix(pal[k], o.hazeCol || pal[k], o.haze ?? 0), a);
    }
};
P.blitScaled = (dst, dw, dh, src, shift, S, y0 = 0, y1 = src.h) => {
  const s = Math.round(shift * S), Pw = src.w, xi = new Int32Array(dw);
  for (let X = 0; X < dw; X++) xi[X] = ((Math.floor((X + s) / S) % Pw) + Pw) % Pw;
  for (let Y = Math.max(0, y0 * S); Y < Math.min(dh, y1 * S); Y++) {
    const sb = ((Y / S) | 0) * Pw, db = Y * dw;
    for (let X = 0; X < dw; X++) {
      const c = src.px[sb + xi[X]];
      if (c >>> 24) dst[db + X] = c;
    }
  }
};

P.leafFlicker = (base, moved, frames, o = {}) => {
  const Pw = base.w, H = base.h, leaves = [], density = o.density ?? 0.07, y1 = o.maxY ?? H;
  for (let y = 1; y < y1; y++)
    for (let x = 0; x < Pw; x++) {
      const i = y * Pw + x;
      if (!(base.px[i] >>> 24) || base.px[i] === moved.px[i]) continue;
      for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1]]) {
        const j = (y + dy) * Pw + ((x + dx + Pw) % Pw);
        if (base.px[j] >>> 24) continue;
        if (P.hash(x * 3 + dx + 7, y * 3 + dy + 7, 401) < density) leaves.push({ j, c: base.px[i], ph: P.hash(x, y, 409), len: 0.3 + P.hash(x, y, 419) * 0.25 });
      }
    }
  const out = [];
  for (let k = 0; k < frames; k++) {
    const b = new P.WBuf(Pw, H);
    b.px.set(base.px);
    for (const l of leaves) if ((k / frames + l.ph) % 1 < l.len) b.px[l.j] = l.c;
    out.push(b);
  }
  return out;
};

P.cap = (ax, ay, bx, by, ra, rb = ra) => ({ ax, ay, bx, by, ra, rb });
P.ell = (x, y, rx, ry, rot = 0) => ({ e: 1, x, y, rx, ry, rot });
P.shapeHeight = (p, x, y) => {
  if (p.e) {
    const c = Math.cos(p.rot || 0), s = Math.sin(p.rot || 0), dx = x - p.x, dy = y - p.y, u = (dx * c + dy * s) / p.rx, v = (-dx * s + dy * c) / p.ry, q = u * u + v * v;
    return q < 1 ? Math.sqrt(1 - q) * Math.min(p.rx, p.ry) : 0;
  }
  const dx = p.bx - p.ax, dy = p.by - p.ay, l2 = dx * dx + dy * dy || 1, u = P.clamp(((x - p.ax) * dx + (y - p.ay) * dy) / l2);
  const r = p.ra + (p.rb - p.ra) * u, d = Math.hypot(x - p.ax - dx * u, y - p.ay - dy * u);
  return d < r ? Math.sqrt(r * r - d * d) : 0;
};
P.solid = (buf, prims, cols, o = {}) => {
  const L = o.light || [-0.55, -0.65, 0.52], ll = Math.hypot(...L), lx = L[0] / ll, ly = L[1] / ll, lz = L[2] / ll;
  const pal = cols.map(P.col), k = o.k ?? 0.8, amb = o.ambient ?? 0.24, dark = o.dark ?? 1, gloss = o.gloss ?? 0, hl = Math.hypot(lx, ly, lz + 1), hx = lx / hl, hy = ly / hl, hz = (lz + 1) / hl;
  let X0 = 1e9, X1 = -1e9, Y0 = 1e9, Y1 = -1e9;
  for (const q of prims) {
    const r = q.e ? Math.max(q.rx, q.ry) : Math.max(q.ra, q.rb);
    X0 = Math.min(X0, (q.e ? q.x : Math.min(q.ax, q.bx)) - r); X1 = Math.max(X1, (q.e ? q.x : Math.max(q.ax, q.bx)) + r);
    Y0 = Math.min(Y0, (q.e ? q.y : Math.min(q.ay, q.by)) - r); Y1 = Math.max(Y1, (q.e ? q.y : Math.max(q.ay, q.by)) + r);
  }
  const Hf = (x, y) => {
    let s = 0, any = false;
    for (const q of prims) { const h = P.shapeHeight(q, x, y); if (h > 0) { s += Math.exp(h / k); any = true; } }
    return any ? k * Math.log(s) : 0;
  };
  const gx0 = Math.floor(X0) - 1, gy0 = Math.floor(Y0) - 1, gw = Math.ceil(X1) - gx0 + 2, gh = Math.ceil(Y1) - gy0 + 2;
  let grid = null;
  if (o.inflate) {
    const hp = new Float32Array(gw * gh), d = new Float32Array(gw * gh), cut = o.cut ?? 0.12, R = o.inflate, mix = o.inflateMix ?? 0.75;
    for (let j = 0; j < gh; j++) for (let i = 0; i < gw; i++) { const h = Hf(gx0 + i, gy0 + j); hp[j * gw + i] = h; d[j * gw + i] = h > cut ? 1e6 : 0; }
    for (let j = 0; j < gh; j++) for (let i = 0; i < gw; i++) {
      const k2 = j * gw + i;
      if (!d[k2]) continue;
      if (i > 0) d[k2] = Math.min(d[k2], d[k2 - 1] + 1);
      if (j > 0) d[k2] = Math.min(d[k2], d[k2 - gw] + 1, i > 0 ? d[k2 - gw - 1] + 1.414 : 1e6, i < gw - 1 ? d[k2 - gw + 1] + 1.414 : 1e6);
    }
    for (let j = gh - 1; j >= 0; j--) for (let i = gw - 1; i >= 0; i--) {
      const k2 = j * gw + i;
      if (!d[k2]) continue;
      if (i < gw - 1) d[k2] = Math.min(d[k2], d[k2 + 1] + 1);
      if (j < gh - 1) d[k2] = Math.min(d[k2], d[k2 + gw] + 1, i < gw - 1 ? d[k2 + gw + 1] + 1.414 : 1e6, i > 0 ? d[k2 + gw - 1] + 1.414 : 1e6);
    }
    grid = new Float32Array(gw * gh);
    for (let k2 = 0; k2 < grid.length; k2++) { const t = Math.min(d[k2], R); grid[k2] = d[k2] ? Math.sqrt(Math.max(0, R * R - (R - t) * (R - t))) * mix + hp[k2] * (1 - mix) : 0; }
  }
  const G = (x, y) => grid[(y - gy0) * gw + (x - gx0)];
  for (let y = Math.floor(Y0); y <= Math.ceil(Y1); y++)
    for (let x = Math.floor(X0); x <= Math.ceil(X1); x++) {
      const h = grid ? G(x, y) : Hf(x, y);
      if (h <= (grid ? 0 : o.cut ?? 0.12)) continue;
      const nx = grid ? -(G(x + 1, y) - G(x - 1, y)) / 2 : -(Hf(x + 0.5, y) - Hf(x - 0.5, y)), ny = grid ? -(G(x, y + 1) - G(x, y - 1)) / 2 : -(Hf(x, y + 0.5) - Hf(x, y - 0.5)), nl = Math.hypot(nx, ny, 1);
      let v = (amb + (1 - amb) * Math.max(0, (nx * lx + ny * ly + lz) / nl) + (gloss ? Math.pow(Math.max(0, (nx * hx + ny * hy + hz) / nl), o.shine ?? 10) * gloss : 0)) * dark;
      if (o.shade) v *= o.shade(x, y);
      buf.pset(x, y, pal[P.ditherIndex(P.clamp(v), pal.length, x, y, 0)]);
    }
};
P.ik = (hx, hy, fx, fy, l1, l2, dir) => {
  let d = Math.hypot(fx - hx, fy - hy);
  const base = Math.atan2(fy - hy, fx - hx);
  d = Math.min(d, l1 + l2 - 0.01);
  const a = Math.acos(P.clamp((l1 * l1 + d * d - l2 * l2) / (2 * l1 * d), -1, 1)), ang = base - dir * a;
  return [hx + Math.cos(ang) * l1, hy + Math.sin(ang) * l1];
};

class Gem {
  constructor(o = {}) {
    this.o = { size: 60, ior: 1.76, sigma: [0.32, 5.5, 4.2], tilt: 28, lean: -35, table: 0.57, crown: 0.32, pavilion: 0.86, exposure: 1.25, ss: 4, ...o };
    this.o.cols = o.cols || [[10, 1, 8], [28, 3, 14], [52, 5, 20], [82, 8, 26], [116, 12, 30], [152, 18, 36], [188, 28, 40], [218, 52, 54], [238, 92, 82], [250, 148, 132], [255, 206, 196], [255, 250, 248]];
    this.o.strips = o.strips || [[-2.5, -1.2, 0.35, 1.2, 14], [0.4, 0.75, 0.15, 0.9, 10], [2.2, 2.45, 0.2, 1.1, 8], [-0.6, -0.35, 0.9, 1.4, 12], [1.2, 1.9, 0.55, 0.8, 9], [-3.0, 3.0, 1.42, 1.6, 1.5], [0.9, 1.3, 0.1, 0.5, 9], [1.9, 2.2, 0.6, 1.0, 8], [0.2, 0.5, 0.95, 1.25, 7], [2.6, 3.1, -0.1, 0.25, 5], [-1.0, -0.6, -0.2, 0.1, 4]];
    const pol = (r, a, y) => [r * Math.cos(a), y, r * Math.sin(a)], D = (k) => (Math.PI / 4) * k, { table: rt, crown: hc, pavilion: hp } = this.o, sr = 0.78, lr = 0.45;
    const T = (k) => pol(rt, D(k), hc), S = (k) => pol(sr, D(k) + Math.PI / 8, hc * (1 - (sr - rt) / (1 - rt)));
    const G = (j) => pol(1, (Math.PI / 8) * j, 0), L = (k) => pol(lr, D(k) + Math.PI / 8, -hp * (1 - lr)), C = [0, -hp, 0];
    this.tris = [];
    for (let k = 0; k < 8; k++) {
      const k1 = (k + 1) % 8, km = (k + 7) % 8;
      this.tris.push([T(0), T(k), T(k1)], [T(k), S(km), G(2 * k)], [T(k), G(2 * k), S(k)], [T(k), S(k), T(k1)], [S(k), G(2 * k), G(2 * k + 1)], [S(k), G(2 * k + 1), G((2 * k + 2) % 16)]);
      this.tris.push([G(2 * k), L(km), C], [G(2 * k), C, L(k)], [G(2 * k), G(2 * k + 1), L(k)], [G(2 * k + 1), G((2 * k + 2) % 16), L(k)]);
    }
    this.pal = this.o.cols.map(P.col);
  }

  env(d) {
    const sm = (e0, e1, x) => { const t = P.clamp((x - e0) / (e1 - e0)); return t * t * (3 - 2 * t); };
    const az = Math.atan2(d[2], d[0]), el = Math.asin(P.clamp(d[1], -1, 1));
    let v = 0.002 + (el < -0.25 ? 0.02 : 0);
    for (const [a0, a1, e0, e1, s] of this.o.strips) {
      const m = (a0 + a1) / 2, h = (a1 - a0) * 0.32, me = (e0 + e1) / 2, he = (e1 - e0) * 0.4;
      const ea = Math.min(sm(m - h - 0.04, m - h + 0.04, az), 1 - sm(m + h - 0.04, m + h + 0.04, az)), ee = Math.min(sm(me - he - 0.04, me - he + 0.04, el), 1 - sm(me + he - 0.04, me + he + 0.04, el));
      v += Math.max(0, Math.min(ea, ee)) * s;
    }
    return v;
  }

  render(phi) {
    const o = this.o, dt = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2], sb = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]], ad = (a, b, s = 1) => [a[0] + b[0] * s, a[1] + b[1] * s, a[2] + b[2] * s];
    const nr = (a) => { const l = Math.hypot(...a); return a.map((v) => v / l); }, cr = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
    const rf = (d, n) => ad(d, n, -2 * dt(d, n)), rr = (d, n, eta) => { const c = -dt(d, n), k = 1 - eta * eta * (1 - c * c); return k < 0 ? null : ad(d.map((v) => v * eta), n, eta * c - Math.sqrt(k)); };
    const ti = (o.tilt * Math.PI) / 180, le = (o.lean * Math.PI) / 180, cy = Math.cos(phi), sy = Math.sin(phi), cx = Math.cos(ti), sx = Math.sin(ti), cz = Math.cos(le), sz = Math.sin(le);
    const M = (v) => { const x = v[0] * cy + v[2] * sy, z = -v[0] * sy + v[2] * cy, y2 = v[1] * cx - z * sx, z2 = v[1] * sx + z * cx; return [x * cz - y2 * sz, x * sz + y2 * cz, z2]; };
    const pl = [];
    for (const t of this.tris) {
      const a = M(t[0]), b = M(t[1]), c = M(t[2]);
      let n = nr(cr(sb(b, a), sb(c, a)));
      if (dt(n, [(a[0] + b[0] + c[0]) / 3, (a[1] + b[1] + c[1]) / 3, (a[2] + b[2] + c[2]) / 3]) < 0) n = n.map((v) => -v);
      if (!pl.some((q) => dt(q.n, n) > 0.9999 && Math.abs(dt(q.n, sb(a, q.p))) < 1e-6)) pl.push({ n, p: a });
    }
    const R0 = ((o.ior - 1) / (o.ior + 1)) ** 2;
    const trace = (or, d) => {
      let tin = -1e9, tout = 1e9, nin = null;
      for (const q of pl) {
        const dn = dt(q.n, d), t = dt(q.n, sb(q.p, or)) / dn;
        if (dn < 0) { if (t > tin) { tin = t; nin = q.n; } } else if (dn > 0 && t < tout) tout = t;
      }
      if (tin > tout || !nin) return null;
      const Fr = R0 + (1 - R0) * (1 + dt(d, nin)) ** 5, col = [0, 0, 0], e = this.env(rf(d, nin));
      for (let c = 0; c < 3; c++) col[c] += Fr * e;
      let p = ad(or, d, tin), dir = rr(d, nin, 1 / o.ior);
      const thr = [1 - Fr, 1 - Fr, 1 - Fr];
      for (let b = 0; b < 7 && dir; b++) {
        let te = 1e9, ne = null;
        for (const q of pl) { const dn = dt(q.n, dir); if (dn > 1e-6) { const t = dt(q.n, sb(q.p, p)) / dn; if (t > 1e-6 && t < te) { te = t; ne = q.n; } } }
        if (!ne) break;
        for (let c = 0; c < 3; c++) thr[c] *= Math.exp(-o.sigma[c] * te);
        p = ad(p, dir, te);
        const inN = ne.map((v) => -v), od = rr(dir, inN, o.ior);
        if (od) {
          const Re = R0 + (1 - R0) * (1 - Math.abs(dt(od, ne))) ** 5, eo = this.env(od);
          for (let c = 0; c < 3; c++) { col[c] += thr[c] * (1 - Re) * eo; thr[c] *= Re; }
        }
        dir = rf(dir, inN);
      }
      return col;
    };
    const SZ = o.size, b = new P.Buf(SZ, SZ), scale = SZ / 2.45, ss = o.ss;
    for (let py = 0; py < SZ; py++)
      for (let px = 0; px < SZ; px++) {
        const acc = [0, 0, 0];
        let hits = 0;
        for (let j = 0; j < ss; j++)
          for (let i = 0; i < ss; i++) {
            const c = trace([(px + (i + 0.5) / ss - SZ / 2) / scale, -(py + (j + 0.5) / ss - SZ / 2) / scale, 10], [0, 0, -1]);
            if (c) { hits++; for (let k = 0; k < 3; k++) acc[k] += c[k]; }
          }
        if (hits < (ss * ss) / 2) continue;
        const rgb = acc.map((v) => Math.pow(1 - Math.exp(-(v / hits) * o.exposure), 1 / 2.2) * 255);
        let best = 0, bd = Infinity;
        for (let k = 0; k < o.cols.length; k++) {
          const q = o.cols[k], dd = 2 * (rgb[0] - q[0]) ** 2 + 4 * (rgb[1] - q[1]) ** 2 + 3 * (rgb[2] - q[2]) ** 2;
          if (dd < bd) { bd = dd; best = k; }
        }
        b.pset(px, py, this.pal[best]);
      }
    return b;
  }

  frames(n) {
    const fr = [];
    for (let f = 0; f < n; f++) fr.push(this.render((f / n) * Math.PI * 2));
    const SZ = this.o.size;
    let X0 = SZ, X1 = 0, Y0 = SZ, Y1 = 0;
    for (const f of fr) for (let y = 0; y < SZ; y++) for (let x = 0; x < SZ; x++) if (f.px[y * SZ + x] >>> 24) { X0 = Math.min(X0, x); X1 = Math.max(X1, x); Y0 = Math.min(Y0, y); Y1 = Math.max(Y1, y); }
    const dx = Math.round((SZ - 1 - X1 - X0) / 2), dy = Math.round((SZ - 1 - Y1 - Y0) / 2);
    return fr.map((f) => { const o = new P.Buf(SZ, SZ); o.sprite(f, dx, dy); return o; });
  }
}
P.Gem = Gem;

if (typeof module !== "undefined") module.exports = P;
else globalThis.P = P;
