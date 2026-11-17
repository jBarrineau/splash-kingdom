import * as THREE from 'three';
import { COLORS, REGIONS, COLLECTIBLES, UNLOCK_TEXT } from './data.js';
import { Terrain, heightAt, normalAt, regionOf, LAKE, POND, BOUNDS } from './terrain.js';
import { PaintSystem, packColors, unpackColors } from './paint.js';
import { Particles, Snores, FlowerField, makeGlow } from './fx.js';
import { AudioEngine } from './audio.js';
import * as B from './things.js';
import { UI } from './ui.js';

const $ = id => document.getElementById(id);
const rand = (a = 0, b = 1) => a + Math.random() * (b - a);
const V3 = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const srgb = hex => new THREE.Color().setHex(new THREE.Color(hex).getHex(), THREE.LinearSRGBColorSpace);
const SAVE_KEY = 'splashKingdom.save.v1';
const BRUSH_SIZES = [{ r: 1.3, name: 'Small', ic: '•' }, { r: 2.1, name: 'Medium', ic: '●' }, { r: 3.3, name: 'Large', ic: '⬤' }];

// ---------------------------------------------------------------------------
// Renderer / scene
const canvas = $('game');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.NeutralToneMapping;
renderer.toneMappingExposure = 1.05;

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(50, innerWidth / innerHeight, 0.3, 1400);
scene.fog = new THREE.Fog(0xcfd0d0, 90, 330);

// ---------- sky ----------
const skyU = {
  top: { value: srgb('#9ea3a8') }, mid: { value: srgb('#d3d4d4') }, bot: { value: srgb('#b9bcbf') },
  sunDir: { value: V3(0.5, 0.6, 0.3).normalize() }, sunCol: { value: srgb('#888888') },
};
const sky = new THREE.Mesh(new THREE.SphereGeometry(650, 32, 16), new THREE.ShaderMaterial({
  side: THREE.BackSide, depthWrite: false, uniforms: skyU,
  vertexShader: `varying vec3 vP; void main(){ vP = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
  fragmentShader: `uniform vec3 top, mid, bot, sunCol, sunDir; varying vec3 vP;
    void main(){
      float h = vP.y;
      vec3 c = h > 0.0 ? mix(mid, top, pow(smoothstep(0.0, 0.55, h), 0.75)) : mix(mid, bot, smoothstep(0.0, -0.15, h));
      float s = max(0.0, dot(normalize(vP), normalize(sunDir)));
      c += sunCol * (pow(s, 90.0) * 1.2 + pow(s, 8.0) * 0.22);
      gl_FragColor = vec4(c, 1.0);
    }`,
}));
sky.renderOrder = -1;
scene.add(sky);

// ---------- lights ----------
const hemi = new THREE.HemisphereLight(0xd8dadc, 0x8a8a8a, 1.15);
scene.add(hemi);
const sun = new THREE.DirectionalLight(0xffffff, 1.7);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
const sc = sun.shadow.camera; sc.left = -45; sc.right = 45; sc.top = 45; sc.bottom = -45; sc.near = 1; sc.far = 220;
sun.shadow.bias = -0.0006; sun.shadow.normalBias = 0.04;
scene.add(sun, sun.target);
const SUN_OFFSET = V3(55, 80, 35);

// ---------- clouds ----------
const cloudMat = new THREE.MeshStandardMaterial({ color: '#b4b6b8', roughness: 1, flatShading: true, emissive: '#ffffff', emissiveIntensity: 0.05 });
const clouds = [];
for (let i = 0; i < 14; i++) {
  const g = new THREE.Group();
  const n = 4 + Math.floor(rand(0, 4));
  for (let k = 0; k < n; k++) {
    const m = new THREE.Mesh(new THREE.IcosahedronGeometry(rand(4, 8), 1), cloudMat);
    m.position.set(k * 6 - n * 3 + rand(-2, 2), rand(-1, 2), rand(-3, 3));
    m.scale.y = 0.6;
    g.add(m);
  }
  g.position.set(rand(-120, 200), rand(70, 100), rand(-200, 110));
  g.userData.sp = rand(0.6, 1.4);
  scene.add(g); clouds.push(g);
}

// ---------------------------------------------------------------------------
// World
const terrain = new Terrain();
scene.add(terrain.mesh);
const paint = new PaintSystem();
const puffs = new Particles(scene, 1800, false, 0.15);
const sparkles = new Particles(scene, 1500, true, 0.0);
const snores = new Snores(scene);
const flowers = new FlowerField(scene, 3500);
const audio = new AudioEngine();

const brushPos = V3(0, 4, 6);
const ctx = {
  scene, snores, puffs, sparkles, audio, creatures: [],
  brushPos, brushSpeed: 0,
  nearCamera: (p, d) => p.distanceTo(cam.target) < d,
  spawnBirds(center, n, h, r) {
    for (let i = 0; i < n; i++) ctx.creatures.push(new B.Bird(ctx, center, h + rand(-2, 3), r + rand(-2, 4)));
  },
  splashAt(p, vol = 1) {
    if (ctx.nearCamera(p, 45)) audio.splash(vol);
    for (let i = 0; i < 14; i++) {
      const a = rand(0, Math.PI * 2), s = rand(1, 2.5);
      puffs.emit({ x: p.x, y: p.y + 0.1, z: p.z, vx: Math.cos(a) * s, vy: rand(2.5, 5), vz: Math.sin(a) * s, gravity: -14, life: 0.8, size: 0.18, color: new THREE.Color('#dff3ff') });
    }
  },
};

// ---------- things ----------
const things = [];
const addThing = t => { things.push(t); scene.add(t.group); };
const faceCenter = (x, z) => Math.atan2(-x, -z);
addThing(B.windmill(ctx, -18, -20));
[[8, -11], [-12, -4], [-24, 6], [20, -24], [30, 10]].forEach(([x, z], i) => addThing(B.cottage(ctx, x, z, i).place(x, z, faceCenter(x, z) + rand(-0.2, 0.2))));
addThing(B.pond(ctx));
addThing(B.flowerBed(ctx, -4, 17, 0.2, ['#e5484d', '#f7c948', '#f6a6c1']));
addThing(B.flowerBed(ctx, 13, 3, -0.6, ['#b79ce6', '#ffffff', '#f28c38']));
addThing(B.cat(ctx, 3, 4));
[[-30, -8], [-33, 18], [-14, 27], [24, -36], [38, -16], [2, 38]].forEach(([x, z], i) => addThing(B.tree(ctx, x, z, i + 1, 'apple', 0)));
[[6, 0.5], [-7, 6.5], [24, -8]].forEach(([x, z]) => addThing(B.lamp(ctx, x, z)));
addThing(B.well(ctx, 0, 0));
// lakeside
addThing(B.lake(ctx));
addThing(B.boat(ctx));
addThing(B.dock(ctx));
addThing(B.lighthouse(ctx));
[[60, 40], [72, 47], [54, 30], [82, 48]].forEach(([x, z], i) => addThing(B.tree(ctx, x, z, i + 11, 'cherry', 1)));
B.caveShell(ctx);
addThing(B.mushrooms(ctx));
// mountains
[[-22, -58], [-10, -68], [52, -60], [66, -74], [8, -84], [48, -88]].forEach(([x, z], i) => addThing(B.pine(ctx, x, z, i)));
addThing(B.balloon(ctx, -14, -70));
[[12, -54], [20, -58], [4, -60]].forEach(([x, z], i) => addThing(B.sheep(ctx, x, z, i)));
addThing(B.summitBell(ctx));

scene.updateMatrixWorld(true);
for (const t of things) for (const p of t.parts) t.entries.push(paint.register(p.mesh, p.natural, t));
const pickables = [];
for (const t of things) for (const p of t.parts) pickables.push(p.mesh);
const regionThings = [0, 1, 2].map(r => things.filter(t => t.region === r));

// ---------- mist gates ----------
const gateMat = (seed) => new THREE.ShaderMaterial({
  transparent: true, depthWrite: false, side: THREE.DoubleSide,
  uniforms: { uTime: { value: seed }, uFade: { value: 1 } },
  vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
  fragmentShader: `uniform float uTime, uFade; varying vec2 vUv;
    float h(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
    float n(vec2 p){ vec2 i = floor(p), f = fract(p); f = f*f*(3.0-2.0*f);
      return mix(mix(h(i), h(i+vec2(1,0)), f.x), mix(h(i+vec2(0,1)), h(i+vec2(1,1)), f.x), f.y); }
    float fbm(vec2 p){ float s = 0.0, a = 0.5; for (int i = 0; i < 5; i++){ s += a*n(p); p *= 2.03; a *= 0.5; } return s; }
    void main(){
      vec2 p = vec2(vUv.x * 16.0, vUv.y * 4.0);
      float f = fbm(p + vec2(uTime * 0.07, -uTime * 0.025) + fbm(p * 0.7 - uTime * 0.05) * 1.6);
      float a = smoothstep(0.22, 0.72, f);
      a *= smoothstep(0.0, 0.1, vUv.y) * (1.0 - smoothstep(0.45, 1.0, vUv.y));
      a *= smoothstep(0.0, 0.02, vUv.x) * (1.0 - smoothstep(0.98, 1.0, vUv.x));
      vec3 c = mix(vec3(0.74, 0.75, 0.79), vec3(0.97, 0.97, 0.99), f);
      gl_FragColor = vec4(c, a * 0.9 * uFade);
    }`,
});
function makeGate(cx, cz, width, rotY) {
  const g = new THREE.Group();
  for (let i = 0; i < 3; i++) {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(width, 40), gateMat(i * 17));
    m.position.set(0, 14, (i - 1) * 2.2);
    m.renderOrder = 5;
    g.add(m);
  }
  g.position.set(cx, 0, cz); g.rotation.y = rotY;
  scene.add(g);
  return { g, fade: 1, lifting: false };
}
const gates = { 1: makeGate(44.5, 7, 104, Math.PI / 2), 2: makeGate(35, -44.5, 186, 0) };

// ---------- rainbow (finale) ----------
const rainbow = new THREE.Mesh(new THREE.RingGeometry(170, 200, 96, 1, 0, Math.PI), new THREE.ShaderMaterial({
  transparent: true, depthWrite: false, side: THREE.DoubleSide, uniforms: { uA: { value: 0 } },
  vertexShader: `varying vec2 vP; void main(){ vP = position.xy; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
  fragmentShader: `uniform float uA; varying vec2 vP;
    vec3 hsv(float h){ vec3 k = clamp(abs(mod(h*6.0 + vec3(0,4,2), 6.0) - 3.0) - 1.0, 0.0, 1.0); return k; }
    void main(){ float r = (length(vP) - 170.0) / 30.0; vec3 c = hsv(0.82 - r * 0.82) * 0.9 + 0.1;
      float a = smoothstep(0.0, 0.12, r) * smoothstep(1.0, 0.88, r) * uA * 0.55;
      a *= smoothstep(-5.0, 30.0, vP.y);
      gl_FragColor = vec4(c, a); }`,
}));
rainbow.position.set(30, -10, -300);
rainbow.visible = false;
scene.add(rainbow);

// ---------- brush ----------
const brush = new THREE.Group();
const bristleMat = new THREE.MeshStandardMaterial({ color: '#e5484d', roughness: 0.45, emissive: '#e5484d', emissiveIntensity: 0.2 });
{
  const wood = new THREE.MeshStandardMaterial({ color: '#c0814f', roughness: 0.5 });
  const metal = new THREE.MeshStandardMaterial({ color: '#e6dfd4', roughness: 0.25, metalness: 0.7 });
  const gold = new THREE.MeshStandardMaterial({ color: '#f2c14e', roughness: 0.3, metalness: 0.6 });
  const handle = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.16, 3.0, 12), wood); handle.position.y = 2.55;
  const knob = new THREE.Mesh(new THREE.SphereGeometry(0.16, 12, 8), wood); knob.position.y = 4.05;
  const ferrule = new THREE.Mesh(new THREE.CylinderGeometry(0.19, 0.24, 0.6, 16), metal); ferrule.position.y = 0.98;
  const band = new THREE.Mesh(new THREE.TorusGeometry(0.17, 0.04, 6, 18), gold); band.rotation.x = Math.PI / 2; band.position.y = 1.35;
  const bristles = new THREE.Mesh(new THREE.LatheGeometry([[0.0, 0], [0.12, 0.12], [0.22, 0.38], [0.25, 0.72]].map(([x, y]) => new THREE.Vector2(x, y)), 16), bristleMat);
  for (const m of [handle, knob, ferrule, band, bristles]) { m.castShadow = true; brush.add(m); }
  brush.scale.setScalar(1.15);
}
const brushGlow = makeGlow('#ffffff', 2.4, 0.35);
brushGlow.position.y = 0.3;
brush.add(brushGlow);
scene.add(brush);

const cursorRing = new THREE.Mesh(new THREE.RingGeometry(0.86, 1, 48), new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.75, depthWrite: false, side: THREE.DoubleSide }));
cursorRing.renderOrder = 6;
scene.add(cursorRing);

// ---------------------------------------------------------------------------
// Game state
const game = {
  started: false, paused: false,
  unlocked: new Set(COLORS.filter(c => c.start).map(c => c.id)),
  colorId: 'red', justUnlocked: null, audio,
  sizeIdx: 1, restored: [false, false, false], allDone: false,
  selectColor(id) {
    this.colorId = id;
    const c = COLORS.find(c => c.id === id);
    if (!c.rainbow) { bristleMat.color.set(c.hex); bristleMat.emissive.set(c.hex); }
    audio.click();
    ui.renderPalette();
    dirty = true;
  },
};
const ui = new UI(game);
ui.buildLogo();
ui.renderPalette();

const pots = [];
function spawnPots() {
  for (const def of COLLECTIBLES) {
    if (game.unlocked.has(def.color)) continue;
    pots.push(new B.PaintPot(ctx, def, COLORS.find(c => c.id === def.color)));
  }
}

const usedColors = new Map();
let dirty = false;
let lastProgressT = 0;

// ---------------------------------------------------------------------------
// Camera rig
const cam = { yaw: 0.75, pitch: 0.5, dist: 26, target: V3(0, 2, 4), yawV: 0, zoomV: 0 };
function updateCamera(dt) {
  cam.yaw += cam.yawV * dt;
  cam.dist = THREE.MathUtils.clamp(cam.dist * Math.exp(cam.zoomV * dt), 9, 60);
  const cp = Math.cos(cam.pitch);
  camera.position.set(
    cam.target.x + Math.sin(cam.yaw) * cp * cam.dist,
    cam.target.y + Math.sin(cam.pitch) * cam.dist,
    cam.target.z + Math.cos(cam.yaw) * cp * cam.dist);
  const minY = Math.max(heightAt(camera.position.x, camera.position.z), LAKE.water) + 1.5;
  if (camera.position.y < minY) camera.position.y = minY;
  camera.lookAt(cam.target);
  sky.position.copy(camera.position);
}
function followBrush(dt) {
  const dx = brushPos.x - cam.target.x, dz = brushPos.z - cam.target.z;
  const d = Math.hypot(dx, dz), dead = 7;
  if (d > dead) {
    const k = (1 - dead / d) * Math.min(1, dt * 2);
    cam.target.x += dx * k; cam.target.z += dz * k;
  }
  const ground = Math.max(heightAt(cam.target.x, cam.target.z), LAKE.water);
  const wantY = ground + 1.5 + Math.max(0, brushPos.y - ground - 1.5) * 0.55;
  cam.target.y += (wantY - cam.target.y) * Math.min(1, dt * 2);
}

// ---------------------------------------------------------------------------
// Input
const pointer = { ndc: new THREE.Vector2(), inside: false, painting: false, rotating: false, lastX: 0, lastY: 0 };
const touches = new Map();
let pinch0 = 0;
const keys = new Set();
canvas.addEventListener('contextmenu', e => e.preventDefault());
canvas.addEventListener('pointerdown', e => {
  if (!game.started || game.paused) return;
  canvas.setPointerCapture(e.pointerId);
  pointer.lastX = e.clientX; pointer.lastY = e.clientY;
  setNdc(e);
  if (e.pointerType === 'touch') {
    touches.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (touches.size === 1) pointer.painting = true;
    else { pointer.painting = false; pinch0 = touchDist(); }
  } else if (e.button === 0) pointer.painting = true;
  else pointer.rotating = true;
});
canvas.addEventListener('pointermove', e => {
  setNdc(e); pointer.inside = true;
  if (e.pointerType === 'touch' && touches.has(e.pointerId)) {
    const prev = touches.get(e.pointerId);
    if (touches.size >= 2) {
      cam.yaw -= (e.clientX - prev.x) * 0.004 / touches.size;
      cam.pitch = THREE.MathUtils.clamp(cam.pitch + (e.clientY - prev.y) * 0.003 / touches.size, 0.12, 1.3);
      touches.set(e.pointerId, { x: e.clientX, y: e.clientY });
      const d = touchDist();
      if (pinch0 > 0 && d > 0) { cam.dist = THREE.MathUtils.clamp(cam.dist * pinch0 / d, 9, 60); pinch0 = d; }
      return;
    }
    touches.set(e.pointerId, { x: e.clientX, y: e.clientY });
  }
  if (pointer.rotating) {
    cam.yaw -= (e.clientX - pointer.lastX) * 0.006;
    cam.pitch = THREE.MathUtils.clamp(cam.pitch + (e.clientY - pointer.lastY) * 0.004, 0.12, 1.3);
  }
  pointer.lastX = e.clientX; pointer.lastY = e.clientY;
});
const endPointer = e => {
  touches.delete(e.pointerId);
  if (e.pointerType === 'touch') { pointer.painting = touches.size === 1 ? pointer.painting : false; }
  else { if (e.button === 0) pointer.painting = false; else pointer.rotating = false; }
  if (!touches.size && e.pointerType === 'touch') pointer.painting = false;
};
canvas.addEventListener('pointerup', endPointer);
canvas.addEventListener('pointercancel', endPointer);
canvas.addEventListener('pointerleave', () => { pointer.inside = false; });
canvas.addEventListener('wheel', e => { e.preventDefault(); cam.dist = THREE.MathUtils.clamp(cam.dist * Math.exp(e.deltaY * 0.0012), 9, 60); }, { passive: false });
function touchDist() { const p = [...touches.values()]; return p.length < 2 ? 0 : Math.hypot(p[0].x - p[1].x, p[0].y - p[1].y); }
function setNdc(e) { pointer.ndc.set(e.clientX / innerWidth * 2 - 1, -(e.clientY / innerHeight) * 2 + 1); }

addEventListener('keydown', e => {
  if (!game.started) return;
  if (e.key === 'Escape' && game.paused) { ui.closeModal(); return; }
  if (game.paused) return;
  const k = e.key.toLowerCase();
  keys.add(k);
  if (k === ' ') e.preventDefault();
  if (/^[1-9]$/.test(k)) {
    const sw = document.querySelector(`.swatch[data-key="${k}"]`);
    if (sw) sw.click();
  }
  if (k === '[') setSize(game.sizeIdx - 1);
  if (k === ']') setSize(game.sizeIdx + 1);
  if (k === 'p') takePostcard();
  if (k === 'h') showHint();
});
addEventListener('keyup', e => keys.delete(e.key.toLowerCase()));
addEventListener('blur', () => { keys.clear(); pointer.painting = false; pointer.rotating = false; });

// on-screen camera buttons (hold to keep turning)
function holdButton(id, down, up) {
  const el = $(id);
  el.addEventListener('pointerdown', e => { e.preventDefault(); down(); });
  for (const ev of ['pointerup', 'pointerleave', 'pointercancel']) el.addEventListener(ev, up);
}
holdButton('camLeft', () => cam.yawV = 1.2, () => cam.yawV = 0);
holdButton('camRight', () => cam.yawV = -1.2, () => cam.yawV = 0);
holdButton('camIn', () => cam.zoomV = -0.9, () => cam.zoomV = 0);
holdButton('camOut', () => cam.zoomV = 0.9, () => cam.zoomV = 0);

function setSize(i) {
  game.sizeIdx = (i + BRUSH_SIZES.length) % BRUSH_SIZES.length;
  const s = BRUSH_SIZES[game.sizeIdx];
  $('sizeIc').textContent = s.ic; $('sizeLb').textContent = s.name + ' brush';
  audio.click(); dirty = true;
}
const SOUND_MODES = [['🔊', 'Sound on'], ['🎵', 'Music off'], ['🔇', 'Sound off']];
function setSound(m) {
  audio.setMode(m);
  $('soundIc').textContent = SOUND_MODES[m][0]; $('soundLb').textContent = SOUND_MODES[m][1];
  dirty = true;
}
$('btnSize').onclick = () => setSize(game.sizeIdx + 1);
$('btnSound').onclick = () => { setSound((audio.mode + 1) % 3); audio.click(); };
$('btnPostcard').onclick = () => takePostcard();
$('btnAlbum').onclick = () => { audio.click(); ui.showAlbum(); };
$('btnHint').onclick = () => showHint();
$('btnHelp').onclick = () => { audio.click(); ui.showHelp(); };
$('modalClose').onclick = () => ui.closeModal();
$('modal').addEventListener('pointerdown', e => { if (e.target.id === 'modal') ui.closeModal(); });
// A HUD button clicked with the mouse would otherwise keep keyboard focus, so Space (paint)
// or Enter would click it again, e.g. silently turning the sound off.
$('hud').addEventListener('click', e => { const b = e.target.closest('button'); if (b && e.detail > 0) b.blur(); });

// ---------------------------------------------------------------------------
// Picking
const raycaster = new THREE.Raycaster();
const hit = { ok: false, point: V3(), normal: V3() };
function marchTerrain(ro, rd, maxT = 360) {
  let t = 0.5, prev = 0;
  const p = V3();
  for (let i = 0; i < 500 && t < maxT; i++) {
    p.copy(ro).addScaledVector(rd, t);
    const h = heightAt(p.x, p.z);
    if (p.y < h) {
      let a = prev, b = t;
      for (let k = 0; k < 10; k++) {
        const m = (a + b) / 2;
        p.copy(ro).addScaledVector(rd, m);
        if (p.y < heightAt(p.x, p.z)) b = m; else a = m;
      }
      return b;
    }
    prev = t;
    t += Math.max(0.35, (p.y - h) * 0.45);
  }
  return null;
}
function pick() {
  raycaster.setFromCamera(pointer.ndc, camera);
  const ro = raycaster.ray.origin, rd = raycaster.ray.direction;
  hit.ok = false;
  let best = marchTerrain(ro, rd);
  if (best !== null) {
    hit.ok = true;
    hit.point.copy(ro).addScaledVector(rd, best);
    normalAt(hit.point.x, hit.point.z, hit.normal);
  }
  raycaster.far = best ?? 400;
  const hits = raycaster.intersectObjects(pickables, false);
  if (hits.length) {
    const h = hits[0];
    hit.ok = true;
    hit.point.copy(h.point);
    if (h.face) hit.normal.copy(h.face.normal).transformDirection(h.object.matrixWorld);
    if (hit.normal.dot(rd) > 0) hit.normal.negate();
  }
  return hit.ok;
}

// ---------------------------------------------------------------------------
// Locks & bounds
const locked = r => {
  const reg = REGIONS[r];
  return reg.unlockBy && !game.unlocked.has(reg.unlockBy);
};
let gateToastT = 0;
function clampWorld(v) {
  let blocked = 0;
  if (locked(1) && v.x > 42.5 && v.z > -44) { v.x = 42.5; blocked = 1; }
  if (locked(2) && v.z < -42.5) { v.z = -42.5; blocked = 2; }
  v.x = THREE.MathUtils.clamp(v.x, BOUNDS.minX, BOUNDS.maxX);
  v.z = THREE.MathUtils.clamp(v.z, BOUNDS.minZ, BOUNDS.maxZ);
  return blocked;
}
function gateBlocked(r) {
  if (gateToastT > 0) return;
  gateToastT = 9;
  const c = COLORS.find(c => c.id === REGIONS[r].unlockBy);
  ui.toast(`A thick gray mist blocks the way... Find the hidden <b style="color:${c.hex}">${c.name}</b> paint to clear it!`, { color: c.hex });
}

// ---------------------------------------------------------------------------
// Painting
const brushTarget = V3().copy(brushPos);
const brushVel = V3();
const brushUp = V3(0, 1, 0);
const tmpC = new THREE.Color();
let dripT = 0, trailT = 0, popBudget = 0;

function currentColor(t) {
  const c = COLORS.find(c => c.id === game.colorId);
  if (c.rainbow) return { color: tmpC.setHSL((t * 0.25) % 1, 0.75, 0.55), rainbow: true, hex: '#' + tmpC.getHexString() };
  return { color: tmpC.set(c.hex), rainbow: false, hex: c.hex };
}

function spawnFlowerAt(i, color, rainbowT) {
  const p = terrain.vertexPos(i, V3());
  if (p.y < POND.water + 0.15 && Math.hypot(p.x - POND.x, p.z - POND.z) < POND.r + 0.5) return;
  if (p.y < LAKE.water + 0.2 && Math.hypot((p.x - LAKE.x) / LAKE.sx, p.z - LAKE.z) < LAKE.r + 0.5) return;
  if (normalAt(p.x, p.z).y < 0.8) return;
  p.x += rand(-0.6, 0.6); p.z += rand(-0.6, 0.6); p.y = heightAt(p.x, p.z);
  const hsl = {}; color.getHSL(hsl);
  let c = color.clone(), kind = 'flower';
  if (rainbowT >= 0) c.setHSL(Math.random(), 0.8, 0.6);
  if (hsl.h > 0.2 && hsl.h < 0.45 && hsl.s > 0.25) kind = 'tuft';
  else if (hsl.s < 0.2 && hsl.l < 0.4) kind = 'tuft';
  if (kind === 'tuft' && hsl.s < 0.2) c = new THREE.Color('#6a8f4a');
  flowers.add(p.x, p.y, p.z, c, kind);
  if (popBudget > 0) { popBudget--; audio.pop(); }
}

function doPaint(dt, t) {
  const { color, rainbow } = currentColor(t);
  const r = BRUSH_SIZES[game.sizeIdx].r;
  const rt = rainbow ? t : -1;
  const fresh = paint.paintAt(brushPos, r, color, 9, dt, rt);
  const newly = terrain.paintAt(brushPos, r * 1.05, color, 9, dt);
  popBudget = Math.min(popBudget + dt * 3, 2);
  for (const i of newly) if (Math.random() < 0.075) spawnFlowerAt(i, color, rt);
  if (fresh + newly.length > 0) {
    usedColors.set(game.colorId, (usedColors.get(game.colorId) || 0) + fresh + newly.length);
    dirty = true;
    lastProgressT = t;
  }
  return fresh + newly.length;
}

function emitDrips(dt, t) {
  const { color } = currentColor(t);
  dripT -= dt;
  if (dripT < 0) {
    dripT = rand(0.08, 0.2);
    const c = color.clone();
    const big = BRUSH_SIZES[game.sizeIdx].r;
    puffs.emit({
      x: brushPos.x + rand(-0.15, 0.15), y: brushPos.y + 0.05, z: brushPos.z + rand(-0.15, 0.15),
      vx: brushVel.x * 0.2 + rand(-0.6, 0.6), vy: rand(0, 1), vz: brushVel.z * 0.2 + rand(-0.6, 0.6),
      gravity: -16, life: 3, size: rand(0.18, 0.3),
      color: c,
      onLand: p => {
        tmpC.copy(c);
        const pp = V3(p.x, heightAt(p.x, p.z), p.z);
        const newly = terrain.paintAt(pp, 0.6 + big * 0.15, c, 30, 0.1);
        for (const i of newly) if (Math.random() < 0.05) spawnFlowerAt(i, c, -1);
        if (ctx.nearCamera(pp, 25) && Math.random() < 0.4) audio.drip();
      },
    });
  }
}

// ---------------------------------------------------------------------------
// Waking, collecting, progress
function thingColors(t) {
  const list = [];
  for (const e of t.entries) {
    if (!e.count) continue;
    let r = 0, g = 0, b = 0, n = 0;
    for (let i = 0; i < e.n; i += 3) if (e.painted[i]) { r += e.col[i * 3]; g += e.col[i * 3 + 1]; b += e.col[i * 3 + 2]; n++; }
    if (n) list.push({ c: new THREE.Color(r / n, g / n, b / n), w: e.count });
  }
  list.sort((a, b) => b.w - a.w);
  return list.slice(0, 4).map(x => x.c);
}
function confetti(p, colors, n = 50) {
  for (let i = 0; i < n; i++) {
    const a = rand(0, Math.PI * 2), s = rand(2, 7);
    const c = colors.length ? colors[i % colors.length] : new THREE.Color().setHSL(Math.random(), 0.8, 0.6);
    puffs.emit({ x: p.x, y: p.y, z: p.z, vx: Math.cos(a) * s, vy: rand(4, 10), vz: Math.sin(a) * s, gravity: -9, drag: 0.8, life: rand(1.6, 2.6), size: rand(0.25, 0.5), color: c });
  }
  for (let i = 0; i < 30; i++) {
    const a = rand(0, Math.PI * 2), s = rand(1, 4);
    sparkles.emit({ x: p.x, y: p.y + rand(-1, 1), z: p.z, vx: Math.cos(a) * s, vy: rand(1, 4), vz: Math.sin(a) * s, drag: 1.5, life: rand(1, 2), size: rand(0.25, 0.5), color: new THREE.Color('#fff6d0'), twinkle: 14 });
  }
}

function wakeThing(t, silent = false) {
  const cols = thingColors(t);
  t.wake(silent);
  paint.fillThing(t, silent);
  dirty = true;
  if (silent) return;
  lastProgressT = clock.elapsedTime;
  audio.wake();
  const p = t.focus();
  confetti(p, cols);
  ui.toast(t.msg, { color: cols.length ? '#' + cols[0].clone().getHexString() : null });
  checkRegions();
}

function collectPot(pot) {
  pot.collected = true;
  const p = pot.g.position.clone();
  scene.remove(pot.g);
  const id = pot.def.color;
  game.unlocked.add(id);
  if (id === 'gold') game.unlocked.add('rainbow');
  game.justUnlocked = id;
  audio.collect();
  confetti(p, [pot.color, pot.color.clone().offsetHSL(0, 0, 0.15), new THREE.Color('#ffffff')], 80);
  game.selectColor(id);
  ui.toast(`You found <b>${pot.colorDef.name}</b>!`, { big: true, color: pot.colorDef.hex });
  if (UNLOCK_TEXT[id]) setTimeout(() => ui.toast(UNLOCK_TEXT[id]), 1200);
  else setTimeout(() => ui.toast('A brand-new color for your palette! 🎨'), 1200);
  for (const r of [1, 2]) if (REGIONS[r].unlockBy === id) liftGate(r);
  if (id === 'gold') finale();
  checkRegions(); // the finale message needs a check here too, in case gold is the last thing found
  lastProgressT = clock.elapsedTime;
  dirty = true;
  $('flash').classList.add('on'); setTimeout(() => $('flash').classList.remove('on'), 60);
}

function liftGate(r, instant = false) {
  const g = gates[r];
  if (!g) return;
  if (instant) { g.g.visible = false; g.fade = 0; return; }
  g.lifting = true;
  audio.whoosh();
}

let fireworksT = 0;
function finale(instant = false) {
  rainbow.visible = true;
  rainbow.userData.target = 1;
  if (instant) { rainbow.material.uniforms.uA.value = 1; return; }
  fireworksT = 9;
  setTimeout(() => audio.fanfare(), 600);
}

function regionProgress(r) {
  const list = regionThings[r];
  let awake = 0, sum = 0;
  for (const t of list) {
    if (t.awake) { awake++; sum += 1; } else sum += Math.min(1, t.coverage / t.threshold) * 0.6;
  }
  const ground = terrain.regionPainted[r] / terrain.regionTotal[r];
  return { awake, total: list.length, frac: Math.min(1, (sum / list.length) * 0.9 + Math.min(1, ground * 3) * 0.1) };
}

function checkRegions() {
  for (let r = 0; r < 3; r++) {
    if (game.restored[r]) continue;
    const { awake, total } = regionProgress(r);
    if (awake >= Math.ceil(total * 0.8)) {
      game.restored[r] = true;
      const [cx, cz] = REGIONS[r].center;
      terrain.bloom(r, cx, cz);
      audio.fanfare();
      ui.toast(`🌈 ${REGIONS[r].name} is bursting with color again! 🌈`, { big: true });
      setTimeout(() => ui.toast('What a lovely view! Press 📷 Postcard to keep a memory of it.'), 2600);
      $('btnPostcard').classList.add('pulse');
      setTimeout(() => $('btnPostcard').classList.remove('pulse'), 12000);
      if (r === 0 && locked(1)) setTimeout(() => ui.toast('Psst... a special color is still hidden on top of Lookout Hill, to the west! 🌄'), 6500);
      dirty = true;
    }
  }
  if (!game.allDone && game.restored.every(Boolean) && game.unlocked.has('gold')) {
    game.allDone = true;
    setTimeout(() => ui.toast('The whole Splash Kingdom is alive with color again. Thank you, dear painter! 💛', { big: true }), 4000);
  }
}

function sproutNatural(i) {
  const p = terrain.vertexPos(i, V3());
  if (p.y < 0 || p.y > 32 || normalAt(p.x, p.z).y < 0.85) return;
  const palette = ['#e5484d', '#f7c948', '#ffffff', '#b79ce6', '#f6a6c1', '#4a8fe0'];
  if (Math.random() < 0.45) flowers.add(p.x, p.y, p.z, new THREE.Color('#5aa84a'), 'tuft');
  else flowers.add(p.x, p.y, p.z, new THREE.Color(palette[Math.floor(rand(0, palette.length))]), 'flower');
}

// ---------------------------------------------------------------------------
// Hints
let hintTrail = null;
let hintPress = 0;
function showHint() {
  audio.click();
  $('btnHint').classList.remove('pulse');
  const here = regionOf(brushPos.x, brushPos.z);
  const potsOpen = pots.filter(p => !p.collected && !locked(p.def.region));
  const sleepy = regionThings[here].filter(t => !t.awake);
  const nearest = (arr, f) => arr.reduce((b, x) => (!b || f(x).distanceTo(brushPos) < f(b).distanceTo(brushPos)) ? x : b, null);
  const keyPot = potsOpen.find(p => p.def.color === 'coral' || p.def.color === 'violet' || p.def.color === 'gold');
  hintPress++;
  let target, text;
  const preferPot = potsOpen.length && (!sleepy.length || hintPress % 2 === 0 || (keyPot && regionProgress(here).awake >= sleepy.length));
  if (preferPot) {
    const pot = keyPot || nearest(potsOpen, p => p.g.position);
    target = pot.g.position.clone();
    text = `Psst... I heard <b style="color:${pot.colorDef.hex}">${pot.colorDef.name}</b> is hidden ${pot.def.hint}. Follow the sparkles! ✨`;
  } else if (sleepy.length) {
    const t = nearest(sleepy, t => t.focus());
    target = t.focus();
    text = `Psst... the <b>${t.name.toLowerCase()}</b> over there is still fast asleep. Follow the sparkles! ✨`;
  } else {
    const nextLocked = [1, 2].find(r => locked(r));
    if (nextLocked) { text = 'Everything here is awake! Look for the hidden paint pot to clear the mist. ✨'; }
    else { text = 'Everything is awake! Try painting the hills with flowers, or take a postcard. 🌼'; }
    ui.toast(text); return;
  }
  ui.toast(text);
  hintTrail = { target, t: 7 };
}
function updateHint(dt, time) {
  if (!hintTrail) return;
  hintTrail.t -= dt;
  if (hintTrail.t < 0) { hintTrail = null; return; }
  const a = brushPos, b = hintTrail.target;
  const mid = a.clone().lerp(b, 0.5); mid.y = Math.max(a.y, b.y) + Math.min(14, a.distanceTo(b) * 0.25);
  const gold = new THREE.Color('#ffd86b');
  for (let k = 0; k < 5; k++) {
    const s = ((time * 0.35 + k / 5) % 1);
    const p = a.clone().multiplyScalar((1 - s) * (1 - s)).addScaledVector(mid, 2 * s * (1 - s)).addScaledVector(b, s * s);
    sparkles.emit({ x: p.x + rand(-0.3, 0.3), y: p.y + rand(-0.3, 0.3), z: p.z + rand(-0.3, 0.3), life: 0.9, size: 0.45, color: gold, twinkle: 10 });
  }
  if (Math.random() < 0.6) sparkles.emit({ x: b.x + rand(-0.6, 0.6), y: b.y, z: b.z + rand(-0.6, 0.6), vy: rand(3, 6), life: 1.6, size: 0.5, color: gold, twinkle: 8 });
}

// ---------------------------------------------------------------------------
// Postcards
function takePostcard() {
  if (!game.started) return;
  $('btnPostcard').classList.remove('pulse');
  audio.shutter();
  const ringVis = cursorRing.visible;
  cursorRing.visible = false; brush.visible = false;
  updateCamera(0);
  renderer.render(scene, camera);
  const url = canvas.toDataURL('image/jpeg', 0.92);
  cursorRing.visible = ringVis; brush.visible = true;
  $('flash').classList.add('on'); setTimeout(() => $('flash').classList.remove('on'), 80);
  const name = REGIONS[regionOf(cam.target.x, cam.target.z)].name;
  const palette = [...usedColors.entries()].sort((a, b) => b[1] - a[1]).map(([id]) => COLORS.find(c => c.id === id))
    .filter(c => c && !c.rainbow).slice(0, 4).map(c => c.hex);
  setTimeout(() => ui.showPostcard(url, name, palette), 250);
}

// ---------------------------------------------------------------------------
// Save / load
function save() {
  if (!game.started) return;
  const data = {
    v: 1, unlocked: [...game.unlocked], color: game.colorId, size: game.sizeIdx, sound: audio.mode,
    restored: game.restored, awake: things.map(t => t.awake ? 1 : 0),
    entries: {}, terrain: packColors(terrain.colors, terrain.painted), flowers: flowers.serialize(),
    used: [...usedColors.entries()], brush: [brushPos.x, brushPos.y, brushPos.z], cam: [cam.yaw, cam.pitch, cam.dist],
  };
  for (const e of paint.entries) if (e.touched || e.count) data.entries[e.id] = packColors(e.col, e.painted);
  try { localStorage.setItem(SAVE_KEY, JSON.stringify(data)); dirty = false; }
  catch (err) {
    try { data.flowers = data.flowers.slice(-800); localStorage.setItem(SAVE_KEY, JSON.stringify(data)); dirty = false; } catch { /* storage full */ }
  }
}
function hasSave() { try { return !!localStorage.getItem(SAVE_KEY); } catch { return false; } }
function load() {
  let d;
  try { d = JSON.parse(localStorage.getItem(SAVE_KEY)); } catch { return false; }
  if (!d || d.v !== 1) return false;
  d.unlocked.forEach(id => game.unlocked.add(id));
  game.colorId = d.color || 'red';
  game.sizeIdx = d.size ?? 1;
  for (const [id, str] of Object.entries(d.entries || {})) {
    const e = paint.entries[+id];
    if (!e) continue;
    e.count = unpackColors(str, e.col, e.painted);
    for (let i = 0; i < e.n; i++) e.wet[i] = e.painted[i] ? 1 : 0;
    e.touched = true;
    e.mesh.geometry.attributes.color.needsUpdate = true;
  }
  if (d.terrain) {
    unpackColors(d.terrain, terrain.colors, terrain.painted);
    terrain.regionPainted = [0, 0, 0];
    for (let i = 0; i < terrain.n; i++) if (terrain.painted[i]) { terrain.regionPainted[terrain.region[i]]++; terrain.wet[i] = 1; }
    terrain.geo.attributes.color.needsUpdate = true;
  }
  (d.awake || []).forEach((a, i) => { if (a && things[i]) wakeThing(things[i], true); });
  game.restored = d.restored || [false, false, false];
  game.restored.forEach((r, i) => { if (r) terrain.bloom(i, ...REGIONS[i].center, true); });
  if (d.flowers) flowers.load(d.flowers);
  (d.used || []).forEach(([k, v]) => usedColors.set(k, v));
  if (d.brush) { brushPos.set(...d.brush); brushTarget.copy(brushPos); cam.target.set(brushPos.x, heightAt(brushPos.x, brushPos.z) + 1.5, brushPos.z); }
  if (d.cam) { [cam.yaw, cam.pitch, cam.dist] = d.cam; }
  for (const r of [1, 2]) if (!locked(r)) liftGate(r, true);
  if (game.unlocked.has('gold')) finale(true);
  setSound(d.sound || 0);
  game.allDone = game.restored.every(Boolean) && game.unlocked.has('gold');
  return true;
}
addEventListener('pagehide', save);
document.addEventListener('visibilitychange', () => { if (document.hidden) save(); });

// ---------------------------------------------------------------------------
// Start screen
if (hasSave()) {
  $('btnBegin').textContent = 'Continue Painting';
  $('btnFresh').classList.remove('hidden');
}
function begin(fresh) {
  if (game.started) return;
  if (fresh) { try { localStorage.removeItem(SAVE_KEY); } catch { /* ignore */ } }
  audio.init();
  const loaded = !fresh && hasSave() && load();
  spawnPots();
  game.started = true;
  $('start').classList.add('gone');
  setTimeout(() => $('start').classList.add('hidden'), 1100);
  $('hud').classList.remove('hidden');
  game.selectColor(game.colorId);
  setSize(game.sizeIdx);
  if (!loaded) {
    cam.yaw = 0.75; cam.pitch = 0.5; cam.dist = 26;
    brushPos.set(2, heightAt(2, 8) + 4, 8); brushTarget.copy(brushPos);
    setTimeout(() => ui.toast('Welcome to Willowmere Village! Everything has gone gray and sleepy...', { big: true }), 900);
    setTimeout(() => ui.toast('Hold the <b>left mouse button</b> on the sleepy cat by the well to paint her awake! 🐈'), 4200);
    setTimeout(() => ui.toast('Pick any color you like from the palette below. 🎨'), 8800);
  } else {
    setTimeout(() => ui.toast('Welcome back! Your kingdom missed you. 💛', { big: true }), 700);
  }
  lastProgressT = clock.elapsedTime;
}
$('btnBegin').onclick = () => begin(false);
$('btnFresh').onclick = () => {
  const b = $('btnFresh');
  if (b.dataset.sure) { begin(true); return; }
  b.dataset.sure = '1';
  b.textContent = 'Are you sure? Your painting will be cleared (postcards are kept). Click again to start over.';
};

// ---------------------------------------------------------------------------
// Main loop
const clock = new THREE.Clock();
let hudT = 0, saveT = 0, colorful = 0, colorfulTarget = 0, idleHintT = 0;
const skyGray = { top: srgb('#9ea3a8'), mid: srgb('#d3d4d4'), bot: srgb('#b9bcbf'), sun: srgb('#777777') };
const skyVivid = { top: srgb('#4f9be8'), mid: srgb('#ffe2c4'), bot: srgb('#cfe6f2'), sun: srgb('#fff1c9') };
const fogGray = new THREE.Color('#d3d4d4'), fogVivid = new THREE.Color('#f3e6d6');
const hemiSkyG = new THREE.Color('#d8dadc'), hemiSkyV = new THREE.Color('#d5ecff');
const hemiGndG = new THREE.Color('#8a8a8a'), hemiGndV = new THREE.Color('#b59a72');
const sunG = new THREE.Color('#ffffff'), sunV = new THREE.Color('#ffe9c9');
const cloudG = new THREE.Color('#b4b6b8'), cloudV = new THREE.Color('#ffffff');
const up = V3(0, 1, 0), qTmp = new THREE.Quaternion();

function applyColorfulness(r) {
  skyU.top.value.copy(skyGray.top).lerp(skyVivid.top, r);
  skyU.mid.value.copy(skyGray.mid).lerp(skyVivid.mid, r);
  skyU.bot.value.copy(skyGray.bot).lerp(skyVivid.bot, r);
  skyU.sunCol.value.copy(skyGray.sun).lerp(skyVivid.sun, r);
  scene.fog.color.copy(fogGray).lerp(fogVivid, r);
  hemi.color.copy(hemiSkyG).lerp(hemiSkyV, r);
  hemi.groundColor.copy(hemiGndG).lerp(hemiGndV, r);
  sun.color.copy(sunG).lerp(sunV, r);
  sun.intensity = 1.7 + r * 0.9;
  cloudMat.color.copy(cloudG).lerp(cloudV, r);
  cloudMat.emissiveIntensity = 0.05 + r * 0.2;
  renderer.toneMappingExposure = 1.0 + r * 0.1;
}

function frame() {
  const dt = Math.min(0.05, clock.getDelta());
  const t = clock.elapsedTime;
  if (!game.started) {
    cam.yaw += dt * 0.06;
    cam.target.set(0, 3, 0); cam.dist = 52; cam.pitch = 0.42;
  } else if (!game.paused) {
    step(dt, t);
  }
  // world animation always runs
  for (const th of things) th.update(dt, t);
  for (const c of ctx.creatures) c.update(dt, t);
  for (const p of pots) p.update(dt);
  paint.update(dt);
  terrain.updateBlooms(dt, sproutNatural);
  flowers.update(dt);
  snores.update(dt);
  puffs.update(dt); sparkles.update(dt);
  for (const c of clouds) { c.position.x += c.userData.sp * dt; if (c.position.x > 230) c.position.x = -150; }
  for (const r of [1, 2]) {
    const g = gates[r];
    for (const m of g.g.children) m.material.uniforms.uTime.value += dt;
    if (g.lifting) {
      g.fade = Math.max(0, g.fade - dt * 0.35);
      for (const m of g.g.children) m.material.uniforms.uFade.value = g.fade;
      g.g.position.y += dt * 3;
      if (g.fade <= 0) { g.lifting = false; g.g.visible = false; }
    }
  }
  if (rainbow.visible) {
    const u = rainbow.material.uniforms.uA;
    u.value = Math.min(1, u.value + dt * 0.2);
  }
  if (fireworksT > 0) {
    fireworksT -= dt;
    if (Math.random() < dt * 2.5) {
      const p = V3(30 + rand(-30, 30), heightAt(30, -102) + rand(15, 35), -102 + rand(-25, 25));
      confetti(p, [new THREE.Color().setHSL(Math.random(), 0.85, 0.6), new THREE.Color().setHSL(Math.random(), 0.85, 0.6)], 40);
      audio.sparkle(0.05);
    }
  }
  colorful += (colorfulTarget - colorful) * Math.min(1, dt * 0.6);
  applyColorfulness(colorful);
  updateCamera(dt);
  sun.position.copy(cam.target).add(SUN_OFFSET);
  sun.target.position.copy(cam.target);
  skyU.sunDir.value.copy(SUN_OFFSET).normalize();
  renderer.render(scene, camera);
}

function step(dt, t) {
  gateToastT -= dt;
  // ----- brush steering -----
  const fwd = V3(-Math.sin(cam.yaw), 0, -Math.cos(cam.yaw));
  const right = V3(-fwd.z, 0, fwd.x);
  let kx = 0, kz = 0;
  if (keys.has('w') || keys.has('arrowup')) kz += 1;
  if (keys.has('s') || keys.has('arrowdown')) kz -= 1;
  if (keys.has('a') || keys.has('arrowleft')) kx -= 1;
  if (keys.has('d') || keys.has('arrowright')) kx += 1;
  if (keys.has('q')) cam.yaw += dt * 1.3;
  if (keys.has('e')) cam.yaw -= dt * 1.3;
  const picked = pointer.inside || pointer.painting ? pick() : false;
  if (pointer.painting) {
    if (picked) brushTarget.copy(hit.point).addScaledVector(hit.normal, 0.45);
    else {
      raycaster.setFromCamera(pointer.ndc, camera);
      brushTarget.copy(raycaster.ray.origin).addScaledVector(raycaster.ray.direction, 45);
    }
  }
  if (kx || kz) {
    brushTarget.copy(brushPos).addScaledVector(fwd, kz * 14 * dt * 3).addScaledVector(right, kx * 14 * dt * 3);
    const gh = Math.max(heightAt(brushTarget.x, brushTarget.z), LAKE.water);
    brushTarget.y += ((gh + (keys.has(' ') ? 0.6 : 2.5)) - brushTarget.y) * Math.min(1, dt * 4);
  }
  const blocked = clampWorld(brushTarget);
  // move
  const prev = brushPos.clone();
  const dv = brushTarget.clone().sub(brushPos);
  const dist = dv.length();
  const move = Math.min(dist * (1 - Math.exp(-dt * 7)), 30 * dt);
  if (dist > 1e-4) brushPos.addScaledVector(dv, move / dist);
  const gmin = Math.max(heightAt(brushPos.x, brushPos.z), LAKE.water - 0.4) + 0.25;
  if (brushPos.y < gmin) brushPos.y = gmin;
  if (clampWorld(brushPos) || blocked) gateBlocked(blocked || 1);
  brushVel.copy(brushPos).sub(prev).divideScalar(Math.max(dt, 1e-4));
  ctx.brushSpeed = brushVel.length();

  // ----- paint -----
  const active = pointer.painting || keys.has(' ');
  let amount = 0;
  if (active) {
    amount = doPaint(dt, t);
    emitDrips(dt, t);
  }
  audio.setBrush(active ? Math.min(1, 0.35 + ctx.brushSpeed / 20 + (amount ? 0.25 : 0)) : 0, ctx.brushSpeed);
  // sparkle trail
  trailT -= dt;
  if (ctx.brushSpeed > 3 && trailT < 0) {
    trailT = 0.03;
    const { color } = currentColor(t);
    sparkles.emit({ x: brushPos.x + rand(-0.2, 0.2), y: brushPos.y + rand(0, 0.6), z: brushPos.z + rand(-0.2, 0.2), vy: rand(-0.3, 0.3), life: 0.7, size: rand(0.2, 0.4), color: color.clone().lerp(new THREE.Color('#ffffff'), 0.4), twinkle: 16 });
  }
  if (currentColor(t).rainbow) { bristleMat.color.copy(currentColor(t).color); bristleMat.emissive.copy(bristleMat.color); }

  // ----- brush pose -----
  const wantUp = V3(0, 1, 0);
  if (active && picked) wantUp.lerp(hit.normal, 0.45);
  wantUp.addScaledVector(brushVel, -0.035).normalize();
  brushUp.lerp(wantUp, Math.min(1, dt * 8)).normalize();
  qTmp.setFromUnitVectors(up, brushUp);
  brush.quaternion.copy(qTmp);
  brush.position.copy(brushPos);
  if (!active && ctx.brushSpeed < 0.5) brush.position.y += Math.sin(t * 2) * 0.12;
  brush.scale.setScalar(1.15 + (active ? Math.sin(t * 20) * 0.02 : 0));

  // cursor
  if (picked && pointer.inside) {
    cursorRing.visible = true;
    cursorRing.position.copy(hit.point).addScaledVector(hit.normal, 0.08);
    cursorRing.lookAt(V3().copy(hit.point).add(hit.normal));
    cursorRing.scale.setScalar(BRUSH_SIZES[game.sizeIdx].r * (active ? 0.9 + Math.sin(t * 10) * 0.05 : 1));
    cursorRing.material.color.copy(currentColor(t).color).lerp(new THREE.Color('#ffffff'), 0.3);
  } else cursorRing.visible = false;

  // ----- wake checks -----
  for (const th of things) {
    if (th.awake || !th.dirty) continue;
    th.dirty = false;
    if (th.coverage >= th.threshold) wakeThing(th);
  }
  for (const p of pots) {
    if (!p.collected && p.g.position.distanceTo(brushPos) < 3.2) collectPot(p);
  }

  followBrush(dt);
  updateHint(dt, t);

  // ----- progress & HUD -----
  hudT -= dt;
  if (hudT < 0) {
    hudT = 0.4;
    const here = regionOf(cam.target.x, cam.target.z);
    const pr = regionProgress(here);
    ui.updateHUD(REGIONS[here].name, pr.frac, pr.awake, pr.total);
    let sum = 0, all = 0;
    for (let r = 0; r < 3; r++) { const p = regionProgress(r); sum += p.frac * p.total; all += p.total; }
    colorfulTarget = Math.min(1, (sum / all) * 1.25 + (game.unlocked.has('gold') ? 0.2 : 0));
    audio.setColorfulness(colorful);
  }
  // gentle nudge if she seems stuck
  idleHintT += dt;
  if (t - lastProgressT > 75 && idleHintT > 75) {
    idleHintT = 0;
    $('btnHint').classList.add('pulse');
    ui.toast('Not sure where to go next? Press the ✨ <b>Hint</b> button!');
  }
  saveT += dt;
  if (saveT > 15) { saveT = 0; if (dirty) save(); }
}

addEventListener('resize', () => {
  renderer.setSize(innerWidth, innerHeight);
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  updatePointScale();
});
function updatePointScale() {
  const s = renderer.getDrawingBufferSize(new THREE.Vector2()).y / (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)));
  puffs.mat.uniforms.uScale.value = s;
  sparkles.mat.uniforms.uScale.value = s;
}
updatePointScale();
applyColorfulness(0);
renderer.setAnimationLoop(frame);

// handy for debugging from the console
window.splashCam = camera; window.splashRenderer = renderer;
window.splash = { game, things, terrain, paint, cam, brushPos, wakeThing, collectPot, pots, save, regionProgress };
