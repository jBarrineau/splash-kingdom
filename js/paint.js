import * as THREE from 'three';
import { grayFor } from './terrain.js';

export const paintMaterial = new THREE.MeshStandardMaterial({
  vertexColors: true, roughness: 0.82, metalness: 0, flatShading: true,
});
export const glowMaterial = paintMaterial.clone();
glowMaterial.emissive = new THREE.Color('#ffcf7a');
glowMaterial.emissiveIntensity = 0.55;

export const waterMaterial = new THREE.MeshStandardMaterial({
  vertexColors: true, roughness: 0.18, metalness: 0.15, flatShading: true,
});

const _ctr = new THREE.Vector3();
const _col = new THREE.Color();

// Every paintable mesh is an "entry" with its own per-vertex color + coverage state.
export class PaintSystem {
  constructor() {
    this.entries = [];
    this.fills = [];
  }

  register(mesh, naturalHex, thing) {
    const geo = mesh.geometry;
    const n = geo.attributes.position.count;
    const col = new Float32Array(n * 3);
    const jit = new Float32Array(n);
    const natural = new THREE.Color(naturalHex);
    for (let i = 0; i < n; i++) {
      const j = Math.random() - 0.5;
      jit[i] = j;
      const g = grayFor(natural, j * 0.05);
      col[i * 3] = g; col[i * 3 + 1] = g; col[i * 3 + 2] = g * 1.02;
    }
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    if (!geo.boundingSphere) geo.computeBoundingSphere();
    const e = {
      id: this.entries.length, mesh, natural, thing, n,
      col, jit, wet: new Float32Array(n), painted: new Uint8Array(n), count: 0,
    };
    this.entries.push(e);
    return e;
  }

  paintAt(p, radius, color, strength, dt, rainbowT = -1) {
    let fresh = 0;
    const k0 = 1 - Math.exp(-dt * strength);
    for (const e of this.entries) {
      const mesh = e.mesh;
      if (!mesh.visible || !mesh.parent) continue;
      const m = mesh.matrixWorld.elements;
      const bs = mesh.geometry.boundingSphere;
      _ctr.copy(bs.center).applyMatrix4(mesh.matrixWorld);
      const sc = Math.max(Math.hypot(m[0], m[1], m[2]), Math.hypot(m[4], m[5], m[6]), Math.hypot(m[8], m[9], m[10]));
      if (_ctr.distanceTo(p) > radius + bs.radius * sc) continue;
      const pos = mesh.geometry.attributes.position.array;
      const col = e.col, r2 = radius * radius;
      let changed = false;
      for (let i = 0; i < e.n; i++) {
        const x = pos[i * 3], y = pos[i * 3 + 1], z = pos[i * 3 + 2];
        const wx = m[0] * x + m[4] * y + m[8] * z + m[12] - p.x;
        const wy = m[1] * x + m[5] * y + m[9] * z + m[13] - p.y;
        const wz = m[2] * x + m[6] * y + m[10] * z + m[14] - p.z;
        const d2 = wx * wx + wy * wy + wz * wz;
        if (d2 > r2) continue;
        const f = 1 - Math.sqrt(d2) / radius;
        const k = Math.min(1, k0 * (0.4 + f * 1.8));
        let c = color;
        if (rainbowT >= 0) c = _col.setHSL((rainbowT * 0.25 + (wx + p.x) * 0.03 + (wy + p.y) * 0.05) % 1, 0.75, 0.55);
        const jm = 1 + e.jit[i] * 0.14;
        col[i * 3] += (c.r * jm - col[i * 3]) * k;
        col[i * 3 + 1] += (c.g * jm - col[i * 3 + 1]) * k;
        col[i * 3 + 2] += (c.b * jm - col[i * 3 + 2]) * k;
        e.wet[i] += k;
        changed = true;
        if (!e.painted[i] && e.wet[i] > 0.5) {
          e.painted[i] = 1; e.count++; fresh++;
          if (e.thing) e.thing.dirty = true;
        }
      }
      if (changed) { mesh.geometry.attributes.color.needsUpdate = true; e.touched = true; }
    }
    return fresh;
  }

  // When a thing wakes up, the rest of it gently blooms in color.
  fillThing(thing, instant = false) {
    for (const e of thing.entries) {
      const target = new THREE.Color();
      if (e.count > 0) {
        let r = 0, g = 0, b = 0;
        for (let i = 0; i < e.n; i++) if (e.painted[i]) { r += e.col[i * 3]; g += e.col[i * 3 + 1]; b += e.col[i * 3 + 2]; }
        target.setRGB(r / e.count, g / e.count, b / e.count);
      } else target.copy(e.natural);
      // order vertices bottom->top for a rising wave
      const pos = e.mesh.geometry.attributes.position.array;
      let minY = Infinity, maxY = -Infinity;
      for (let i = 0; i < e.n; i++) { minY = Math.min(minY, pos[i * 3 + 1]); maxY = Math.max(maxY, pos[i * 3 + 1]); }
      this.fills.push({ e, target, t: instant ? 99 : 0, minY, span: Math.max(0.001, maxY - minY) });
    }
    if (instant) this.update(0);
  }

  update(dt) {
    if (!this.fills.length) return;
    for (const f of this.fills) {
      f.t += dt;
      const e = f.e, pos = e.mesh.geometry.attributes.position.array, col = e.col;
      let done = true;
      for (let i = 0; i < e.n; i++) {
        if (e.painted[i]) continue;
        const h = (pos[i * 3 + 1] - f.minY) / f.span;
        const k = Math.min(1, Math.max(0, (f.t * 1.4 - h * 0.8)));
        if (k < 1) done = false;
        const jm = 1 + e.jit[i] * 0.14;
        const b = f.t > 50 ? 1 : k * 0.25;
        col[i * 3] += (f.target.r * jm - col[i * 3]) * b;
        col[i * 3 + 1] += (f.target.g * jm - col[i * 3 + 1]) * b;
        col[i * 3 + 2] += (f.target.b * jm - col[i * 3 + 2]) * b;
        if (k >= 1 && f.t > 2.2) { e.painted[i] = 1; e.count++; }
      }
      e.mesh.geometry.attributes.color.needsUpdate = true;
      f.done = done && f.t > 2.3;
    }
    this.fills = this.fills.filter(f => !f.done);
  }
}

// ---- save helpers ----
export function packColors(col, painted) {
  const n = painted.length;
  const out = new Uint8Array(n * 4);
  for (let i = 0; i < n; i++) {
    out[i * 4] = Math.round(Math.sqrt(Math.max(0, Math.min(1, col[i * 3]))) * 255);
    out[i * 4 + 1] = Math.round(Math.sqrt(Math.max(0, Math.min(1, col[i * 3 + 1]))) * 255);
    out[i * 4 + 2] = Math.round(Math.sqrt(Math.max(0, Math.min(1, col[i * 3 + 2]))) * 255);
    out[i * 4 + 3] = painted[i];
  }
  return toB64(out);
}
export function unpackColors(str, col, painted) {
  const a = fromB64(str);
  const n = Math.min(painted.length, a.length / 4);
  let count = 0;
  for (let i = 0; i < n; i++) {
    col[i * 3] = (a[i * 4] / 255) ** 2;
    col[i * 3 + 1] = (a[i * 4 + 1] / 255) ** 2;
    col[i * 3 + 2] = (a[i * 4 + 2] / 255) ** 2;
    painted[i] = a[i * 4 + 3];
    count += painted[i];
  }
  return count;
}
function toB64(u8) {
  let s = '';
  for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000));
  return btoa(s);
}
function fromB64(str) {
  const s = atob(str);
  const u8 = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) u8[i] = s.charCodeAt(i);
  return u8;
}
