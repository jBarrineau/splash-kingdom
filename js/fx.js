import * as THREE from 'three';
import { heightAt } from './terrain.js';

// ---------- soft round point particles ----------
const VERT = `
attribute float size; attribute float alpha; attribute vec3 pcolor;
uniform float uScale;
varying vec3 vC; varying float vA;
void main(){
  vC = pcolor; vA = alpha;
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  gl_PointSize = size * uScale / max(0.1, -mv.z);
  gl_Position = projectionMatrix * mv;
}`;
const FRAG = `
varying vec3 vC; varying float vA;
uniform float uSoft;
void main(){
  vec2 d = gl_PointCoord - 0.5;
  float r = length(d);
  if (r > 0.5) discard;
  float a = smoothstep(0.5, uSoft, r) * vA;
  gl_FragColor = vec4(vC, a);
}`;

export class Particles {
  constructor(scene, max, additive = false, soft = 0.25) {
    this.max = max;
    this.pos = new Float32Array(max * 3);
    this.col = new Float32Array(max * 3);
    this.size = new Float32Array(max);
    this.alpha = new Float32Array(max);
    this.p = [];
    for (let i = 0; i < max; i++) this.p.push({ alive: false });
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('pcolor', new THREE.BufferAttribute(this.col, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('size', new THREE.BufferAttribute(this.size, 1).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('alpha', new THREE.BufferAttribute(this.alpha, 1).setUsage(THREE.DynamicDrawUsage));
    this.mat = new THREE.ShaderMaterial({
      vertexShader: VERT, fragmentShader: FRAG, transparent: true, depthWrite: false,
      blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
      uniforms: { uScale: { value: 400 }, uSoft: { value: soft } },
    });
    this.points = new THREE.Points(g, this.mat);
    this.points.frustumCulled = false;
    this.points.renderOrder = additive ? 3 : 2;
    scene.add(this.points);
    this.cursor = 0;
    this.geo = g;
  }
  emit(o) {
    // find a free slot (ring search)
    let p = null;
    for (let k = 0; k < this.max; k++) {
      const i = (this.cursor + k) % this.max;
      if (!this.p[i].alive) { p = this.p[i]; this.cursor = (i + 1) % this.max; break; }
    }
    if (!p) { p = this.p[this.cursor]; this.cursor = (this.cursor + 1) % this.max; }
    p.alive = true;
    p.x = o.x; p.y = o.y; p.z = o.z;
    p.vx = o.vx || 0; p.vy = o.vy || 0; p.vz = o.vz || 0;
    p.life = 0; p.max = o.life || 1;
    p.s0 = o.size || 0.3; p.grow = o.grow || 0;
    p.g = o.gravity || 0; p.drag = o.drag || 0;
    const c = o.color; // THREE.Color (linear) -> sRGB for shader
    p.r = Math.pow(c.r, 1 / 2.2); p.gg = Math.pow(c.g, 1 / 2.2); p.b = Math.pow(c.b, 1 / 2.2);
    p.a0 = o.alpha ?? 1;
    p.twinkle = o.twinkle || 0;
    p.sway = o.sway || 0;
    p.fadeIn = o.fadeIn || 0;
    p.onLand = o.onLand || null;
    p.phase = Math.random() * 6.28;
    return p;
  }
  update(dt) {
    let n = 0;
    for (let i = 0; i < this.max; i++) {
      const p = this.p[i];
      if (!p.alive) { this.alpha[i] = 0; this.size[i] = 0; continue; }
      p.life += dt;
      if (p.life >= p.max) { p.alive = false; this.alpha[i] = 0; this.size[i] = 0; continue; }
      p.vy += p.g * dt;
      const dr = Math.exp(-p.drag * dt);
      p.vx *= dr; p.vy *= dr; p.vz *= dr;
      p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
      if (p.sway) { p.x += Math.sin(p.life * 2 + p.phase) * p.sway * dt; p.z += Math.cos(p.life * 1.6 + p.phase) * p.sway * dt; }
      if (p.onLand && p.vy < 0) {
        const h = heightAt(p.x, p.z);
        if (p.y <= h + 0.05) { p.onLand(p); p.alive = false; this.alpha[i] = 0; this.size[i] = 0; continue; }
      }
      const t = p.life / p.max;
      let a = p.a0 * (1 - t * t);
      if (p.fadeIn) a *= Math.min(1, p.life / p.fadeIn);
      if (p.twinkle) a *= 0.55 + 0.45 * Math.sin(p.life * p.twinkle + p.phase);
      this.pos[i * 3] = p.x; this.pos[i * 3 + 1] = p.y; this.pos[i * 3 + 2] = p.z;
      this.col[i * 3] = p.r; this.col[i * 3 + 1] = p.gg; this.col[i * 3 + 2] = p.b;
      this.size[i] = p.s0 * (1 + p.grow * t);
      this.alpha[i] = a;
      n++;
    }
    const at = this.geo.attributes;
    at.position.needsUpdate = at.pcolor.needsUpdate = at.size.needsUpdate = at.alpha.needsUpdate = true;
    return n;
  }
}

// ---------- textures ----------
export function glowTexture() {
  const c = document.createElement('canvas'); c.width = c.height = 128;
  const g = c.getContext('2d');
  const grd = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  grd.addColorStop(0, 'rgba(255,255,255,1)');
  grd.addColorStop(0.25, 'rgba(255,255,255,0.55)');
  grd.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grd; g.fillRect(0, 0, 128, 128);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
export const GLOW_TEX = glowTexture();

export function makeGlow(color, size, opacity = 0.8) {
  const m = new THREE.SpriteMaterial({ map: GLOW_TEX, color, transparent: true, opacity,
    blending: THREE.AdditiveBlending, depthWrite: false });
  const s = new THREE.Sprite(m);
  s.scale.setScalar(size);
  s.renderOrder = 4;
  return s;
}

function zTexture() {
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const g = c.getContext('2d');
  g.font = 'bold 52px "Caveat", "Comic Sans MS", cursive';
  g.textAlign = 'center'; g.textBaseline = 'middle';
  g.lineWidth = 6; g.strokeStyle = 'rgba(255,255,255,0.9)';
  g.strokeText('z', 32, 34);
  g.fillStyle = '#6f7378'; g.fillText('z', 32, 34);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// Little sleepy "z z z" that rise above things that are still asleep
export class Snores {
  constructor(scene) {
    this.tex = zTexture();
    this.pool = [];
    for (let i = 0; i < 40; i++) {
      const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.tex, transparent: true, depthWrite: false }));
      s.visible = false; s.userData = { t: 0, life: 3 };
      scene.add(s); this.pool.push(s);
    }
  }
  emit(x, y, z, size = 1) {
    const s = this.pool.find(p => !p.visible);
    if (!s) return;
    s.visible = true; s.position.set(x, y, z);
    s.userData = { t: 0, life: 3, x, y, z, size, ph: Math.random() * 6 };
  }
  update(dt) {
    for (const s of this.pool) {
      if (!s.visible) continue;
      const u = s.userData; u.t += dt;
      if (u.t > u.life) { s.visible = false; continue; }
      const k = u.t / u.life;
      s.position.set(u.x + Math.sin(u.t * 2 + u.ph) * 0.4 + k * 0.8, u.y + k * 2.4, u.z);
      s.scale.setScalar(u.size * (0.6 + k * 0.8));
      s.material.opacity = Math.sin(k * Math.PI) * 0.9;
    }
  }
}

// ---------- flowers & grass that sprout where she paints the ground ----------
export class FlowerField {
  constructor(scene, max = 3500) {
    this.max = max;
    const stemGeo = new THREE.CylinderGeometry(0.025, 0.035, 0.6, 4).translate(0, 0.3, 0);
    const headGeo = new THREE.IcosahedronGeometry(0.15, 0).scale(1, 0.55, 1).translate(0, 0.62, 0);
    const centerGeo = new THREE.IcosahedronGeometry(0.06, 0).translate(0, 0.68, 0);
    const tuftGeo = new THREE.ConeGeometry(0.16, 0.55, 5).translate(0, 0.27, 0);
    const mat = new THREE.MeshStandardMaterial({ roughness: 0.8, flatShading: true });
    this.stems = new THREE.InstancedMesh(stemGeo, new THREE.MeshStandardMaterial({ color: '#4c9a3a', roughness: 0.9 }), max);
    this.heads = new THREE.InstancedMesh(headGeo, mat, max);
    this.centers = new THREE.InstancedMesh(centerGeo, new THREE.MeshStandardMaterial({ color: '#ffd84a', roughness: 0.6 }), max);
    this.tufts = new THREE.InstancedMesh(tuftGeo, mat.clone(), max);
    for (const m of [this.stems, this.heads, this.centers, this.tufts]) {
      m.count = 0; m.frustumCulled = false; m.castShadow = false; m.receiveShadow = true;
      m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      scene.add(m);
    }
    this.heads.setColorAt(0, new THREE.Color());
    this.tufts.setColorAt(0, new THREE.Color());
    this.fIdx = 0; this.tIdx = 0;
    this.growing = [];
    this.records = []; // for saving
    this._m = new THREE.Matrix4(); this._q = new THREE.Quaternion(); this._s = new THREE.Vector3(); this._p = new THREE.Vector3();
    this._e = new THREE.Euler();
  }
  add(x, y, z, color, kind, instant = false) {
    const rot = Math.random() * 6.28, sc = 0.7 + Math.random() * 0.6;
    const rec = { x, y, z, c: color.getHex(), k: kind, rot, sc };
    this.records.push(rec);
    if (this.records.length > this.max * 2) this.records.splice(0, this.max);
    this._place(rec, instant);
  }
  _place(rec, instant) {
    const col = new THREE.Color(rec.c);
    if (rec.k === 'tuft') {
      const i = this.tIdx; this.tIdx = (this.tIdx + 1) % this.max;
      this.tufts.count = Math.max(this.tufts.count, i + 1);
      this.tufts.setColorAt(i, col.offsetHSL(0, 0, (Math.random() - 0.5) * 0.08));
      this.tufts.instanceColor.needsUpdate = true;
      this.growing.push({ mesh: [this.tufts], i, rec, t: instant ? 10 : 0 });
    } else {
      const i = this.fIdx; this.fIdx = (this.fIdx + 1) % this.max;
      for (const m of [this.stems, this.heads, this.centers]) m.count = Math.max(m.count, i + 1);
      this.heads.setColorAt(i, col);
      this.heads.instanceColor.needsUpdate = true;
      this.growing.push({ mesh: [this.stems, this.heads, this.centers], i, rec, t: instant ? 10 : 0 });
    }
    if (instant) this.update(0);
  }
  update(dt) {
    if (!this.growing.length) return;
    const dirty = new Set();
    for (const g of this.growing) {
      g.t += dt;
      const k = Math.min(1, g.t / 0.7);
      const e = 1 + 2.2 * Math.pow(k - 1, 3) + 1.2 * Math.pow(k - 1, 2); // ease out back
      const s = Math.max(0.001, e * g.rec.sc);
      this._q.setFromEuler(this._e.set((Math.random() - 0.5) * 0.0, g.rec.rot, 0));
      this._m.compose(this._p.set(g.rec.x, g.rec.y - 0.05, g.rec.z), this._q, this._s.set(s, s, s));
      for (const m of g.mesh) { m.setMatrixAt(g.i, this._m); dirty.add(m); }
      g.done = k >= 1;
    }
    for (const m of dirty) m.instanceMatrix.needsUpdate = true;
    this.growing = this.growing.filter(g => !g.done);
  }
  serialize() {
    return this.records.slice(-this.max).map(r => [+r.x.toFixed(2), +r.y.toFixed(2), +r.z.toFixed(2), r.c, r.k === 'tuft' ? 1 : 0, +r.rot.toFixed(2), +r.sc.toFixed(2)]);
  }
  load(arr) {
    for (const a of arr) {
      const rec = { x: a[0], y: a[1], z: a[2], c: a[3], k: a[4] ? 'tuft' : 'flower', rot: a[5], sc: a[6] };
      this.records.push(rec);
      this._place(rec, true);
    }
  }
}
