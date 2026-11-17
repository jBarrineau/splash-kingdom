# 🎨 Splash Kingdom

A gentle, relaxing three.js painting game. A whole kingdom has fallen asleep and turned gray. You fly a magic paintbrush and paint it back to life, one brushstroke at a time.

* Paint anything and it **wakes up**: windmill sails start turning, chimneys puff smoke, fish jump in the pond, butterflies leave the flower beds, and the cat follows you around purring.
* Paint the ground and **flowers sprout** wherever you go.
* Find the **hidden paint pots** (Sunset Coral, Midnight Violet, Starlight Gold and more) to clear the gray mist and open new lands: Willowmere Village, Glimmerlake Shore and Whistlewind Peaks.
* Take **postcards** of your world and keep them in an album, or download them.
* The music is generated live and **blossoms as the world gets more colorful**. There's no way to lose, and progress saves automatically.

## Controls
| Action | Mouse / touch | Keyboard |
|---|---|---|
| Fly & paint | Hold the left button (or one finger) and point | WASD / arrows to glide, hold Space to paint |
| Look around | Right-drag, or the ⟲ ⟳ buttons (two fingers on touch) | Q / E |
| Zoom | Scroll wheel, ＋ / － (pinch on touch) | |
| Colors | Click a paint blob | 1–9 |
| Brush size | Brush button | [ and ] |
| Postcard / Hint | 📷 / ✨ buttons | P / H |

## Put it on GitHub Pages
1. Create a new repository on GitHub (for example `splash-kingdom`).
2. Upload **everything in this folder**, keeping the folder structure: `index.html`, `css/`, `js/`, `vendor/`, `.nojekyll`.
3. In the repository, go to **Settings → Pages**, set *Source* to **Deploy from a branch**, pick `main` and `/ (root)`, then click **Save**.
4. After a minute the game will be live at `https://YOUR-USERNAME.github.io/splash-kingdom/`.

No build step is needed. three.js (r181) is included in `vendor/`, so the game doesn't rely on a CDN. The only outside requests are for the Google Fonts (Caveat and Nunito), and the game falls back to system fonts if those can't load.

## Running it locally
Double-clicking `index.html` won't work: browsers block the game's scripts when a page is opened from a file (`file://`), and the start screen will say so. Serve the folder instead:
```
python -m http.server 8000
```
(use `python3` on macOS/Linux). Then open http://localhost:8000.

## Code tour
* `js/main.js`: renderer, camera, input, brush, gates, hints, postcards, saving, main loop
* `js/things.js`: every paintable object and creature (windmill, cottages, cat, boat, balloon, sheep…)
* `js/paint.js`: per-vertex painting, waking "bloom fill", save packing
* `js/terrain.js`: heightmap, natural colors, ground painting and the region bloom wave
* `js/fx.js`: particles, sleepy "z"s, glow sprites, sprouting flowers
* `js/audio.js`: all music and sound effects, synthesized with the Web Audio API
* `js/ui.js`: palette, toasts, modals, postcard composer and album
* `js/data.js`: colors, regions and hidden paint pots. Easy to tweak!
