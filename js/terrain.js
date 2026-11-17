import * as THREE from 'three';

// ---------- noise ----------
function hash(x, z) {
  const s = Math.sin(x * 127.1 + z * 311.7) * 43758.5453123;
  return s - Math.floor(s);
}
function vnoise(x, z) {
  const xi = Math.floor(x), zi = Math.floor(z);
  const xf = x - xi, zf = z - zi;
  const u = xf * xf * (3 - 2 * xf), v = zf * zf * (3 - 2 * zf);
  const a = hash(xi, zi), b = hash(xi + 1, zi), c = hash(xi, zi + 1), d = hash(xi + 1, zi + 1);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}
export function fbm(x, z) {
  let a = 0.5, f = 1, s = 0;
  for (let i = 0; i < 4; i++) { s += a * vnoise(x * f, z * f); f *= 2.03; a *= 0.5; }
  return s / 0.9375;
}
export const smooth = (a, b, x) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};
const gauss = (x, z, cx, cz, s) => Math.exp(-((x - cx) ** 2 + (z - cz) ** 2) / (2 * s * s));

export const LAKE = { x: 86, z: 8, r: 26.5, sx: 1.15, water: -1.4 };
export const POND = { x: 14, z: 18, r: 7.6, water: -0.55 };
export const BOUNDS = { minX: -56, maxX: 126, minZ: -126, maxZ: 56 };

export function heightAt(x, z) {
  let h = (fbm(x * 0.035, z * 0.035) - 0.5) * 4;
  const dv = Math.hypot(x * 0.9, z);
  h *= 0.25 + 0.75 * smooth(12, 40, dv);
  h += 13 * gauss(x, z, -38, 34, 8.5);                    // Lookout Hill
  h -= 2.6 * gauss(x, z, POND.x, POND.z, 4.2);             // village pond
  const dl = Math.hypot((x - LAKE.x) / LAKE.sx, z - LAKE.z);
  h -= 5.5 * (1 - smooth(LAKE.r - 8.5, LAKE.r + 2.5, dl)); // lake bowl
  h += 6.2 * gauss(x, z, 92, 14, 3.2);                     // island
  h += 12 * gauss(x, z, 119, -31, 7.5);                    // cave cliff
  h += 5.5 * gauss(x, z, 118, 40, 4.5);                    // lighthouse rock
  const m = smooth(-46, -74, z);                           // mountains
  h += m * (7 + 8 * fbm(x * 0.05 + 7, z * 0.05 + 3));
  h += 40 * gauss(x, z, 30, -102, 15);                     // the peak
  const ex = Math.max(0, x - BOUNDS.maxX, BOUNDS.minX - x);
  const ez = Math.max(0, z - BOUNDS.maxZ, BOUNDS.minZ - z);
  const rim = Math.hypot(ex, ez);
  if (rim > 0) h += rim * 0.55 + smooth(0, 25, rim) * fbm(x * 0.06, z * 0.06) * 16;
  return h;
}

export function normalAt(x, z, out = new THREE.Vector3()) {
  const e = 0.4;
  const hx = heightAt(x + e, z) - heightAt(x - e, z);
  const hz = heightAt(x, z + e) - heightAt(x, z - e);
  return out.set(-hx, 2 * e, -hz).normalize();
}

export function regionOf(x, z) {
  if (z < -44) return 2;
  if (x > 44) return 1;
  return 0;
}

// paths (polylines) for the natural colors
const PATHS = [
  [[-38, 30], [-26, 18], [-12, 8], [0, 0], [12, -4], [30, -6], [46, -4], [56, 2]],
  [[0, 0], [-4, -16], [-2, -34], [6, -50], [16, -62]],
  [[0, 0], [6, 12], [8, 26]],
];
function pathDist(x, z) {
  let best = 1e9;
  for (const p of PATHS) {
    for (let i = 0; i < p.length - 1; i++) {
      const [ax, az] = p[i], [bx, bz] = p[i + 1];
      const dx = bx - ax, dz = bz - az;
      const t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / (dx * dx + dz * dz)));
      const d = Math.hypot(x - ax - dx * t, z - az - dz * t);
      if (d < best) best = d;
    }
  }
  return best;
}

const _c = new THREE.Color(), _c2 = new THREE.Color();
function naturalColor(x, z, h, slope) {
  // returns linear THREE.Color in _c
  const n = fbm(x * 0.12, z * 0.12);
  _c.set('#79c05a').lerp(_c2.set('#4f9e45'), n);
  if (fbm(x * 0.05 + 40, z * 0.05) > 0.62) _c.lerp(_c2.set('#b5d65e'), 0.5); // meadow patches
  const dl = Math.hypot((x - LAKE.x) / LAKE.sx, z - LAKE.z);
  const dp = Math.hypot(x - POND.x, z - POND.z);
  if ((dl < LAKE.r + 2 && h < -0.2) || (dp < POND.r + 1.2 && h < 0.1)) _c.set('#e6d29c');
  if (h < LAKE.water - 0.3 && dl < LAKE.r) _c.set('#7bb3a8');
  const pd = pathDist(x, z);
  if (pd < 1.7 && z > -60) _c.lerp(_c2.set('#d9bf8c'), 1 - smooth(0.9, 1.7, pd));
  if (slope > 0.75 || (h > 18 && slope > 0.45)) _c.lerp(_c2.set('#9c9086'), smooth(0.45, 0.95, slope));
  if (h > 34) _c.lerp(_c2.set('#f6f9ff'), smooth(34, 40, h + n * 3));
  if (regionOf(x, z) === 2 && h < 34) _c.lerp(_c2.set('#6da866'), 0.25);
  return _c;
}

export function grayFor(color, jitter) {
  // sRGB perceived lightness -> gray value (linear)
  const s = color.clone().convertLinearToSRGB();
  const L = 0.299 * s.r + 0.587 * s.g + 0.114 * s.b;
  const g = Math.min(0.9, Math.max(0.2, 0.36 + L * 0.44 + jitter));
  return Math.pow(g, 2.2);
}

export class Terrain {
  constructor() {
    const size = 300, segs = 200, cx = 35, cz = -35;
    this.size = size; this.segs = segs; this.cell = size / segs;
    this.x0 = cx - size / 2; this.z0 = cz - size / 2;
    const N = (segs + 1) * (segs + 1);
    this.n = N;
    const pos = new Float32Array(N * 3);
    const col = new Float32Array(N * 3);
    this.natural = new Float32Array(N * 3);
    this.painted = new Uint8Array(N);
    this.wet = new Float32Array(N);
    this.jit = new Float32Array(N);
    this.region = new Uint8Array(N);
    this.regionTotal = [0, 0, 0];
    this.regionPainted = [0, 0, 0];
    for (let iz = 0; iz <= segs; iz++) {
      for (let ix = 0; ix <= segs; ix++) {
        const i = iz * (segs + 1) + ix;
        const x = this.x0 + ix * this.cell, z = this.z0 + iz * this.cell;
        const h = heightAt(x, z);
        pos[i * 3] = x; pos[i * 3 + 1] = h; pos[i * 3 + 2] = z;
        const slope = 1 - normalAt(x, z).y;
        const nc = naturalColor(x, z, h, slope * 3);
        this.natural[i * 3] = nc.r; this.natural[i * 3 + 1] = nc.g; this.natural[i * 3 + 2] = nc.b;
        const j = (Math.random() - 0.5);
        this.jit[i] = j;
        const g = grayFor(nc, j * 0.04);
        col[i * 3] = g; col[i * 3 + 1] = g; col[i * 3 + 2] = g * 1.02;
        const r = regionOf(x, z);
        this.region[i] = r;
        this.regionTotal[r]++;
      }
    }
    const idx = [];
    for (let iz = 0; iz < segs; iz++) {
      for (let ix = 0; ix < segs; ix++) {
        const a = iz * (segs + 1) + ix, b = a + 1, c = a + segs + 1, d = c + 1;
        if ((ix + iz) % 2) { idx.push(a, c, b, b, c, d); } else { idx.push(a, c, d, a, d, b); }
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    geo.setIndex(idx);
    geo.computeVertexNormals();
    this.geo = geo;
    this.colors = col;
    this.material = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95, metalness: 0 });
    this.mesh = new THREE.Mesh(geo, this.material);
    this.mesh.receiveShadow = true;
    this.newly = [];
    this.blooms = [];
  }

  // Paint the ground around world point p. Returns array of newly painted vertex indices.
  paintAt(p, radius, color, strength, dt) {
    this.newly.length = 0;
    const gh = heightAt(p.x, p.z);
    if (p.y - gh > radius * 1.1) return this.newly;
    const s = this.segs, cell = this.cell;
    const ix0 = Math.max(0, Math.floor((p.x - radius - this.x0) / cell));
    const ix1 = Math.min(s, Math.ceil((p.x + radius - this.x0) / cell));
    const iz0 = Math.max(0, Math.floor((p.z - radius - this.z0) / cell));
    const iz1 = Math.min(s, Math.ceil((p.z + radius - this.z0) / cell));
    const pos = this.geo.attributes.position.array, col = this.colors;
    const r2 = radius * radius;
    const k0 = 1 - Math.exp(-dt * strength);
    let changed = false;
    for (let iz = iz0; iz <= iz1; iz++) {
      for (let ix = ix0; ix <= ix1; ix++) {
        const i = iz * (s + 1) + ix;
        const dx = pos[i * 3] - p.x, dy = (pos[i * 3 + 1] - p.y) * 0.6, dz = pos[i * 3 + 2] - p.z;
        const d2 = dx * dx + dy * dy + dz * dz;
        if (d2 > r2) continue;
        const f = 1 - Math.sqrt(d2) / radius;
        const k = Math.min(1, k0 * (0.35 + f * 1.8));
        const jm = 1 + this.jit[i] * 0.16;
        col[i * 3] += (color.r * jm - col[i * 3]) * k;
        col[i * 3 + 1] += (color.g * jm - col[i * 3 + 1]) * k;
        col[i * 3 + 2] += (color.b * jm - col[i * 3 + 2]) * k;
        this.wet[i] += k;
        changed = true;
        if (!this.painted[i] && this.wet[i] > 0.55) {
          this.painted[i] = 1;
          this.regionPainted[this.region[i]]++;
          this.newly.push(i);
        }
      }
    }
    if (changed) this.geo.attributes.color.needsUpdate = true;
    return this.newly;
  }

  vertexPos(i, out) {
    const a = this.geo.attributes.position.array;
    return out.set(a[i * 3], a[i * 3 + 1], a[i * 3 + 2]);
  }

  // A wave of natural color spreading out over a region
  bloom(region, cx, cz, instant = false) {
    const list = [];
    const pos = this.geo.attributes.position.array;
    for (let i = 0; i < this.n; i++) {
      if (this.region[i] !== region || this.painted[i]) continue;
      list.push(i, Math.hypot(pos[i * 3] - cx, pos[i * 3 + 2] - cz));
    }
    const job = { list, t: instant ? 1e6 : 0, speed: 26, done: false };
    this.blooms.push(job);
    if (instant) this.updateBlooms(0);
    return job;
  }

  updateBlooms(dt, onSprout) {
    if (!this.blooms.length) return;
    const col = this.colors, nat = this.natural;
    for (const job of this.blooms) {
      job.t += dt;
      const front = job.t * job.speed;
      let remaining = 0;
      const L = job.list;
      for (let j = 0; j < L.length; j += 2) {
        const i = L[j];
        if (i < 0) continue;
        const d = L[j + 1];
        if (d > front) { remaining++; continue; }
        const k = Math.min(1, (front - d) / 10);
        col[i * 3] += (nat[i * 3] - col[i * 3]) * k;
        col[i * 3 + 1] += (nat[i * 3 + 1] - col[i * 3 + 1]) * k;
        col[i * 3 + 2] += (nat[i * 3 + 2] - col[i * 3 + 2]) * k;
        if (k >= 1) {
          L[j] = -1;
          if (!this.painted[i]) { this.painted[i] = 1; this.regionPainted[this.region[i]]++; }
          if (onSprout && Math.random() < 0.012) onSprout(i);
        } else remaining++;
      }
      if (!remaining) job.done = true;
    }
    this.blooms = this.blooms.filter(j => !j.done);
    this.geo.attributes.color.needsUpdate = true;
  }
}
