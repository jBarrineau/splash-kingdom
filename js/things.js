import * as THREE from 'three';
import { paintMaterial, waterMaterial, glowMaterial } from './paint.js';
import { heightAt, fbm, LAKE, POND } from './terrain.js';
import { makeGlow } from './fx.js';

const TAU = Math.PI * 2;
const rand = (a = 0, b = 1) => a + Math.random() * (b - a);
const seg = (v, d) => Math.max(1, Math.ceil(v * d));
const col = h => new THREE.Color(h);

export const G = {
  box: (w, h, d, den = 1.6) => new THREE.BoxGeometry(w, h, d, seg(w, den), seg(h, den), seg(d, den)),
  cyl: (rt, rb, h, rs = 12, den = 1.6) => new THREE.CylinderGeometry(rt, rb, h, rs, seg(h, den)),
  cone: (r, h, rs = 12, den = 1.6) => new THREE.ConeGeometry(r, h, rs, seg(h, den)),
  ball: (r, detail = 2) => new THREE.IcosahedronGeometry(r, detail),
  disc: (r, rs = 40, rings = 8) => new THREE.RingGeometry(0.001, r, rs, rings).rotateX(-Math.PI / 2),
  lumpy(r, amt = 0.22, detail = 2, seed = 0) {
    const g = new THREE.IcosahedronGeometry(r, detail);
    const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
      const n = fbm(x * 0.9 + seed * 3.1 + z * 0.4, y * 0.9 - z * 0.5 + seed);
      const s = 1 + (n - 0.5) * 2 * amt;
      p.setXYZ(i, x * s, y * s * 0.92, z * s);
    }
    g.computeVertexNormals();
    return g;
  },
  lathe(profile, segs = 22, steps = 18) {
    const curve = new THREE.SplineCurve(profile.map(([r, y]) => new THREE.Vector2(r, y)));
    return new THREE.LatheGeometry(curve.getPoints(steps), segs);
  },
};

// ---------------------------------------------------------------------------
export class Thing {
  constructor(ctx, o) {
    this.ctx = ctx;
    this.name = o.name; this.region = o.region; this.msg = o.msg;
    this.threshold = o.threshold ?? 0.22;
    this.snoreH = o.snoreH ?? 3;
    this.group = new THREE.Group();
    this.parts = []; this.entries = []; this.glowParts = [];
    this.awake = false; this.dirty = false; this.age = 0;
    this.bounceT = -1; this.snoreT = rand(0, 3);
  }
  part(geo, natural, x = 0, y = 0, z = 0, o = {}) {
    const m = new THREE.Mesh(geo, o.material || paintMaterial);
    m.position.set(x, y, z);
    if (o.rot) m.rotation.set(o.rot[0], o.rot[1], o.rot[2]);
    if (o.scale) Array.isArray(o.scale) ? m.scale.set(...o.scale) : m.scale.setScalar(o.scale);
    m.castShadow = o.shadow ?? true; m.receiveShadow = true;
    (o.parent || this.group).add(m);
    this.parts.push({ mesh: m, natural });
    if (o.glow) this.glowParts.push(m);
    return m;
  }
  place(x, z, ry = 0, y) {
    this.group.position.set(x, y ?? heightAt(x, z), z);
    this.group.rotation.y = ry;
    return this;
  }
  get coverage() {
    let p = 0, n = 0;
    for (const e of this.entries) { p += e.count; n += e.n; }
    return n ? p / n : 0;
  }
  focus(out = new THREE.Vector3()) {
    return this.group.getWorldPosition(out).add(new THREE.Vector3(0, this.snoreH * 0.5, 0));
  }
  wake(silent) {
    this.awake = true;
    if (!silent) this.bounceT = 0;
    for (const m of this.glowParts) m.material = glowMaterial;
    if (this.onWake) this.onWake(silent);
  }
  update(dt, t) {
    this.age += dt;
    if (this.bounceT >= 0) {
      this.bounceT += dt;
      const k = this.bounceT;
      const s = 1 + Math.sin(k * 13) * Math.exp(-k * 3.5) * 0.14;
      this.group.scale.set(1 / Math.sqrt(s), s, 1 / Math.sqrt(s));
      if (k > 2) { this.bounceT = -1; this.group.scale.set(1, 1, 1); }
    }
    if (!this.awake) {
      this.snoreT -= dt;
      if (this.snoreT < 0) {
        this.snoreT = rand(2.2, 4);
        const p = this.group.getWorldPosition(new THREE.Vector3());
        if (this.ctx.nearCamera(p, 70)) this.ctx.snores.emit(p.x + 0.5, p.y + this.snoreH, p.z, this.snoreH > 6 ? 1.6 : 1);
      }
    }
    if (this.tick) this.tick(dt, t);
  }
}

// ---------------------------------------------------------------------------
// little creatures
function simpleMat(c, o = {}) { return new THREE.MeshStandardMaterial({ color: c, roughness: 0.7, flatShading: true, ...o }); }

export class Butterfly {
  constructor(ctx, center, color) {
    this.ctx = ctx; this.c = center.clone();
    this.g = new THREE.Group();
    const wingGeo = new THREE.CircleGeometry(0.26, 8).translate(0.24, 0, 0).scale(1, 1.25, 1);
    const m = simpleMat(color, { side: THREE.DoubleSide, emissive: color, emissiveIntensity: 0.15 });
    this.l = new THREE.Mesh(wingGeo, m); this.r = new THREE.Mesh(wingGeo, m);
    this.r.rotation.y = Math.PI;
    const lw = new THREE.Group(), rw = new THREE.Group();
    lw.add(this.l); rw.add(this.r);
    this.lw = lw; this.rw = rw;
    const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.04, 0.3, 2, 4), simpleMat('#333'));
    body.rotation.x = Math.PI / 2;
    this.g.add(lw, rw, body);
    this.g.rotation.x = -0.3;
    ctx.scene.add(this.g);
    this.a = rand(0, TAU); this.sp = rand(0.5, 0.9) * (Math.random() < 0.5 ? -1 : 1);
    this.rad = rand(1.5, 3.5); this.ph = rand(0, 10);
  }
  update(dt, t) {
    this.a += this.sp * dt;
    const r = this.rad + Math.sin(t * 0.7 + this.ph) * 1.2;
    const x = this.c.x + Math.cos(this.a) * r, z = this.c.z + Math.sin(this.a) * r;
    const y = this.c.y + 1.4 + Math.sin(t * 2.1 + this.ph) * 0.6;
    this.g.position.set(x, y, z);
    this.g.rotation.y = -this.a - (this.sp > 0 ? 0 : Math.PI);
    const f = Math.sin(t * 16 + this.ph) * 1.1;
    this.lw.rotation.z = f; this.rw.rotation.z = -f;
  }
}

export class Bird {
  constructor(ctx, center, height, radius) {
    this.c = center.clone(); this.h = height; this.rad = radius;
    this.g = new THREE.Group();
    const m = simpleMat(['#3f5f9e', '#e5484d', '#4a4a4a', '#f28c38'][Math.floor(rand(0, 4))]);
    const wing = new THREE.BoxGeometry(0.9, 0.04, 0.3).translate(0.45, 0, 0);
    this.l = new THREE.Mesh(wing, m); this.r = new THREE.Mesh(wing, m); this.r.rotation.y = Math.PI;
    const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.1, 0.35, 2, 5), m); body.rotation.x = Math.PI / 2;
    this.g.add(this.l, this.r, body);
    ctx.scene.add(this.g);
    this.a = rand(0, TAU); this.sp = rand(0.25, 0.45); this.ph = rand(0, 6);
  }
  update(dt, t) {
    this.a += this.sp * dt;
    this.g.position.set(this.c.x + Math.cos(this.a) * this.rad, this.c.y + this.h + Math.sin(t * 0.8 + this.ph) * 1.5, this.c.z + Math.sin(this.a) * this.rad);
    this.g.rotation.y = -this.a;
    const glide = Math.sin(t * 0.5 + this.ph) > 0.3;
    const f = glide ? 0.15 : Math.sin(t * 11 + this.ph) * 0.7;
    this.l.rotation.z = f; this.r.rotation.z = f;
  }
}

export class Fish {
  constructor(ctx, color) {
    this.ctx = ctx;
    this.g = new THREE.Group();
    const m = simpleMat(color, { emissive: color, emissiveIntensity: 0.1 });
    const body = new THREE.Mesh(new THREE.IcosahedronGeometry(0.25, 1), m); body.scale.set(0.6, 0.8, 1.5);
    const tail = new THREE.Mesh(new THREE.ConeGeometry(0.2, 0.35, 4), m); tail.rotation.x = -Math.PI / 2; tail.position.z = -0.45;
    this.g.add(body, tail);
    this.g.visible = false;
    ctx.scene.add(this.g);
    this.t = -1;
    this.a = new THREE.Vector3(); this.b = new THREE.Vector3();
  }
  jump(ax, az, bx, bz, y) {
    this.a.set(ax, y, az); this.b.set(bx, y, bz); this.t = 0; this.g.visible = true;
    this.ctx.splashAt(this.a, 0.5);
  }
  update(dt) {
    if (this.t < 0) return;
    this.t += dt / 1.0;
    const k = Math.min(1, this.t);
    const p = this.a.clone().lerp(this.b, k); p.y += Math.sin(k * Math.PI) * 1.6;
    const q = this.a.clone().lerp(this.b, Math.min(1, k + 0.05)); q.y += Math.sin(Math.min(1, k + 0.05) * Math.PI) * 1.6;
    this.g.position.copy(p); this.g.lookAt(q);
    if (this.t >= 1) { this.t = -1; this.g.visible = false; this.ctx.splashAt(this.b, 0.8); }
  }
}

export class Duck {
  constructor(ctx, cx, cz, rx, rz, y, i) {
    this.ctx = ctx; this.cx = cx; this.cz = cz; this.rx = rx; this.rz = rz; this.y = y;
    this.g = new THREE.Group();
    const body = new THREE.Mesh(new THREE.IcosahedronGeometry(0.45, 1), simpleMat(i === 0 ? '#ffe066' : '#f5f0e6'));
    body.scale.set(0.8, 0.6, 1.2);
    const head = new THREE.Mesh(new THREE.IcosahedronGeometry(0.25, 1), simpleMat(i === 0 ? '#ffe066' : '#3c8d5a'));
    head.position.set(0, 0.42, 0.42);
    const beak = new THREE.Mesh(new THREE.ConeGeometry(0.08, 0.25, 4), simpleMat('#f28c38'));
    beak.rotation.x = Math.PI / 2; beak.position.set(0, 0.38, 0.72);
    this.g.add(body, head, beak);
    ctx.scene.add(this.g);
    this.a = i * 0.35; this.sp = 0.06;
  }
  update(dt, t) {
    this.a += this.sp * dt;
    const x = this.cx + Math.cos(this.a) * this.rx, z = this.cz + Math.sin(this.a) * this.rz;
    this.g.position.set(x, this.y + Math.sin(t * 2 + this.a * 9) * 0.04 + 0.1, z);
    const nx = this.cx + Math.cos(this.a + 0.01) * this.rx, nz = this.cz + Math.sin(this.a + 0.01) * this.rz;
    this.g.rotation.y = Math.atan2(nx - x, nz - z);
    if (Math.random() < dt * 0.02 && this.ctx.nearCamera(this.g.position, 30)) this.ctx.audio.quack();
  }
}

// ---------------------------------------------------------------------------
// Paint pots (hidden colors)
export class PaintPot {
  constructor(ctx, def, colorDef) {
    this.ctx = ctx; this.def = def; this.colorDef = colorDef;
    this.color = col(colorDef.hex);
    const g = this.g = new THREE.Group();
    const metal = new THREE.MeshStandardMaterial({ color: '#e4ddd2', roughness: 0.35, metalness: 0.4 });
    const paint = new THREE.MeshStandardMaterial({ color: this.color, emissive: this.color, emissiveIntensity: 0.45, roughness: 0.3 });
    const pot = new THREE.Mesh(new THREE.CylinderGeometry(0.62, 0.5, 0.85, 24), metal); pot.castShadow = true;
    const band = new THREE.Mesh(new THREE.CylinderGeometry(0.635, 0.6, 0.3, 24), paint); band.position.y = -0.05;
    const rim = new THREE.Mesh(new THREE.TorusGeometry(0.6, 0.06, 8, 28), metal); rim.rotation.x = Math.PI / 2; rim.position.y = 0.42;
    const liquid = new THREE.Mesh(new THREE.CircleGeometry(0.56, 24), paint); liquid.rotation.x = -Math.PI / 2; liquid.position.y = 0.38;
    const blob = new THREE.Mesh(new THREE.IcosahedronGeometry(0.28, 1), paint); blob.position.y = 0.5; blob.scale.set(1, 0.5, 1);
    const handle = new THREE.Mesh(new THREE.TorusGeometry(0.55, 0.035, 6, 20, Math.PI), metal); handle.position.y = 0.42; handle.rotation.y = 0.3;
    for (let i = 0; i < 3; i++) {
      const d = new THREE.Mesh(new THREE.CapsuleGeometry(0.07, 0.25 + i * 0.1, 2, 6), paint);
      const a = i * 2.1;
      d.position.set(Math.cos(a) * 0.6, 0.15 - i * 0.05, Math.sin(a) * 0.6);
      g.add(d);
    }
    g.add(pot, band, rim, liquid, blob, handle);
    this.glow = makeGlow(this.color, 5, 0.75);
    this.glow.position.y = 0.3;
    g.add(this.glow);
    const [x, z] = def.pos;
    this.base = new THREE.Vector3(x, heightAt(x, z) + def.lift, z);
    g.position.copy(this.base);
    g.scale.setScalar(1.3);
    ctx.scene.add(g);
    this.t = rand(0, 5);
    this.collected = false;
  }
  update(dt) {
    if (this.collected) return;
    this.t += dt;
    this.g.rotation.y += dt * 0.9;
    this.g.position.y = this.base.y + Math.sin(this.t * 1.8) * 0.3;
    this.glow.material.opacity = 0.6 + Math.sin(this.t * 3) * 0.2;
    if (Math.random() < dt * 6) {
      const a = rand(0, TAU), r = rand(0.5, 1.6);
      this.ctx.sparkles.emit({ x: this.g.position.x + Math.cos(a) * r, y: this.g.position.y + rand(-0.5, 1), z: this.g.position.z + Math.sin(a) * r,
        vy: rand(0.4, 1.2), life: rand(0.8, 1.6), size: rand(0.15, 0.35), color: this.color, twinkle: 12 });
    }
  }
}

// ===========================================================================
// Builders
// ===========================================================================
export function windmill(ctx, x, z) {
  const t = new Thing(ctx, { name: 'Windmill', region: 0, snoreH: 12, threshold: 0.18,
    msg: 'The old windmill creaks awake, and its sails begin to turn!' });
  t.part(G.cyl(1.5, 2.4, 9, 14), '#efe3c8', 0, 4.5, 0);
  t.part(G.cyl(2.45, 2.55, 0.6, 14), '#a39b92', 0, 0.3, 0);
  t.part(G.cone(2.35, 2.8, 14), '#b5523b', 0, 10.4, 0);
  t.part(G.box(1.2, 2, 0.25), '#7a4b2a', 0, 1.3, 2.25, { rot: [-0.09, 0, 0] });
  t.part(G.box(0.8, 1, 0.2), '#9fd3f5', 0, 5.2, 1.95, { glow: true, rot: [-0.09, 0, 0] });
  t.part(G.box(0.7, 0.9, 0.2), '#9fd3f5', 1.85, 3.2, 0.2, { glow: true, rot: [0, Math.PI / 2, 0.09] });
  const hub = new THREE.Group(); hub.position.set(0, 8.6, 2.0); t.group.add(hub);
  t.part(G.ball(0.5, 1), '#8b5a3c', 0, 0, 0.25, { parent: hub });
  const sails = new THREE.Group(); sails.position.z = 0.55; hub.add(sails);
  for (let k = 0; k < 4; k++) {
    const arm = new THREE.Group(); arm.rotation.z = k * Math.PI / 2 + 0.35; sails.add(arm);
    t.part(G.box(0.2, 6.2, 0.14), '#8b5a3c', 0, 3.2, 0, { parent: arm });
    t.part(G.box(1.3, 4.6, 0.08, 2.4), '#f6efe0', 0.75, 3.7, 0.06, { parent: arm });
  }
  t.spin = 0;
  t.tick = (dt) => {
    if (!t.awake) return;
    t.spin = Math.min(0.85, t.spin + dt * 0.25);
    sails.rotation.z -= t.spin * dt;
  };
  t.onWake = () => ctx.spawnBirds(t.group.position, 4, 14, 9);
  return t.place(x, z, Math.atan2(-x, -z));
}

const WALLS = ['#f3e3c3', '#f7d6c4', '#e9eef5', '#f2e6a6', '#d9ecd0', '#f6dfe8'];
const ROOFS = ['#c8553d', '#4f7cac', '#8c5e9e', '#d0743c', '#3f8f6b', '#b5523b'];
export function cottage(ctx, x, z, v) {
  const t = new Thing(ctx, { name: 'Cottage', region: 0, snoreH: 6,
    msg: ['A cottage wakes up, and a cozy fire crackles inside!', 'Smoke curls from the chimney — someone is baking bread!',
      'The cottage windows twinkle warmly!', 'A little home blinks awake and smiles!', 'The cottage stretches and lights its lamps!'][v % 5] });
  const wall = WALLS[v % WALLS.length], roof = ROOFS[v % ROOFS.length];
  t.part(G.box(4.4, 3.2, 4, 1.7), wall, 0, 1.6, 0);
  t.part(G.box(4.6, 0.3, 4.2), '#a39b92', 0, 0.15, 0);
  t.part(G.cone(3.65, 2.6, 4, 1.8), roof, 0, 4.5, 0, { rot: [0, Math.PI / 4, 0] });
  t.part(G.box(0.7, 1.8, 0.7), '#9c6b4e', 1.1, 4.9, -0.7);
  t.part(G.box(1.0, 1.8, 0.15), '#7a4b2a', 0, 0.95, 2.05);
  t.part(G.ball(0.07, 0), '#e2b24a', 0.3, 0.95, 2.15);
  for (const sx of [-1.45, 1.45]) {
    t.part(G.box(0.9, 0.9, 0.12), '#9fd3f5', sx, 2.0, 2.04, { glow: true });
    t.part(G.box(1.1, 0.3, 0.4), '#a0754f', sx, 1.45, 2.2);
    for (let i = 0; i < 3; i++) t.part(G.ball(0.13, 1), ['#e5484d', '#f7c948', '#f6a6c1'][(i + v) % 3], sx - 0.35 + i * 0.35, 1.7, 2.25);
  }
  for (const sx of [-2.24, 2.24]) t.part(G.box(0.12, 0.9, 0.9), '#9fd3f5', sx, 2.0, 0, { glow: true });
  t.smokeT = 0;
  const chim = new THREE.Vector3(1.1, 5.9, -0.7);
  t.tick = (dt) => {
    if (!t.awake) return;
    t.smokeT -= dt;
    if (t.smokeT < 0) {
      t.smokeT = 0.35;
      const p = t.group.localToWorld(chim.clone());
      if (ctx.nearCamera(p, 80)) ctx.puffs.emit({ x: p.x, y: p.y, z: p.z, vx: rand(-0.2, 0.4), vy: rand(0.9, 1.4), vz: rand(-0.2, 0.2),
        life: 3.2, size: 0.8, grow: 2.5, color: col('#f4efe8'), alpha: 0.55, drag: 0.3, fadeIn: 0.3 });
    }
  };
  t.onWake = () => {
    const glow = makeGlow('#ffcf7a', 2.2, 0.45);
    glow.position.set(0, 2, 2.4); t.group.add(glow);
  };
  return t;
}

export function pond(ctx) {
  const t = new Thing(ctx, { name: 'Pond', region: 0, threshold: 0.22, snoreH: 1.2,
    msg: 'The pond sparkles awake — look, the fish are jumping!' });
  const w = t.part(G.disc(POND.r + 0.4, 48, 10), '#4aa3d9', 0, 0, 0, { material: waterMaterial, shadow: false });
  w.castShadow = false;
  t.place(POND.x, POND.z, 0, POND.water);
  for (let i = 0; i < 16; i++) {
    const a = i / 16 * TAU + rand(-0.1, 0.1), r = POND.r + rand(0.2, 0.9);
    const wx = POND.x + Math.cos(a) * r, wz = POND.z + Math.sin(a) * r;
    t.part(G.ball(rand(0.35, 0.6), 1), '#a39b92', Math.cos(a) * r, heightAt(wx, wz) - POND.water, Math.sin(a) * r, { scale: [1, 0.6, 1] });
  }
  for (let i = 0; i < 6; i++) {
    const a = rand(0, TAU), r = POND.r - 0.3;
    for (let k = 0; k < 3; k++) {
      const ox = Math.cos(a) * r + rand(-0.4, 0.4), oz = Math.sin(a) * r + rand(-0.4, 0.4), h = rand(1.2, 2);
      t.part(G.cyl(0.04, 0.05, h, 4), '#6b8e3a', ox, h / 2, oz, { rot: [rand(-0.1, 0.1), 0, rand(-0.1, 0.1)] });
      t.part(G.cyl(0.09, 0.09, 0.4, 6), '#7a4b2a', ox, h, oz);
    }
  }
  const base = w.geometry.attributes.position.array.slice();
  const pads = [];
  const fish = [new Fish(ctx, '#f28c38'), new Fish(ctx, '#ffd166')];
  t.fishT = 2;
  t.onWake = () => {
    for (let i = 0; i < 6; i++) {
      const a = rand(0, TAU), r = rand(2, POND.r - 1.5);
      const pad = new THREE.Mesh(new THREE.CircleGeometry(0.6, 12, 0.3, TAU - 0.6), simpleMat('#4f9e45', { side: THREE.DoubleSide }));
      pad.rotation.x = -Math.PI / 2; pad.rotation.z = rand(0, TAU);
      pad.position.set(Math.cos(a) * r, 0.1, Math.sin(a) * r);
      if (i % 2 === 0) {
        const fl = new THREE.Mesh(new THREE.ConeGeometry(0.22, 0.3, 6), simpleMat('#f6a6c1'));
        fl.rotation.x = Math.PI / 2; fl.position.z = 0.15; pad.add(fl);
      }
      pad.scale.setScalar(0.01);
      t.group.add(pad); pads.push(pad);
    }
  };
  t.tick = (dt, time) => {
    for (const f of fish) f.update(dt);
    if (!t.awake) return;
    const p = w.geometry.attributes.position.array;
    for (let i = 0; i < p.length; i += 3) {
      const x = base[i], z = base[i + 2];
      p[i + 1] = Math.sin(x * 1.3 + time * 1.6) * 0.06 + Math.sin(z * 1.7 - time * 1.2) * 0.05;
    }
    w.geometry.attributes.position.needsUpdate = true;
    for (const pad of pads) { pad.scale.setScalar(Math.min(1, pad.scale.x + dt)); pad.position.y = 0.12 + Math.sin(time + pad.rotation.z) * 0.03; }
    t.fishT -= dt;
    if (t.fishT < 0) {
      t.fishT = rand(2, 4.5);
      const f = fish.find(f => f.t < 0);
      if (f) {
        const a = rand(0, TAU), r = rand(0, POND.r - 3), d = rand(1.6, 2.6), b = a + rand(-1, 1);
        const ax = POND.x + Math.cos(a) * r, az = POND.z + Math.sin(a) * r;
        f.jump(ax, az, ax + Math.cos(b) * d, az + Math.sin(b) * d, POND.water + 0.05);
      }
    }
  };
  return t;
}

export function flowerBed(ctx, x, z, ry, palette) {
  const t = new Thing(ctx, { name: 'Flower bed', region: 0, snoreH: 1.5,
    msg: 'The flowers stretch up toward the sun, and butterflies flutter out!' });
  t.part(G.box(5, 0.5, 2.6), '#6e4a32', 0, 0.2, 0);
  t.part(G.box(5.4, 0.4, 0.25), '#a0754f', 0, 0.3, 1.4);
  t.part(G.box(5.4, 0.4, 0.25), '#a0754f', 0, 0.3, -1.4);
  t.part(G.box(0.25, 0.4, 2.8), '#a0754f', 2.7, 0.3, 0);
  t.part(G.box(0.25, 0.4, 2.8), '#a0754f', -2.7, 0.3, 0);
  const flowers = [];
  for (let i = 0; i < 12; i++) {
    const piv = new THREE.Group();
    piv.position.set(-1.9 + (i % 4) * 1.27 + rand(-0.2, 0.2), 0.45, -0.8 + Math.floor(i / 4) * 0.8);
    const droop = rand(0.8, 1.2) * (Math.random() < 0.5 ? 1 : -1);
    piv.rotation.z = droop; piv.rotation.x = rand(-0.4, 0.4);
    t.group.add(piv);
    const h = rand(0.9, 1.3);
    t.part(G.cyl(0.05, 0.06, h, 5, 3), '#4c9a3a', 0, h / 2, 0, { parent: piv });
    t.part(G.box(0.4, 0.05, 0.16), '#5fa84a', 0.15, h * 0.45, 0, { parent: piv, rot: [0, 0, 0.4] });
    t.part(G.ball(0.28, 1), palette[i % palette.length], 0, h + 0.05, 0, { parent: piv, scale: [1, 0.55, 1] });
    t.part(G.ball(0.1, 0), '#ffd84a', 0, h + 0.17, 0, { parent: piv });
    flowers.push({ piv, droop, rx: piv.rotation.x, ph: rand(0, 6) });
  }
  t.onWake = () => {
    const c = t.group.position.clone();
    for (let i = 0; i < 3; i++) ctx.creatures.push(new Butterfly(ctx, c, palette[i % palette.length]));
  };
  let k = 0;
  t.tick = (dt, time) => {
    if (!t.awake) return;
    k = Math.min(1, k + dt * 0.7);
    const e = 1 - Math.pow(1 - k, 3);
    for (const f of flowers) {
      f.piv.rotation.z = f.droop * (1 - e) + Math.sin(time * 1.5 + f.ph) * 0.06;
      f.piv.rotation.x = f.rx * (1 - e);
    }
  };
  return t.place(x, z, ry);
}

export function cat(ctx, x, z) {
  const t = new Thing(ctx, { name: 'Cat', region: 0, threshold: 0.2, snoreH: 1.4,
    msg: 'The sleepy cat stretches, purrs, and decides you are her new best friend!' });
  const body = new THREE.Group(); t.group.add(body);
  t.part(G.ball(0.7, 2), '#f0a04b', 0, 0.75, 0, { parent: body, scale: [0.85, 0.75, 1.35] });
  const head = new THREE.Group(); head.position.set(0, 1.15, 0.95); body.add(head);
  t.part(G.ball(0.48, 2), '#f0a04b', 0, 0, 0, { parent: head });
  t.part(G.cone(0.17, 0.38, 4), '#e08a35', -0.27, 0.42, 0, { parent: head, rot: [0, 0, 0.3] });
  t.part(G.cone(0.17, 0.38, 4), '#e08a35', 0.27, 0.42, 0, { parent: head, rot: [0, 0, -0.3] });
  t.part(G.ball(0.2, 1), '#fff4e6', 0, -0.12, 0.38, { parent: head, scale: [1.3, 0.8, 0.8] });
  t.part(G.ball(0.075, 1), '#2b2b2b', -0.17, 0.1, 0.41, { parent: head });
  t.part(G.ball(0.075, 1), '#2b2b2b', 0.17, 0.1, 0.41, { parent: head });
  t.part(G.ball(0.055, 0), '#e57a8a', 0, -0.02, 0.52, { parent: head });
  const tailPiv = new THREE.Group(); tailPiv.position.set(0, 0.75, -0.85); body.add(tailPiv);
  const curve = new THREE.CatmullRomCurve3([new THREE.Vector3(0, 0, 0), new THREE.Vector3(0.2, 0.15, -0.5), new THREE.Vector3(0.45, 0.6, -0.8), new THREE.Vector3(0.4, 1.1, -0.85)]);
  t.part(new THREE.TubeGeometry(curve, 16, 0.11, 6), '#e08a35', 0, 0, 0, { parent: tailPiv });
  const legs = [];
  for (const [lx, lz] of [[-0.3, 0.55], [0.3, 0.55], [-0.3, -0.55], [0.3, -0.55]]) {
    const lp = new THREE.Group(); lp.position.set(lx, 0.55, lz); body.add(lp);
    t.part(G.cyl(0.1, 0.09, 0.55, 6), '#f0a04b', 0, -0.27, 0, { parent: lp });
    legs.push(lp);
  }
  // sleeping pose
  body.position.y = -0.45; head.rotation.x = 0.55; head.position.y = 0.85; tailPiv.rotation.y = 1.2;
  let stand = 0, phase = 0, state = 'sit', heartT = 0, meowT = 6;
  t.home = new THREE.Vector3(x, 0, z);
  t.onWake = (silent) => { if (!silent) ctx.audio.meow(); };
  t.tick = (dt, time) => {
    if (!t.awake) { body.position.y = -0.45 + Math.sin(time * 1.4) * 0.03; return; }
    stand = Math.min(1, stand + dt * 1.2);
    const b = ctx.brushPos;
    const g = t.group.position;
    const dx = b.x - g.x, dz = b.z - g.z, d = Math.hypot(dx, dz);
    if (d > 5) state = 'walk'; else if (d < 3.5) state = 'sit';
    let spd = 0;
    if (state === 'walk' && stand >= 1) {
      spd = d > 18 ? 9 : 4.2;
      g.x += dx / d * spd * dt; g.z += dz / d * spd * dt;
      const want = Math.atan2(dx, dz);
      let diff = want - t.group.rotation.y; diff = Math.atan2(Math.sin(diff), Math.cos(diff));
      t.group.rotation.y += diff * Math.min(1, dt * 6);
      // stay out of the water
      const pd = Math.hypot(g.x - POND.x, g.z - POND.z);
      if (pd < POND.r + 0.8) { g.x = POND.x + (g.x - POND.x) / pd * (POND.r + 0.8); g.z = POND.z + (g.z - POND.z) / pd * (POND.r + 0.8); }
      const ldx = (g.x - LAKE.x) / LAKE.sx, ldz = g.z - LAKE.z, ld = Math.hypot(ldx, ldz);
      if (ld < LAKE.r - 0.5) { g.x = LAKE.x + ldx / ld * (LAKE.r - 0.5) * LAKE.sx; g.z = LAKE.z + ldz / ld * (LAKE.r - 0.5); }
    }
    g.y = heightAt(g.x, g.z);
    phase += dt * spd * 2.4;
    legs.forEach((l, i) => { l.rotation.x = spd ? Math.sin(phase + (i % 2 ? Math.PI : 0) + (i > 1 ? Math.PI / 2 : 0)) * 0.6 : l.rotation.x * 0.9; });
    const sitting = state === 'sit' ? 1 : 0;
    body.position.y = -0.45 * (1 - stand) + (spd ? Math.abs(Math.sin(phase)) * 0.08 : 0) - sitting * 0.12;
    body.rotation.x = -sitting * 0.18;
    head.rotation.x = 0.55 * (1 - stand) + Math.sin(time * 0.7) * 0.08 - sitting * 0.1;
    head.position.y = 0.85 + 0.3 * stand;
    tailPiv.rotation.y = 1.2 * (1 - stand) + Math.sin(time * (spd ? 6 : 2)) * 0.35;
    tailPiv.rotation.x = -0.2 * stand;
    if (state === 'sit' && ctx.brushSpeed < 1.5) {
      heartT -= dt;
      if (heartT < 0) {
        heartT = 1.2;
        const p = head.getWorldPosition(new THREE.Vector3());
        ctx.puffs.emit({ x: p.x, y: p.y + 0.5, z: p.z, vy: 0.9, life: 1.6, size: 0.45, color: col('#ff6b8a'), sway: 0.6 });
        ctx.audio.purr();
      }
    }
    meowT -= dt;
    if (meowT < 0) { meowT = rand(12, 25); if (ctx.nearCamera(g, 30)) ctx.audio.meow(); }
  };
  return t.place(x, z, 0.8);
}

export function tree(ctx, x, z, seed, kind = 'apple', region = 0) {
  const cherry = kind === 'cherry';
  const t = new Thing(ctx, { name: cherry ? 'Cherry tree' : 'Tree', region, snoreH: 6.5,
    msg: cherry ? 'The cherry tree bursts into blossom, and petals drift on the breeze!' :
      ['The tree rustles awake — birds start singing!', 'Shiny apples pop out on the tree!', 'The old oak waves its branches hello!'][Math.floor(seed) % 3] });
  const trunkC = cherry ? '#6b4a3a' : '#8b5a3c';
  t.part(G.cyl(0.32, 0.5, 3.2, 8), trunkC, 0, 1.6, 0);
  t.part(G.cyl(0.12, 0.2, 1.6, 6), trunkC, 0.6, 3, 0.1, { rot: [0, 0, -0.7] });
  const crown = new THREE.Group(); crown.position.y = 3.2; t.group.add(crown);
  const greens = cherry ? ['#f7b6cc', '#f4a3bf', '#fbc8d8'] : ['#5fae4a', '#6cbb52', '#4f9e45'];
  const blobs = [[0, 1.4, 0, 2.0], [1.1, 0.7, 0.5, 1.45], [-1.0, 0.8, -0.4, 1.55], [0.2, 0.6, -1.0, 1.3]];
  blobs.forEach(([bx, by, bz, r], i) => t.part(G.lumpy(r, 0.18, 2, seed + i), greens[i % 3], bx, by, bz, { parent: crown }));
  const extras = [];
  t.onWake = () => {
    if (!cherry) {
      for (let i = 0; i < 7; i++) {
        const [bx, by, bz, r] = blobs[i % blobs.length];
        const d = new THREE.Vector3(rand(-1, 1), rand(-0.3, 1), rand(-1, 1)).normalize().multiplyScalar(r * 0.95);
        const a = new THREE.Mesh(new THREE.IcosahedronGeometry(0.18, 1), simpleMat('#e5484d', { roughness: 0.4 }));
        a.position.set(bx + d.x, by + d.y, bz + d.z); a.scale.setScalar(0.01);
        crown.add(a); extras.push(a);
      }
    }
  };
  t.tick = (dt, time) => {
    if (!t.awake) return;
    crown.rotation.z = Math.sin(time * 0.9 + seed) * 0.035;
    crown.rotation.x = Math.sin(time * 0.7 + seed * 2) * 0.025;
    for (const a of extras) a.scale.setScalar(Math.min(1, a.scale.x + dt * 1.5));
    const p = t.group.position;
    if (cherry && Math.random() < dt * 2.5 && ctx.nearCamera(p, 60)) {
      ctx.puffs.emit({ x: p.x + rand(-2, 2), y: p.y + rand(3.5, 5.5), z: p.z + rand(-2, 2), vx: rand(0.2, 0.8), vy: -0.5, vz: rand(-0.3, 0.3),
        life: 5, size: 0.22, color: col('#f9b8cf'), sway: 1.2, onLand: () => {} });
    }
    if (!cherry && Math.random() < dt * 0.06 && ctx.nearCamera(p, 35)) ctx.audio.chirp(0.03);
  };
  return t.place(x, z, rand(0, TAU));
}

export function lamp(ctx, x, z) {
  const t = new Thing(ctx, { name: 'Lamp post', region: 0, snoreH: 3.6,
    msg: 'The lamp post glows, and fireflies come out to dance!' });
  t.part(G.cyl(0.3, 0.35, 0.3, 8), '#3d3d46', 0, 0.15, 0);
  t.part(G.cyl(0.09, 0.12, 3.2, 8), '#3d3d46', 0, 1.6, 0);
  t.part(G.box(0.6, 0.75, 0.6, 3), '#ffd97a', 0, 3.55, 0, { glow: true });
  t.part(G.cone(0.55, 0.5, 4), '#3d3d46', 0, 4.15, 0, { rot: [0, Math.PI / 4, 0] });
  let glow;
  t.onWake = () => { glow = makeGlow('#ffd27a', 4.5, 0.7); glow.position.y = 3.55; t.group.add(glow); };
  t.tick = (dt, time) => {
    if (!t.awake) return;
    glow.material.opacity = 0.55 + Math.sin(time * 3) * 0.08;
    const p = t.group.position;
    if (Math.random() < dt * 3 && ctx.nearCamera(p, 50)) {
      ctx.sparkles.emit({ x: p.x + rand(-2.5, 2.5), y: p.y + rand(1, 4), z: p.z + rand(-2.5, 2.5), vx: rand(-0.3, 0.3), vy: rand(-0.1, 0.3), vz: rand(-0.3, 0.3),
        life: rand(2, 4), size: 0.22, color: col('#d8ff7a'), twinkle: 5, sway: 0.5, fadeIn: 0.5 });
    }
  };
  return t.place(x, z);
}

export function well(ctx, x, z) {
  const t = new Thing(ctx, { name: 'Wishing well', region: 0, snoreH: 4,
    msg: 'The wishing well gurgles awake — make a wish!' });
  t.part(G.cyl(1.3, 1.45, 1.2, 16), '#a9a39a', 0, 0.6, 0);
  t.part(G.disc(1.05, 16, 3), '#3f6fa8', 0, 1.0, 0);
  t.part(G.box(0.22, 2.6, 0.22), '#8b5a3c', -1.2, 2.2, 0);
  t.part(G.box(0.22, 2.6, 0.22), '#8b5a3c', 1.2, 2.2, 0);
  t.part(G.cyl(0.08, 0.08, 2.6, 6), '#8b5a3c', 0, 3.1, 0, { rot: [0, 0, Math.PI / 2] });
  t.part(G.cone(2.0, 1.3, 4), '#b5523b', 0, 4.0, 0, { rot: [0, Math.PI / 4, 0] });
  const bucket = t.part(G.cyl(0.3, 0.24, 0.45, 8), '#8b5a3c', 0, 2.1, 0);
  t.tick = (dt, time) => {
    if (!t.awake) return;
    bucket.position.y = 2.1 + Math.sin(time * 0.8) * 0.5;
    bucket.rotation.y += dt;
    const p = t.group.position;
    if (Math.random() < dt * 2 && ctx.nearCamera(p, 40)) ctx.sparkles.emit({ x: p.x + rand(-0.8, 0.8), y: p.y + 1.1, z: p.z + rand(-0.8, 0.8), vy: rand(0.5, 1.4), life: 1.2, size: 0.25, color: col('#a8e4ff'), twinkle: 10 });
  };
  return t.place(x, z, 0.3);
}

// ---------------- Lakeside ----------------
export function lake(ctx) {
  const t = new Thing(ctx, { name: 'Glimmerlake', region: 1, threshold: 0.14, snoreH: 2,
    msg: 'The whole lake shimmers awake — ducks paddle out to say hello!' });
  const w = t.part(G.disc(LAKE.r, 72, 18), '#3f97d1', 0, 0, 0, { material: waterMaterial, scale: [LAKE.sx, 1, 1], shadow: false });
  w.castShadow = false;
  t.place(LAKE.x, LAKE.z, 0, LAKE.water);
  const base = w.geometry.attributes.position.array.slice();
  const fish = [new Fish(ctx, '#f28c38'), new Fish(ctx, '#c0c8d8'), new Fish(ctx, '#ffd166')];
  t.fishT = 2;
  t.onWake = () => {
    for (let i = 0; i < 4; i++) ctx.creatures.push(new Duck(ctx, LAKE.x - 4, LAKE.z - 2, 12 * LAKE.sx, 12, LAKE.water, i));
  };
  t.tick = (dt, time) => {
    for (const f of fish) f.update(dt);
    if (!t.awake) return;
    const p = w.geometry.attributes.position.array;
    for (let i = 0; i < p.length; i += 3) {
      const x = base[i], z = base[i + 2];
      p[i + 1] = Math.sin(x * 0.6 + time * 1.2) * 0.09 + Math.sin(z * 0.8 - time * 0.9) * 0.07;
    }
    w.geometry.attributes.position.needsUpdate = true;
    t.fishT -= dt;
    if (t.fishT < 0) {
      t.fishT = rand(1.5, 3.5);
      const f = fish.find(f => f.t < 0);
      if (f) {
        const a = rand(0, TAU), r = rand(10, 21), b = a + rand(-1, 1), d = rand(2, 3);
        const ax = LAKE.x + Math.cos(a) * r * LAKE.sx, az = LAKE.z + Math.sin(a) * r;
        f.jump(ax, az, ax + Math.cos(b) * d, az + Math.sin(b) * d, LAKE.water + 0.05);
      }
    }
    if (Math.random() < dt * 4 && ctx.nearCamera(t.group.position, 90)) {
      const a = rand(0, TAU), r = rand(0, 24);
      ctx.sparkles.emit({ x: LAKE.x + Math.cos(a) * r * LAKE.sx, y: LAKE.water + 0.2, z: LAKE.z + Math.sin(a) * r, life: 0.8, size: 0.35, color: col('#ffffff'), twinkle: 14 });
    }
  };
  return t;
}

export function boat(ctx) {
  const t = new Thing(ctx, { name: 'Sailboat', region: 1, snoreH: 4,
    msg: 'The little sailboat catches the breeze and sets off across the lake!' });
  const rig = new THREE.Group(); t.group.add(rig);
  t.part(G.box(1.7, 0.7, 3.8), '#b5653b', 0, 0.2, 0, { parent: rig });
  t.part(G.cone(0.85, 1.2, 4), '#b5653b', 0, 0.2, 2.4, { parent: rig, rot: [Math.PI / 2, Math.PI / 4, 0], scale: [1.4, 1, 0.5] });
  t.part(G.box(1.8, 0.15, 3.9), '#f2e6c8', 0, 0.6, 0, { parent: rig });
  t.part(G.box(1.5, 0.15, 0.5), '#8b5a3c', 0, 0.55, -0.9, { parent: rig });
  t.part(G.cyl(0.07, 0.09, 3.6, 6), '#8b5a3c', 0, 2.3, 0.3, { parent: rig });
  t.part(G.box(0.06, 2.5, 1.8, 2.4), '#fbf7ee', 0, 2.4, -0.65, { parent: rig });
  t.part(G.box(0.04, 0.35, 0.6), '#e5484d', 0, 4.0, 0.0, { parent: rig });
  const moor = new THREE.Vector3(63.5, LAKE.water, 5.5);
  t.place(moor.x, moor.z, 0.4, LAKE.water);
  const R = 17;
  let a = Math.atan2(moor.z - LAKE.z, (moor.x - LAKE.x) / LAKE.sx), go = 0;
  const start = moor.clone();
  t.tick = (dt, time) => {
    rig.position.y = Math.sin(time * 1.3) * 0.08;
    rig.rotation.z = Math.sin(time * 1.1) * 0.04;
    if (!t.awake) return;
    go = Math.min(1, go + dt * 0.25);
    a -= dt * 0.045 * go;
    const tx = LAKE.x + Math.cos(a) * R * LAKE.sx, tz = LAKE.z + Math.sin(a) * R;
    const g = t.group.position;
    const nx = start.x + (tx - start.x) * go, nz = start.z + (tz - start.z) * go;
    const heading = Math.atan2(nx - g.x, nz - g.z);
    if (Math.hypot(nx - g.x, nz - g.z) > 0.0005) {
      let diff = heading - t.group.rotation.y; diff = Math.atan2(Math.sin(diff), Math.cos(diff));
      t.group.rotation.y += diff * Math.min(1, dt * 2);
    }
    g.x = nx; g.z = nz;
  };
  return t;
}

export function dock(ctx) {
  const t = new Thing(ctx, { name: 'Dock', region: 1, snoreH: 2,
    msg: 'The old dock lights its lantern — a perfect spot for fishing!' });
  t.part(G.box(9, 0.25, 2), '#a0754f', 0, 0, 0);
  for (let i = 0; i < 5; i++) for (const sz of [-0.9, 0.9]) t.part(G.cyl(0.13, 0.13, 2.4, 6), '#7a4b2a', -4 + i * 2, -0.9, sz);
  t.part(G.box(0.15, 1.6, 0.15), '#7a4b2a', 4.3, 0.9, 0.8);
  t.part(G.box(0.45, 0.55, 0.45, 3), '#ffd97a', 4.3, 1.9, 0.8, { glow: true });
  let glow;
  t.onWake = () => { glow = makeGlow('#ffd27a', 3.5, 0.6); glow.position.set(4.3, 1.9, 0.8); t.group.add(glow); };
  return t.place(57.5, 2, 0, 0.35);
}

export function lighthouse(ctx) {
  const t = new Thing(ctx, { name: 'Lighthouse', region: 1, snoreH: 12, threshold: 0.18,
    msg: 'The lighthouse blinks awake and sweeps its warm light across the water!' });
  t.part(G.cyl(1.3, 1.9, 8, 14), '#fbf7ee', 0, 4, 0);
  t.part(G.cyl(1.72, 1.82, 1, 14), '#d6453d', 0, 1.6, 0);
  t.part(G.cyl(1.5, 1.6, 1, 14), '#d6453d', 0, 4.6, 0);
  t.part(G.box(0.8, 1.3, 0.2), '#7a4b2a', 0, 0.65, 1.85, { rot: [-0.07, 0, 0] });
  t.part(G.cyl(1.8, 1.8, 0.3, 14), '#3d3d46', 0, 8.15, 0);
  t.part(G.cyl(1.0, 1.0, 1.4, 12), '#ffe9a8', 0, 9.0, 0, { glow: true });
  t.part(G.cone(1.35, 1.3, 12), '#d6453d', 0, 10.35, 0);
  t.part(G.ball(0.2, 1), '#e2b24a', 0, 11.1, 0);
  const beam = new THREE.Group(); beam.position.y = 9; beam.visible = false; t.group.add(beam);
  const bm = new THREE.MeshBasicMaterial({ color: '#fff2b0', transparent: true, opacity: 0.16, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
  for (const s of [1, -1]) {
    const c = new THREE.Mesh(new THREE.ConeGeometry(2.2, 22, 20, 1, true).translate(0, -11, 0), bm);
    c.rotation.z = s * Math.PI / 2; beam.add(c);
  }
  t.onWake = () => { beam.visible = true; const g = makeGlow('#ffe9a8', 7, 0.8); g.position.y = 9; t.group.add(g); };
  t.tick = (dt) => { if (t.awake) beam.rotation.y += dt * 0.6; };
  return t.place(118, 40, -2.2, heightAt(118, 40) - 0.3);
}

export function caveShell(ctx) {
  const g = new THREE.Group();
  const rock = new THREE.MeshStandardMaterial({ color: '#8e857b', roughness: 1, flatShading: true, side: THREE.DoubleSide });
  const geo = new THREE.SphereGeometry(7, 28, 12, 0.6, TAU - 1.2, 0, Math.PI / 2);
  const p = geo.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const n = fbm(p.getX(i) * 0.5 + 9, p.getZ(i) * 0.5 + p.getY(i) * 0.3);
    const s = 0.88 + n * 0.3;
    p.setXYZ(i, p.getX(i) * s, p.getY(i) * s, p.getZ(i) * s);
  }
  geo.computeVertexNormals();
  const shell = new THREE.Mesh(geo, rock);
  shell.scale.set(1, 0.85, 1.15); shell.castShadow = true; shell.receiveShadow = true;
  g.add(shell);
  for (let i = 0; i < 6; i++) {
    const b = new THREE.Mesh(G.lumpy(rand(0.8, 1.6), 0.3, 1, i), rock);
    const a = (i < 3 ? -0.75 : 0.75) + rand(-0.15, 0.15), r = 7.3;
    b.position.set(-Math.cos(a) * r, rand(0, 0.5), Math.sin(a) * r * 1.15);
    b.castShadow = true;
    g.add(b);
  }
  const x = 108, z = -30;
  g.position.set(x, heightAt(x, z) - 0.6, z);
  ctx.scene.add(g);
  return g;
}

export function mushrooms(ctx) {
  const t = new Thing(ctx, { name: 'Glow mushrooms', region: 1, snoreH: 1.5, threshold: 0.2,
    msg: 'The cave mushrooms light up with a soft, magical glow!' });
  const x = 109, z = -30;
  t.place(x, z);
  const caps = ['#b07be0', '#6fd6e8', '#f6a6c1', '#9b8cff'];
  for (let i = 0; i < 8; i++) {
    const a = rand(-1.6, 1.6), r = rand(1.5, 4.2);
    const lx = Math.cos(a) * r, lz = Math.sin(a) * r * 1.2;
    const ly = heightAt(x + lx, z + lz) - t.group.position.y;
    const h = rand(0.5, 1.3), cr = rand(0.35, 0.7);
    t.part(G.cyl(cr * 0.25, cr * 0.32, h, 6, 3), '#efe6d2', lx, ly + h / 2, lz);
    t.part(new THREE.SphereGeometry(cr, 14, 6, 0, TAU, 0, Math.PI / 2), caps[i % 4], lx, ly + h, lz, { glow: true });
  }
  t.onWake = () => {
    const g = makeGlow('#a58cff', 9, 0.5); g.position.y = 1.5; t.group.add(g);
  };
  t.tick = (dt) => {
    if (!t.awake) return;
    const p = t.group.position;
    if (Math.random() < dt * 4) ctx.sparkles.emit({ x: p.x + rand(-4, 3), y: p.y + rand(0.5, 4), z: p.z + rand(-4, 4), vx: rand(-0.2, 0.2), vy: rand(0, 0.3),
      life: rand(2, 4), size: 0.2, color: col(['#b6a2ff', '#7ff0ff', '#ffb3df'][Math.floor(rand(0, 3))]), twinkle: 6, sway: 0.4, fadeIn: 0.5 });
  };
  return t;
}

// ---------------- Mountains ----------------
export function pine(ctx, x, z, seed) {
  const t = new Thing(ctx, { name: 'Pine tree', region: 2, snoreH: 6.5,
    msg: ['The pine tree shakes off its sleep with a snowy sparkle!', 'A tall pine sways and whistles in the wind!'][seed % 2] });
  t.part(G.cyl(0.25, 0.38, 1.8, 7), '#6b4a3a', 0, 0.9, 0);
  t.part(G.cone(2.1, 2.7, 9), '#2f7d4f', 0, 2.6, 0);
  t.part(G.cone(1.65, 2.3, 9), '#35895a', 0, 3.9, 0);
  t.part(G.cone(1.2, 2.0, 9), '#2f7d4f', 0, 5.0, 0);
  t.part(G.cone(0.55, 0.75, 9), '#f6f9ff', 0, 6.0, 0);
  t.tick = (dt, time) => {
    if (!t.awake) return;
    t.group.rotation.z = Math.sin(time * 0.8 + seed) * 0.025;
    const p = t.group.position;
    if (Math.random() < dt * 1.5 && ctx.nearCamera(p, 50)) ctx.sparkles.emit({ x: p.x + rand(-1.5, 1.5), y: p.y + rand(2, 6), z: p.z + rand(-1.5, 1.5), vy: -0.4, life: 1.5, size: 0.2, color: col('#ffffff'), twinkle: 10 });
  };
  const s = 0.9 + (seed % 3) * 0.2;
  t.group.scale.setScalar(1);
  return t.place(x, z, seed);
}

export function balloon(ctx, x, z) {
  const t = new Thing(ctx, { name: 'Hot-air balloon', region: 2, threshold: 0.2, snoreH: 3,
    msg: 'Whoosh! The hot-air balloon fills with warm air and floats up into the sky!' });
  const rig = new THREE.Group(); t.group.add(rig);
  t.part(G.box(1.4, 1, 1.4, 2.4), '#a0754f', 0, 0.5, 0, { parent: rig });
  t.part(G.box(1.55, 0.15, 1.55), '#7a4b2a', 0, 1.02, 0, { parent: rig });
  const ropes = [];
  for (const [rx, rz] of [[-0.6, -0.6], [0.6, -0.6], [-0.6, 0.6], [0.6, 0.6]]) {
    ropes.push(t.part(G.cyl(0.03, 0.03, 2.6, 3), '#6b4a3a', rx, 2.3, rz, { parent: rig }));
  }
  const env = new THREE.Group(); env.position.set(0, 3.3, 0); rig.add(env);
  t.part(G.lathe([[0.45, 0], [1.3, 0.6], [2.5, 1.9], [2.95, 3.4], [2.75, 4.8], [2.0, 5.8], [1.0, 6.4], [0.02, 6.6]], 26, 24), '#e5484d', 0, 0, 0, { parent: env });
  const flame = makeGlow('#ffa64d', 1.8, 0); flame.position.y = 3.3; rig.add(flame);
  // deflated pose
  env.rotation.z = 1.45; env.position.set(1.3, 0.5, 0); env.scale.set(1, 0.35, 1);
  ropes.forEach(r => r.visible = false);
  let inflate = 0, rise = 0, a = 0;
  const center = new THREE.Vector3(18, 0, -78);
  t.tick = (dt, time) => {
    if (!t.awake) return;
    inflate = Math.min(1, inflate + dt * 0.4);
    const e = 1 - Math.pow(1 - inflate, 3);
    env.rotation.z = 1.45 * (1 - e);
    env.position.set(1.3 * (1 - e), 0.5 + 2.8 * e, 0);
    env.scale.set(1, 0.35 + 0.65 * e, 1);
    ropes.forEach(r => r.visible = inflate > 0.6);
    flame.material.opacity = inflate > 0.3 ? 0.6 + Math.sin(time * 20) * 0.25 : 0;
    if (inflate < 1) return;
    rise = Math.min(1, rise + dt * 0.06);
    a += dt * 0.05 * rise;
    const g = t.group.position;
    const px = center.x + Math.sin(a) * 26 - g.x, pz = center.z + Math.sin(a * 2) * 14 - g.z;
    const wx = g.x + px * rise, wz = g.z + pz * rise;
    const wantY = Math.max(heightAt(wx, wz), 6) + 16 + Math.sin(time * 0.5) * 1.5;
    rig.position.set(px * rise, (wantY - g.y) * rise, pz * rise);
    rig.rotation.y += dt * 0.08;
    if (Math.random() < dt * 0.15 && ctx.nearCamera(rig.getWorldPosition(new THREE.Vector3()), 40)) ctx.audio.whoosh();
  };
  t.onWake = (silent) => { if (!silent) ctx.audio.whoosh(); };
  t.focus = (out = new THREE.Vector3()) => rig.getWorldPosition(out).add(new THREE.Vector3(0, 3, 0));
  return t.place(x, z, 0.5);
}

export function sheep(ctx, x, z, seed) {
  const t = new Thing(ctx, { name: 'Sheep', region: 2, snoreH: 2, threshold: 0.22,
    msg: ['Baa! A fluffy sheep hops up and trots about!', 'The sheep wakes with a happy little hop!', 'A woolly friend gets up to nibble the grass!'][seed % 3] });
  const body = new THREE.Group(); t.group.add(body);
  t.part(G.lumpy(0.85, 0.3, 2, seed), '#f7f3ea', 0, 1.05, 0, { parent: body, scale: [0.95, 0.85, 1.3] });
  const head = new THREE.Group(); head.position.set(0, 1.3, 1.1); body.add(head);
  t.part(G.ball(0.38, 1), '#3b3330', 0, 0, 0.1, { parent: head, scale: [0.85, 1, 1.2] });
  t.part(G.box(0.35, 0.1, 0.15), '#3b3330', -0.35, 0.12, 0, { parent: head, rot: [0, 0, 0.4] });
  t.part(G.box(0.35, 0.1, 0.15), '#3b3330', 0.35, 0.12, 0, { parent: head, rot: [0, 0, -0.4] });
  t.part(G.lumpy(0.28, 0.3, 1, seed + 3), '#f7f3ea', 0, 0.3, 0, { parent: head });
  const legs = [];
  for (const [lx, lz] of [[-0.38, 0.55], [0.38, 0.55], [-0.38, -0.55], [0.38, -0.55]]) {
    const lp = new THREE.Group(); lp.position.set(lx, 0.7, lz); body.add(lp);
    t.part(G.cyl(0.1, 0.09, 0.7, 5), '#3b3330', 0, -0.35, 0, { parent: lp });
    legs.push(lp);
  }
  body.position.y = -0.55; head.rotation.x = 0.5;
  const home = new THREE.Vector3(x, 0, z);
  const target = home.clone();
  let stand = 0, wait = 1, phase = 0, hop = 0;
  t.tick = (dt, time) => {
    if (!t.awake) { body.position.y = -0.55 + Math.sin(time * 1.2 + seed) * 0.03; return; }
    stand = Math.min(1, stand + dt);
    const g = t.group.position;
    const dx = target.x - g.x, dz = target.z - g.z, d = Math.hypot(dx, dz);
    let spd = 0;
    if (d > 0.3) {
      spd = 1.6;
      g.x += dx / d * spd * dt; g.z += dz / d * spd * dt;
      let diff = Math.atan2(dx, dz) - t.group.rotation.y; diff = Math.atan2(Math.sin(diff), Math.cos(diff));
      t.group.rotation.y += diff * Math.min(1, dt * 4);
    } else {
      wait -= dt;
      if (wait < 0) {
        wait = rand(2, 6);
        target.set(home.x + rand(-9, 9), 0, home.z + rand(-7, 7));
        if (Math.random() < 0.5 && ctx.nearCamera(g, 40)) ctx.audio.baa();
        if (Math.random() < 0.4) hop = 1;
      }
    }
    g.y = heightAt(g.x, g.z);
    hop = Math.max(0, hop - dt * 2.5);
    phase += dt * spd * 4;
    legs.forEach((l, i) => l.rotation.x = Math.sin(phase + (i % 2 ? Math.PI : 0)) * 0.5 * (spd ? 1 : 0));
    body.position.y = -0.55 * (1 - stand) + Math.sin(hop * Math.PI) * 0.7;
    head.rotation.x = 0.5 * (1 - stand) + (spd ? 0 : Math.max(0, Math.sin(time * 0.6 + seed)) * 0.6);
  };
  t.onWake = (silent) => { if (!silent) ctx.audio.baa(); };
  return t.place(x, z, seed);
}

export function summitBell(ctx) {
  const t = new Thing(ctx, { name: 'Summit bell', region: 2, snoreH: 5,
    msg: 'BONG! The summit bell rings out across the whole kingdom!' });
  t.part(G.box(0.35, 4, 0.35), '#8b5a3c', -1.5, 2, 0);
  t.part(G.box(0.35, 4, 0.35), '#8b5a3c', 1.5, 2, 0);
  t.part(G.box(3.6, 0.35, 0.5), '#8b5a3c', 0, 4.1, 0);
  t.part(G.cone(2.6, 1.4, 4), '#b5523b', 0, 5, 0, { rot: [0, Math.PI / 4, 0] });
  t.part(G.box(4, 0.3, 2.2), '#a39b92', 0, 0.1, 0);
  const piv = new THREE.Group(); piv.position.y = 3.9; t.group.add(piv);
  t.part(G.lathe([[0.02, 0], [0.35, -0.08], [0.45, -0.45], [0.55, -0.9], [0.82, -1.3], [0.85, -1.4]], 18, 14), '#e2b24a', 0, 0, 0, { parent: piv });
  t.part(G.ball(0.16, 1), '#8b5a3c', 0, -1.35, 0, { parent: piv });
  let swing = 0, next = 0;
  t.onWake = (silent) => { if (!silent) { swing = 1; ctx.audio.bell(0.16); } };
  t.tick = (dt, time) => {
    if (!t.awake) return;
    swing = Math.max(0, swing - dt * 0.15);
    piv.rotation.z = Math.sin(time * 2.4) * 0.4 * swing;
    next -= dt;
    if (next < 0) {
      next = rand(18, 30);
      if (ctx.nearCamera(t.group.position, 60)) { swing = 0.6; ctx.audio.bell(0.08); }
    }
  };
  return t.place(36, -97, 0.4);
}
