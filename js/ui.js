import { COLORS } from './data.js';

const $ = id => document.getElementById(id);

// ---------- palette ----------
const BLOB_PATHS = [
  'M50 8 C70 6 90 22 92 44 C95 66 80 90 56 92 C30 95 8 80 8 54 C7 30 28 10 50 8 Z',
  'M48 6 C74 4 94 26 90 52 C88 76 70 94 46 92 C22 90 6 72 8 48 C10 24 26 8 48 6 Z',
  'M52 10 C76 8 92 30 90 54 C88 80 66 94 44 90 C20 86 6 66 10 42 C14 20 32 12 52 10 Z',
];
function swatchSVG(c, i, locked) {
  const p = BLOB_PATHS[i % BLOB_PATHS.length];
  if (locked) {
    return `<svg viewBox="0 0 100 100"><path d="${p}" fill="#cfc7bb" stroke="#fff" stroke-width="5"/>
      <text x="50" y="66" font-size="46" text-anchor="middle" fill="#8f8478" font-family="Nunito" font-weight="900">?</text></svg>`;
  }
  const fill = c.rainbow ? 'url(#rb)' : c.hex;
  return `<svg viewBox="0 0 100 100"><defs><linearGradient id="rb" x1="0" x2="1" y1="0" y2="1">
      <stop offset="0" stop-color="#e5484d"/><stop offset=".25" stop-color="#f7c948"/><stop offset=".5" stop-color="#5fb84a"/>
      <stop offset=".75" stop-color="#4a8fe0"/><stop offset="1" stop-color="#b79ce6"/></linearGradient></defs>
    <path d="${p}" fill="${fill}" stroke="#fff" stroke-width="5"/>
    <ellipse cx="36" cy="32" rx="12" ry="7" fill="#fff" opacity=".45" transform="rotate(-25 36 32)"/>
    <path d="M70 84 C72 92 68 98 64 96 C61 94 63 88 66 84 Z" fill="${fill}"/></svg>`;
}

export class UI {
  constructor(game) {
    this.game = game;
    this.toastQ = [];
    this.toastBusy = 0;
  }
  buildLogo() {
    const word = 'Splash Kingdom';
    const cols = ['#e5484d', '#f28c38', '#e6b422', '#5fb84a', '#4a8fe0', '#8f6fd6', '#ff7a6b'];
    $('logo').innerHTML = [...word].map((ch, i) => ch === ' ' ? '&nbsp;' :
      `<span style="color:${cols[i % cols.length]};animation-delay:${i * 0.12}s">${ch}</span>`).join('');
  }
  renderPalette() {
    const g = this.game;
    const el = $('palette');
    el.innerHTML = '';
    let key = 1;
    COLORS.forEach((c, i) => {
      const unlocked = g.unlocked.has(c.id);
      if (c.rainbow && !unlocked) return;
      const b = document.createElement('button');
      b.className = 'swatch' + (unlocked ? '' : ' locked') + (g.colorId === c.id ? ' sel' : '') + (g.justUnlocked === c.id ? ' new' : '');
      b.innerHTML = swatchSVG(c, i, !unlocked) + (unlocked && key <= 9 ? `<span class="key">${key}</span>` : '');
      if (unlocked) { b.dataset.key = key; key++; }
      b.title = unlocked ? c.name : 'A hidden color — explore to find it!';
      b.onclick = () => {
        if (unlocked) g.selectColor(c.id);
        else { g.audio.click(); this.toast('A secret color is hidden somewhere in the kingdom. Try the ✨ Hint button!'); }
      };
      b.onpointerenter = () => { $('colorName').textContent = unlocked ? c.name : '???'; };
      b.onpointerleave = () => this.updateColorName();
      el.appendChild(b);
    });
    g.justUnlocked = null;
    this.updateColorName();
  }
  updateColorName() {
    const c = COLORS.find(c => c.id === this.game.colorId);
    $('colorName').textContent = c.name;
    $('colorName').style.color = c.rainbow ? '#8f6fd6' : c.hex;
  }

  // ---------- toasts ----------
  toast(text, opts = {}) {
    if (this.toastQ.some(t => t.text === text)) return;
    this.toastQ.push({ text, ...opts });
    if (this.toastQ.length > 4) this.toastQ.shift();
    this.pump();
  }
  pump() {
    const box = $('toasts');
    while (this.toastQ.length && box.children.length < 2) {
      const t = this.toastQ.shift();
      const d = document.createElement('div');
      d.className = 'toast' + (t.big ? ' big' : '');
      d.innerHTML = (t.color ? `<span class="dot" style="background:${t.color}"></span>` : '') + t.text;
      box.appendChild(d);
      const life = t.big ? 5200 : 3800;
      setTimeout(() => { d.classList.add('out'); setTimeout(() => { d.remove(); this.pump(); }, 600); }, life);
    }
  }

  updateHUD(name, frac, awake, total) {
    $('regionName').textContent = name;
    $('regionFill').style.width = Math.round(frac * 100) + '%';
    $('regionStats').textContent = awake >= total ? `Everyone here is awake! 🌈` : `${awake} of ${total} friends awake`;
  }

  // ---------- modal ----------
  openModal(html, onClose) {
    $('modalBody').innerHTML = html;
    $('modal').classList.remove('hidden');
    this.game.paused = true;
    this._onClose = onClose;
  }
  closeModal() {
    $('modal').classList.add('hidden');
    this.game.paused = false;
    if (this._onClose) { const f = this._onClose; this._onClose = null; f(); }
  }

  showHelp() {
    this.openModal(`<h2>How to play</h2><div class="help">
      <p>The kingdom has fallen fast asleep and lost all its colors. Wake it up with your magic paintbrush!</p>
      <ul>
        <li><b>Hold the left mouse button</b> and point at anything — your brush flies there and paints it.</li>
        <li>Point near the edge of the screen to <b>fly further</b>. Or use <kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd> / arrow keys to glide and hold <kbd>Space</kbd> to paint.</li>
        <li><b>Look around</b>: drag with the right mouse button, press <kbd>Q</kbd> / <kbd>E</kbd>, or use the ⟲ ⟳ buttons. Scroll or ＋/－ to zoom.</li>
        <li><b>Colors</b>: click a paint blob or press <kbd>1</kbd>–<kbd>9</kbd>. Brush size: <kbd>[</kbd> and <kbd>]</kbd>.</li>
        <li>Things with little <b>“z z z”</b> are asleep. Paint them and they wake up!</li>
        <li><b>Hidden paint pots</b> glow somewhere in each land. Find them to clear the gray mist and open new places.</li>
        <li>Paint the ground and flowers will sprout wherever you go. 🌼</li>
        <li>Press <b>📷 Postcard</b> (or <kbd>P</kbd>) to snap a keepsake of your world.</li>
      </ul>
      <p>There's no hurry and no way to lose — just enjoy painting. Your kingdom is saved automatically.</p>
      <div class="row"><button class="pill primary" id="helpOk">Back to painting</button></div></div>`);
    $('helpOk').onclick = () => this.closeModal();
  }

  async showPostcard(photoUrl, title, palette) {
    const url = await composePostcard(photoUrl, title, palette);
    this.openModal(`<h2>A postcard from ${title}</h2>
      <img class="postcardImg" src="${url}" alt="Postcard">
      <div class="row">
        <button class="pill primary" id="pcSave">💌 Keep in my album</button>
        <button class="pill" id="pcDl">⬇️ Download</button>
        <button class="pill" id="pcClose">Keep painting</button>
      </div>`);
    $('pcDl').onclick = () => download(url, `Splash Kingdom - ${title}.jpg`);
    $('pcClose').onclick = () => this.closeModal();
    $('pcSave').onclick = async () => {
      const ok = await saveToAlbum(url, title);
      $('pcSave').textContent = ok ? '✅ Saved to album!' : '⚠️ Album is full — download it instead';
      $('pcSave').disabled = true;
      this.game.audio.sparkle(0.06);
    };
  }

  showAlbum() {
    const list = loadAlbum();
    if (!list.length) {
      this.openModal(`<h2>My postcard album</h2><div class="help"><p>No postcards yet! Press <b>📷 Postcard</b> whenever the view looks lovely, and keep your favorites here.</p>
        <div class="row"><button class="pill primary" id="alOk">Okay</button></div></div>`);
      $('alOk').onclick = () => this.closeModal();
      return;
    }
    this.openModal(`<h2>My postcard album</h2><div class="album">${list.map((p, i) => `
      <figure><img src="${p.url}" data-i="${i}" alt="${p.title}"><figcaption><span>${p.title}<br><small>${p.date}</small></span>
      <span><button data-dl="${i}" title="Download">⬇️</button> <button data-rm="${i}" title="Remove">🗑️</button></span></figcaption></figure>`).join('')}</div>`);
    document.querySelectorAll('.album [data-dl]').forEach(b => b.onclick = () => download(list[b.dataset.dl].url, `Splash Kingdom - ${list[b.dataset.dl].title}.jpg`));
    document.querySelectorAll('.album [data-rm]').forEach(b => b.onclick = () => {
      if (b.dataset.sure) { list.splice(+b.dataset.rm, 1); storeAlbum(list); this.showAlbum(); return; }
      b.dataset.sure = '1'; b.textContent = 'Remove?';
    });
    document.querySelectorAll('.album img').forEach(img => img.onclick = () => {
      const p = list[img.dataset.i];
      this.openModal(`<img class="postcardImg" src="${p.url}"><div class="row"><button class="pill" id="back">⬅ Back to album</button>
        <button class="pill" id="dl1">⬇️ Download</button></div>`);
      $('back').onclick = () => this.showAlbum();
      $('dl1').onclick = () => download(p.url, `Splash Kingdom - ${p.title}.jpg`);
    });
  }
}


function download(url, name) {
  const a = document.createElement('a');
  a.href = url; a.download = name;
  document.body.appendChild(a); a.click(); a.remove();
}

// ---------- album storage ----------
const ALBUM_KEY = 'splashKingdom.album.v1';
function loadAlbum() { try { return JSON.parse(localStorage.getItem(ALBUM_KEY)) || []; } catch { return []; } }
function storeAlbum(list) {
  try { localStorage.setItem(ALBUM_KEY, JSON.stringify(list)); return true; } catch { return false; }
}
async function saveToAlbum(url, title) {
  const small = await resize(url, 1000);
  const list = loadAlbum();
  list.unshift({ url: small, title, date: new Date().toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' }) });
  while (list.length > 24) list.pop();
  while (list.length && !storeAlbum(list)) { if (list.length === 1) return false; list.pop(); }
  return list.length > 0;
}
function loadImg(url) { return new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = url; }); }
async function resize(url, w) {
  const img = await loadImg(url);
  const c = document.createElement('canvas');
  c.width = w; c.height = Math.round(img.height * w / img.width);
  c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
  return c.toDataURL('image/jpeg', 0.82);
}

// ---------- postcard composer ----------
export async function composePostcard(photoUrl, title, palette) {
  try { await document.fonts.load('700 80px Caveat'); } catch { /* fallback font */ }
  const img = await loadImg(photoUrl);
  const W = 1500, H = 1060;
  const c = document.createElement('canvas'); c.width = W; c.height = H;
  const g = c.getContext('2d');
  // paper
  g.fillStyle = '#fbf5e8'; g.fillRect(0, 0, W, H);
  for (let i = 0; i < 9000; i++) {
    g.fillStyle = `rgba(${120 + Math.random() * 60},${90 + Math.random() * 50},60,${Math.random() * 0.05})`;
    g.fillRect(Math.random() * W, Math.random() * H, 2, 2);
  }
  // paint splashes in the corners
  const splash = (x, y, r, color) => {
    g.fillStyle = color; g.globalAlpha = 0.85;
    g.beginPath();
    for (let a = 0; a <= Math.PI * 2 + 0.01; a += Math.PI / 10) {
      const rr = r * (0.75 + Math.random() * 0.4);
      g.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
    }
    g.fill();
    for (let k = 0; k < 7; k++) {
      const a = Math.random() * Math.PI * 2, d = r * (1.2 + Math.random() * 0.9);
      g.beginPath(); g.arc(x + Math.cos(a) * d, y + Math.sin(a) * d, r * (0.06 + Math.random() * 0.12), 0, Math.PI * 2); g.fill();
    }
    g.globalAlpha = 1;
  };
  const cols = palette.length ? palette : ['#e5484d', '#f7c948', '#4a8fe0'];
  splash(40, 40, 70, cols[0]);
  splash(W - 30, H - 50, 80, cols[1 % cols.length]);
  splash(W - 60, 30, 45, cols[2 % cols.length]);
  splash(30, H - 40, 50, cols[3 % cols.length]);
  // photo
  const px = 70, py = 64, pw = W - 140, ph = 730;
  g.save();
  g.shadowColor = 'rgba(0,0,0,.28)'; g.shadowBlur = 24; g.shadowOffsetY = 8;
  g.fillStyle = '#fff'; g.fillRect(px - 16, py - 16, pw + 32, ph + 32);
  g.restore();
  const ir = img.width / img.height, tr = pw / ph;
  let sw = img.width, sh = img.height, sx = 0, sy = 0;
  if (ir > tr) { sw = img.height * tr; sx = (img.width - sw) / 2; } else { sh = img.width / tr; sy = (img.height - sh) / 2; }
  g.drawImage(img, sx, sy, sw, sh, px, py, pw, ph);
  // caption
  g.fillStyle = '#4a3b33';
  g.font = '700 56px Caveat, cursive';
  g.fillText('Greetings from', 90, py + ph + 100);
  g.font = '700 96px Caveat, cursive';
  const grd = g.createLinearGradient(90, 0, 900, 0);
  cols.forEach((cc, i) => grd.addColorStop(i / Math.max(1, cols.length - 1), cc));
  g.fillStyle = grd;
  g.fillText(title, 86, py + ph + 196, 820);
  // stamp
  const stx = W - 290, sty = py + ph + 46, sw2 = 170, sh2 = 200;
  g.save(); g.translate(stx + sw2 / 2, sty + sh2 / 2); g.rotate(0.06);
  g.fillStyle = '#fff'; g.fillRect(-sw2 / 2, -sh2 / 2, sw2, sh2);
  g.fillStyle = '#fbf5e8';
  for (let i = 0; i <= 10; i++) {
    for (const [ax, ay] of [[-sw2 / 2 + i * sw2 / 10, -sh2 / 2], [-sw2 / 2 + i * sw2 / 10, sh2 / 2]]) { g.beginPath(); g.arc(ax, ay, 6, 0, 7); g.fill(); }
    for (const [ax, ay] of [[-sw2 / 2, -sh2 / 2 + i * sh2 / 10], [sw2 / 2, -sh2 / 2 + i * sh2 / 10]]) { g.beginPath(); g.arc(ax, ay, 6, 0, 7); g.fill(); }
  }
  g.fillStyle = cols[0]; g.fillRect(-sw2 / 2 + 14, -sh2 / 2 + 14, sw2 - 28, sh2 - 28);
  g.fillStyle = 'rgba(255,255,255,.9)';
  g.font = '64px serif'; g.textAlign = 'center'; g.fillText('🎨', 0, 10);
  g.font = '700 30px Caveat, cursive'; g.fillText('Splash Kingdom', 0, 66, sw2 - 36);
  g.restore();
  // postmark
  const pmx = W - 470, pmy = py + ph + 135;
  g.strokeStyle = 'rgba(74,59,51,.5)'; g.lineWidth = 4;
  g.beginPath(); g.arc(pmx, pmy, 78, 0, Math.PI * 2); g.stroke();
  g.beginPath(); g.arc(pmx, pmy, 66, 0, Math.PI * 2); g.stroke();
  for (let k = 0; k < 4; k++) {
    g.beginPath();
    for (let x = 0; x < 150; x += 4) g.lineTo(pmx + 82 + x, pmy - 39 + k * 26 + Math.sin(x / 14) * 7);
    g.stroke();
  }
  const dt = new Date();
  g.fillStyle = 'rgba(74,59,51,.75)'; g.textAlign = 'center';
  g.font = '700 30px Caveat, cursive';
  g.fillText(dt.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }), pmx, pmy - 4, 120);
  g.font = '700 26px Caveat, cursive';
  g.fillText(String(dt.getFullYear()), pmx, pmy + 28, 120);
  g.textAlign = 'left';
  return c.toDataURL('image/jpeg', 0.9);
}
