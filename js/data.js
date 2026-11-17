// Game data: colors, regions, hidden paint pots.

export const COLORS = [
  { id: 'red',     name: 'Poppy Red',       hex: '#e5484d', start: true },
  { id: 'orange',  name: 'Pumpkin',         hex: '#f28c38', start: true },
  { id: 'yellow',  name: 'Sunflower',       hex: '#f7c948', start: true },
  { id: 'green',   name: 'Meadow Green',    hex: '#5fb84a', start: true },
  { id: 'blue',    name: 'Cornflower',      hex: '#4a8fe0', start: true },
  { id: 'brown',   name: 'Cocoa',           hex: '#8b5a3c', start: true },
  { id: 'white',   name: 'Cloud White',     hex: '#fbf7ee', start: true },
  { id: 'coral',   name: 'Sunset Coral',    hex: '#ff7a6b' },
  { id: 'lilac',   name: 'Lilac Breeze',    hex: '#b79ce6' },
  { id: 'violet',  name: 'Midnight Violet', hex: '#5a3d9e' },
  { id: 'seafoam', name: 'Seafoam',         hex: '#5fd3bd' },
  { id: 'peach',   name: 'Peach Blossom',   hex: '#ffb7a0' },
  { id: 'gold',    name: 'Starlight Gold',  hex: '#ffcf4d' },
  { id: 'rainbow', name: 'Rainbow Brush',   hex: '#ff66aa', rainbow: true },
];

export const REGIONS = [
  { id: 0, name: 'Willowmere Village',  center: [0, 0] },
  { id: 1, name: 'Glimmerlake Shore',   center: [84, 10],  unlockBy: 'coral' },
  { id: 2, name: 'Whistlewind Peaks',   center: [28, -82], unlockBy: 'violet' },
];

// Hidden paint pots. pos = [x, z]; lift = height above the ground.
export const COLLECTIBLES = [
  { color: 'coral',   pos: [-38, 34],  lift: 2.4, region: 0,
    hint: 'high on top of Lookout Hill, the big grassy hill to the west of the village' },
  { color: 'lilac',   pos: [-28, -31], lift: 1.4, region: 0,
    hint: 'tucked away behind the old windmill' },
  { color: 'violet',  pos: [107, -30], lift: 1.2, region: 1,
    hint: 'deep inside the little cave beside the lake cliffs' },
  { color: 'seafoam', pos: [92, 14],   lift: 1.8, region: 1,
    hint: 'on the tiny island in the middle of the lake' },
  { color: 'peach',   pos: [66, 44],   lift: 1.2, region: 1,
    hint: 'beneath the cherry blossom trees' },
  { color: 'gold',    pos: [30, -102], lift: 2.6, region: 2,
    hint: 'on the very top of the snowy peak' },
];

export const UNLOCK_TEXT = {
  coral:  'The gray mist to the east melts away... Glimmerlake Shore awaits!',
  violet: 'A cool wind blows the northern mist away... Whistlewind Peaks are open!',
  gold:   'Starlight Gold! A rainbow fills the sky, and you can now paint with the Rainbow Brush!',
};
