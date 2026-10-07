// Game content of Lovely Farm.
// Crop, tree and animal numbers come from a fan guide's table of the original game
// (ampersant.ru, data before the "Zoo" update, summer 2011). See docs/RESEARCH.md.
// Anything marked "// invented" was not found in the sources and was made up in the spirit of the original.
// Display names live in src/i18n (ru-names.ts and the per-language *Names dictionaries).

export type CropKind = 'root' | 'bush' | 'ground' | 'tall' | 'flower';

export interface CropDef {
  id: string;
  exp: number; // XP per harvest
  level: number;
  hours: number; // time to ripen (it then withers after the same time)
  cost: number; // seed price, coins
  sell: number; // sale price in the cellar
  kind: CropKind;
  leaf: string;
  fruit: string;
  fruit2?: string;
  emoji?: string;
}

const C = (
  id: string, exp: number, level: number, hours: number, cost: number, sell: number,
  kind: CropKind, leaf: string, fruit: string, emoji?: string, fruit2?: string,
): CropDef => ({ id, exp, level, hours, cost, sell, kind, leaf, fruit, emoji, fruit2 });

export const CROPS: CropDef[] = [
  C('radish', 1, 1, 4, 10, 24, 'root', '#5fae3a', '#e2365b'),
  C('potato', 2, 1, 12, 10, 32, 'bush', '#4f9a33', '#f4f1e1', '🥔', '#c8a060'),
  C('tomato', 2, 1, 24, 20, 40, 'bush', '#3f8f2f', '#e8352b', '🍅'),
  C('pepper', 3, 1, 48, 30, 62, 'bush', '#3c8a31', '#f2b51f', '🫑', '#e8422b'),
  C('corn', 2, 4, 8, 16, 36, 'tall', '#6db33f', '#f7d23a', '🌽'),
  C('carrot', 3, 5, 48, 40, 78, 'root', '#57b33b', '#f07a1c', '🥕'),
  C('cabbage', 3, 6, 6, 22, 49, 'ground', '#8fcf5c', '#c9ec9a'),
  C('peas', 6, 7, 12, 20, 56, 'bush', '#5bb03c', '#9be25a'),
  C('strawberry', 1, 8, 2, 12, 28, 'bush', '#3e9a35', '#f0283c', '🍓'),
  C('zucchini', 4, 9, 36, 65, 132, 'ground', '#4f9e35', '#3f7f2a'),
  C('chili', 2, 10, 24, 30, 62, 'bush', '#3f8f2f', '#d8121c', '🌶️'),
  C('cucumber', 3, 11, 24, 60, 118, 'bush', '#4aa33a', '#2f8a2a', '🥒'),
  C('broccoli', 4, 12, 8, 30, 65, 'ground', '#5aa040', '#2f7d2c', '🥦'),
  C('raspberry', 4, 13, 6, 32, 69, 'bush', '#3f9334', '#e0245e'),
  C('pumpkin', 2, 14, 24, 40, 80, 'ground', '#5aa33a', '#f08a1c', '🎃'),
  C('onion', 6, 15, 12, 80, 130, 'root', '#6cc04a', '#e9b955', '🧅'),
  C('melon', 5, 15, 96, 145, 290, 'ground', '#5ea73d', '#f3d266', '🍈'),
  C('beet', 2, 16, 48, 85, 170, 'root', '#4f9a3a', '#8e1a3e'),
  C('chamomile', 2, 17, 3, 20, 45, 'flower', '#5cb340', '#ffffff', '🌼', '#f7c81e'),
  C('watermelon', 12, 18, 10, 64, 132, 'ground', '#4f9e35', '#2e8b2e', '🍉', '#9ed36a'),
  C('eggplant', 4, 19, 72, 130, 260, 'bush', '#3f8a33', '#5b2a86', '🍆'),
  C('violet', 3, 20, 2, 18, 40, 'flower', '#3f8f3a', '#8a4fd8', undefined, '#ffe14a'),
  C('sunflower', 2, 21, 24, 55, 110, 'tall', '#5aa83a', '#f9c613', '🌻', '#6b3e12'),
  C('grape', 3, 22, 48, 110, 220, 'bush', '#4c9a35', '#7a2f9a', '🍇'),
  C('blackberry', 4, 23, 72, 175, 350, 'bush', '#3a8a30', '#2a1640'),
  C('tea', 13, 24, 8, 56, 116, 'bush', '#2f8a3a', '#7ed36a', '🍵'),
  C('blueberry', 4, 25, 2, 20, 45, 'bush', '#3f8f3a', '#3a4fb8', '🫐'),
  C('wheat', 5, 26, 96, 250, 500, 'tall', '#b9c24a', '#e8c25a', '🌾'),
  C('orchid', 17, 27, 8, 68, 140, 'flower', '#3f9a3a', '#e15fc2', undefined, '#fff1fb'),
  C('sugarcane', 2, 28, 24, 80, 160, 'tall', '#7fc24a', '#c9df7a'),
  C('rice', 5, 29, 96, 310, 620, 'tall', '#8fc25a', '#f2eac0', '🍚'),
  C('asparagus', 2, 30, 24, 95, 190, 'tall', '#6fb34a', '#8bc867'),
  C('rose', 20, 31, 8, 76, 156, 'flower', '#2f8a33', '#e01b3c', '🌹'),
  C('beans', 2, 32, 48, 200, 400, 'bush', '#4ea53a', '#7cc04a', '🫘'),
  C('redonion', 13, 33, 10, 150, 220, 'root', '#5fb544', '#a01e58'),
  C('tulip', 15, 34, 6, 170, 235, 'flower', '#3f9a3a', '#ffd21e', '🌷'),
  C('gerbera', 10, 35, 4, 300, 348, 'flower', '#3f9a3a', '#ff7a12', undefined, '#7a3a0a'),
];

export type TreeKind = 'fruit' | 'conifer' | 'palm' | 'birch' | 'stump' | 'oak' | 'bush';

export interface TreeDef {
  id: string;
  exp: number; // XP for planting
  level: number;
  hours: number; // fruiting period
  cost: number;
  diamonds?: number;
  income: number; // sale price of one fruit
  kind: TreeKind;
  leaf: string;
  fruit: string;
  emoji?: string;
  giftOnly?: boolean;
}

const T = (
  id: string, exp: number, level: number, hours: number, cost: number, income: number,
  kind: TreeKind, leaf: string, fruit: string, emoji?: string, extra: Partial<TreeDef> = {},
): TreeDef => ({ id, exp, level, hours, cost, income, kind, leaf, fruit, emoji, ...extra });

export const TREES: TreeDef[] = [
  T('cherry', 10, 1, 24, 100, 5, 'fruit', '#3d9a3a', '#c8102e', '🍒'),
  T('pomegranate', 28, 1, 72, 280, 30, 'fruit', '#4f9a35', '#b3122a'),
  T('pear', 30, 3, 48, 300, 30, 'fruit', '#4ea23a', '#d7d84a', '🍐'),
  T('apple', 36, 4, 72, 360, 35, 'fruit', '#45a03a', '#e2312b', '🍎'),
  T('plum', 50, 8, 48, 500, 40, 'fruit', '#3f8f3a', '#5a2a7a'),
  T('seabuckthorn', 55, 9, 24, 550, 45, 'bush', '#8fb07a', '#f39a1b'),
  T('lemon', 65, 12, 72, 650, 55, 'fruit', '#2f8f3a', '#f6e03a', '🍋'),
  T('lime', 100, 14, 48, 1000, 60, 'fruit', '#2a8a35', '#8ad23a'),
  T('dates', 500, 15, 24, 0, 120, 'palm', '#5aa33a', '#8a4a1a', undefined, { diamonds: 10 }),
  T('gooseberry', 110, 16, 72, 1100, 55, 'bush', '#4f9a3a', '#b6d86a'),
  T('spruce', 150, 17, 72, 1500, 60, 'conifer', '#1f6e3a', '#8a5a2a'),
  T('apricot', 190, 18, 24, 1900, 60, 'fruit', '#4ea23a', '#f7a21e', '🍑'),
  T('hazel', 175, 19, 48, 1750, 65, 'fruit', '#5a9a3a', '#a8742a', '🌰'),
  T('grapefruit', 220, 23, 24, 2200, 65, 'fruit', '#2f8f3a', '#f2803a'),
  T('honeyagaric', 300, 25, 48, 3000, 300, 'stump', '#8a5a2a', '#e0b060', '🍄'),
  T('oak', 245, 27, 48, 2450, 100, 'oak', '#3a8a2f', '#9a6a2a'),
  T('coffee', 1200, 28, 96, 0, 350, 'fruit', '#2a7a35', '#7a1e1e', '☕', { diamonds: 15 }),
  T('passion', 250, 28, 96, 2500, 250, 'fruit', '#3f9a3a', '#7a2a6a'),
  // free gifts from neighbours
  T('orange', 0, 5, 48, 0, 5, 'fruit', '#2f8f3a', '#f58a12', '🍊', { giftOnly: true }),
  T('olive', 0, 5, 96, 0, 48, 'fruit', '#7a9a5a', '#4a5a1a', '🫒', { giftOnly: true }),
  T('avocado', 0, 10, 48, 0, 30, 'fruit', '#3f8a35', '#5a7a1a', '🥑', { giftOnly: true }),
  T('banana', 0, 15, 48, 0, 40, 'palm', '#4fb03a', '#f5dc2a', '🍌', { giftOnly: true }),
  T('birch', 150, 24, 48, 0, 90, 'birch', '#7cc04a', '#e8f0d0', undefined, { giftOnly: true }),
  T('rowan', 130, 28, 24, 0, 60, 'fruit', '#4f9a35', '#e2401a', undefined, { giftOnly: true }),
];

export interface AnimalDef {
  id: string;
  exp: number;
  level: number;
  hours: number;
  cost: number;
  income: number;
  productEmoji: string;
  emoji: string;
  size: 1 | 2;
  giftOnly?: boolean;
}

const A = (
  id: string, exp: number, level: number, hours: number, cost: number, income: number,
  productEmoji: string, emoji: string, size: 1 | 2 = 1, giftOnly = false,
): AnimalDef => ({ id, exp, level, hours, cost, income, productEmoji, emoji, size, giftOnly });

export const ANIMALS: AnimalDef[] = [
  A('foal', 500, 1, 48, 5000, 100, '🧲', '🐴'),
  A('chicken', 150, 4, 72, 1500, 100, '🥚', '🐔'),
  A('cow', 480, 5, 48, 4800, 150, '🥛', '🐄', 2),
  A('goat', 500, 6, 72, 5000, 230, '🍶', '🐐'),
  A('sheep', 300, 7, 48, 3000, 120, '🧶', '🐑'), // invented: screenshots show sheep and "Wool"
  A('mouse', 500, 8, 48, 5000, 150, '🧀', '🐭'),
  A('parrot', 450, 14, 48, 4500, 180, '🪶', '🦜'),
  A('beehive', 700, 14, 96, 7000, 400, '🍯', '🐝'),
  A('goose', 400, 15, 96, 4000, 240, '☁️', '🪿'),
  A('swan', 500, 16, 48, 5000, 300, '🪶', '🦢'),
  A('peacock', 600, 18, 48, 6000, 300, '🦚', '🦚'),
  A('turtle', 1200, 22, 72, 12000, 650, '🦪', '🐢', 2),
  A('raccoon', 2000, 24, 48, 20000, 800, '🥜', '🦝', 2),
  A('dapple', 2500, 25, 24, 25000, 450, '🏅', '🐎', 2),
  A('lion', 2000, 26, 72, 20000, 1000, '🦁', '🦁', 2),
  A('turkey', 3000, 35, 24, 30000, 240, '🪶', '🦃'),
  // free gifts from neighbours
  A('pig', 0, 5, 96, 0, 40, '🍄', '🐷', 1, true),
  A('ostrich', 0, 5, 48, 0, 50, '🥚', '🐦', 1, true),
  A('horse', 0, 16, 96, 0, 200, '🧲', '🐎', 2, true),
  A('burenka', 140, 23, 48, 0, 250, '🥛', '🐮', 2, true),
];

export interface DecorDef {
  id: string;
  level: number;
  cost: number;
  diamonds?: number;
  emoji: string;
  size: 1 | 2 | 3;
  draw?: 'path' | 'fence' | 'hedge' | 'pond' | 'flowerbed';
  craftOnly?: boolean;
}

// invented: no exact decor catalogue survived; picked from screenshots
export const DECOR: DecorDef[] = [
  { id: 'path', level: 1, cost: 15, emoji: '🪨', size: 1, draw: 'path' },
  { id: 'fence', level: 1, cost: 20, emoji: '🪵', size: 1, draw: 'fence' },
  { id: 'hedge', level: 3, cost: 40, emoji: '🌳', size: 1, draw: 'hedge' },
  { id: 'flowerbed', level: 2, cost: 60, emoji: '💐', size: 1, draw: 'flowerbed' },
  { id: 'gnome', level: 2, cost: 150, emoji: '🧙', size: 1 },
  { id: 'bunny', level: 3, cost: 200, emoji: '🐇', size: 1 },
  { id: 'sunpot', level: 4, cost: 300, emoji: '🌻', size: 1 },
  { id: 'pumpkinlamp', level: 5, cost: 350, emoji: '🎃', size: 1 },
  { id: 'pinwheel', level: 6, cost: 400, emoji: '🎐', size: 1 },
  { id: 'smileflower', level: 7, cost: 500, emoji: '🌼', size: 1 },
  { id: 'chest', level: 8, cost: 900, emoji: '🧰', size: 1 },
  { id: 'balloons', level: 9, cost: 600, emoji: '🎈', size: 1 },
  { id: 'star', level: 10, cost: 800, emoji: '⭐', size: 1 },
  { id: 'well', level: 11, cost: 1500, emoji: '🪣', size: 1 },
  { id: 'pond', level: 12, cost: 2500, emoji: '🦆', size: 2, draw: 'pond' },
  { id: 'angel', level: 14, cost: 3000, emoji: '👼', size: 1 },
  { id: 'fountain', level: 16, cost: 5000, emoji: '⛲', size: 2 },
  { id: 'globe', level: 18, cost: 0, diamonds: 3, emoji: '🌍', size: 1 },
  { id: 'alien', level: 20, cost: 0, diamonds: 5, emoji: '👽', size: 1 },
  { id: 'car', level: 22, cost: 0, diamonds: 15, emoji: '🚙', size: 2 },
  { id: 'ship', level: 25, cost: 0, diamonds: 25, emoji: '⛵', size: 3 },
  { id: 'scarecrow', level: 1, cost: 0, emoji: '🧑‍🌾', size: 1, craftOnly: true },
  { id: 'birdhouse', level: 1, cost: 0, emoji: '🏠', size: 1, craftOnly: true },
  { id: 'bench', level: 1, cost: 0, emoji: '🪑', size: 1, craftOnly: true },
  // invented: the "accessories" players decorated with — fences, lights, fountains, statues, topiaries
  { id: 'haybales', level: 3, cost: 120, emoji: '🌾', size: 1 },
  { id: 'fence_white', level: 3, cost: 35, emoji: '⬜', size: 1, draw: 'fence' },
  { id: 'fence_stone', level: 4, cost: 50, emoji: '🪨', size: 1, draw: 'fence' },
  { id: 'mailbox', level: 4, cost: 200, emoji: '📫', size: 1 },
  { id: 'lamp', level: 4, cost: 250, emoji: '💡', size: 1 },
  { id: 'wheelbarrow', level: 5, cost: 350, emoji: '🌷', size: 1 },
  { id: 'topiary_spiral', level: 6, cost: 400, emoji: '🌲', size: 1 },
  { id: 'fence_roses', level: 6, cost: 90, emoji: '🌹', size: 1, draw: 'fence' },
  { id: 'topiary_heart', level: 7, cost: 500, emoji: '💖', size: 1 },
  { id: 'birdbath', level: 8, cost: 600, emoji: '🐦', size: 1 },
  { id: 'tea_table', level: 8, cost: 700, emoji: '🫖', size: 1 },
  { id: 'tiki', level: 9, cost: 300, emoji: '🔥', size: 1 },
  { id: 'fence_iron', level: 10, cost: 150, emoji: '⚜️', size: 1, draw: 'fence' },
  { id: 'lamp_double', level: 10, cost: 700, emoji: '🕯️', size: 1 },
  { id: 'matryoshka', level: 10, cost: 800, emoji: '🪆', size: 1 },
  { id: 'vase', level: 11, cost: 1200, emoji: '🏺', size: 1 },
  { id: 'swing', level: 12, cost: 1500, emoji: '🎠', size: 1 },
  { id: 'lantern_stone', level: 13, cost: 900, emoji: '🏮', size: 1 },
  { id: 'minimill', level: 13, cost: 1100, emoji: '🌬️', size: 1 },
  { id: 'arch_roses', level: 15, cost: 1800, emoji: '💒', size: 1 },
  { id: 'mushroom_house', level: 15, cost: 2000, emoji: '🍄', size: 1 },
  { id: 'fountain_heart', level: 17, cost: 0, diamonds: 8, emoji: '💗', size: 2 },
  { id: 'statue_lovers', level: 19, cost: 4000, emoji: '💑', size: 1 },
  { id: 'fountain_angel', level: 20, cost: 8000, emoji: '⛲', size: 2 },
  { id: 'topiary_peacock', level: 21, cost: 3500, emoji: '🦚', size: 1 },
  { id: 'gazebo', level: 23, cost: 9000, emoji: '🏛️', size: 2 },
  { id: 'statue_horse', level: 24, cost: 0, diamonds: 10, emoji: '🐎', size: 1 },
];

// Workshop materials: arrive as gifts from neighbours, can also be bought
export interface MaterialDef { id: string; emoji: string; price: number }
export const MATERIALS: MaterialDef[] = [
  { id: 'wood', emoji: '🪵', price: 100 },
  { id: 'film', emoji: '🎞️', price: 1000 },
  { id: 'nails', emoji: '🔩', price: 150 },
  { id: 'straw', emoji: '🧺', price: 80 },
];

export type BuildingId = 'workshop' | 'mill' | 'juicer' | 'kitchen' | 'greenhouse';

export interface BuildingDef {
  id: BuildingId;
  level: number;
  cost: number;
  w: number;
  h: number;
  wall: string;
  roof: string;
  emoji: string;
  craftOnly?: boolean;
}

export const BUILDINGS: BuildingDef[] = [
  { id: 'workshop', level: 5, cost: 2000, w: 2, h: 2, wall: '#b07a45', roof: '#7a4a2a', emoji: '🔨' },
  { id: 'mill', level: 6, cost: 3000, w: 2, h: 2, wall: '#e0d2b0', roof: '#a8502a', emoji: '🌾' },
  { id: 'juicer', level: 9, cost: 4000, w: 2, h: 2, wall: '#f2c14a', roof: '#d0402a', emoji: '🧃' },
  { id: 'kitchen', level: 12, cost: 6000, w: 2, h: 2, wall: '#f0e6d6', roof: '#3a7ab0', emoji: '🍲' },
  { id: 'greenhouse', level: 1, cost: 0, w: 2, h: 3, wall: '#bfe8f0', roof: '#e8fbff', emoji: '🪴', craftOnly: true },
];

export interface Recipe {
  id: string;
  building: BuildingId;
  emoji: string;
  level: number;
  hours: number;
  inputs: Record<string, number>; // cellar item or material id → amount
  output: { kind: 'item'; id: string } | { kind: 'place'; key: string };
}

// invented: recipes did not survive, except the greenhouse (20 wood + 10 film)
export const RECIPES: Recipe[] = [
  { id: 'r_greenhouse', building: 'workshop', emoji: '🪴', level: 5, hours: 4, inputs: { wood: 20, film: 10 }, output: { kind: 'place', key: 'building:greenhouse' } },
  { id: 'r_scarecrow', building: 'workshop', emoji: '🧑‍🌾', level: 5, hours: 1, inputs: { wood: 3, straw: 5 }, output: { kind: 'place', key: 'decor:scarecrow' } },
  { id: 'r_birdhouse', building: 'workshop', emoji: '🏠', level: 5, hours: 1, inputs: { wood: 3, nails: 2 }, output: { kind: 'place', key: 'decor:birdhouse' } },
  { id: 'r_bench', building: 'workshop', emoji: '🪑', level: 7, hours: 2, inputs: { wood: 6, nails: 4 }, output: { kind: 'place', key: 'decor:bench' } },

  { id: 'cornflour', building: 'mill', emoji: '🫓', level: 6, hours: 2, inputs: { corn: 3 }, output: { kind: 'item', id: 'cornflour' } },
  { id: 'sunoil', building: 'mill', emoji: '🫗', level: 21, hours: 3, inputs: { sunflower: 3 }, output: { kind: 'item', id: 'sunoil' } },
  { id: 'flour', building: 'mill', emoji: '🥡', level: 26, hours: 3, inputs: { wheat: 2 }, output: { kind: 'item', id: 'flour' } },
  { id: 'sugar', building: 'mill', emoji: '🧂', level: 28, hours: 2, inputs: { sugarcane: 3 }, output: { kind: 'item', id: 'sugar' } },
  { id: 'riceflour', building: 'mill', emoji: '🍙', level: 29, hours: 3, inputs: { rice: 2 }, output: { kind: 'item', id: 'riceflour' } },

  { id: 'tomatojuice', building: 'juicer', emoji: '🥫', level: 9, hours: 1, inputs: { tomato: 3 }, output: { kind: 'item', id: 'tomatojuice' } },
  { id: 'strawjuice', building: 'juicer', emoji: '🧃', level: 9, hours: 1, inputs: { strawberry: 4 }, output: { kind: 'item', id: 'strawjuice' } },
  { id: 'carrotjuice', building: 'juicer', emoji: '🥤', level: 9, hours: 2, inputs: { carrot: 3 }, output: { kind: 'item', id: 'carrotjuice' } },
  { id: 'cherryjuice', building: 'juicer', emoji: '🍷', level: 9, hours: 1, inputs: { t_cherry: 4 }, output: { kind: 'item', id: 'cherryjuice' } },
  { id: 'applejuice', building: 'juicer', emoji: '🧃', level: 9, hours: 2, inputs: { t_apple: 3 }, output: { kind: 'item', id: 'applejuice' } },
  { id: 'orangejuice', building: 'juicer', emoji: '🍹', level: 9, hours: 2, inputs: { t_orange: 3 }, output: { kind: 'item', id: 'orangejuice' } },
  { id: 'melonjuice', building: 'juicer', emoji: '🍹', level: 18, hours: 2, inputs: { watermelon: 2 }, output: { kind: 'item', id: 'melonjuice' } },
  { id: 'grapejuice', building: 'juicer', emoji: '🍷', level: 22, hours: 3, inputs: { grape: 3 }, output: { kind: 'item', id: 'grapejuice' } },

  { id: 'salad', building: 'kitchen', emoji: '🥗', level: 12, hours: 1, inputs: { tomato: 2, cucumber: 2 }, output: { kind: 'item', id: 'salad' } },
  { id: 'pancakes', building: 'kitchen', emoji: '🥞', level: 12, hours: 2, inputs: { cornflour: 1, a_cow: 1, a_chicken: 1 }, output: { kind: 'item', id: 'pancakes' } },
  { id: 'borscht', building: 'kitchen', emoji: '🍲', level: 16, hours: 3, inputs: { beet: 2, cabbage: 1, potato: 2, carrot: 1 }, output: { kind: 'item', id: 'borscht' } },
  { id: 'omelet', building: 'kitchen', emoji: '🍳', level: 12, hours: 1, inputs: { a_chicken: 2, pepper: 1 }, output: { kind: 'item', id: 'omelet' } },
  { id: 'cheesecake', building: 'kitchen', emoji: '🧁', level: 12, hours: 2, inputs: { a_mouse: 1, a_chicken: 1, cornflour: 1 }, output: { kind: 'item', id: 'cheesecake' } },
  { id: 'jam', building: 'kitchen', emoji: '🍯', level: 28, hours: 4, inputs: { raspberry: 4, sugar: 1 }, output: { kind: 'item', id: 'jam' } },
  { id: 'honeytea', building: 'kitchen', emoji: '🫖', level: 24, hours: 1, inputs: { tea: 2, a_beehive: 1 }, output: { kind: 'item', id: 'honeytea' } },
  { id: 'cherrypie', building: 'kitchen', emoji: '🥧', level: 26, hours: 4, inputs: { flour: 1, t_cherry: 4, a_chicken: 1 }, output: { kind: 'item', id: 'cherrypie' } },
];

// Farm sizes and expansion prices from the original: 10×10 for 500 coins, 12×12 for 5 diamonds or 10 neighbours,
// 14×14 for 25 diamonds or 25 neighbours, 16×16 for 50 neighbours or diamonds, 18×18 for diamonds.
export const EXPANSIONS = [
  { size: 8, gold: 0, diamonds: 0, neighbors: 0, level: 1 },
  { size: 10, gold: 500, diamonds: 0, neighbors: 0, level: 1 },
  { size: 12, gold: 0, diamonds: 5, neighbors: 10, level: 1 },
  { size: 14, gold: 0, diamonds: 25, neighbors: 25, level: 1 },
  { size: 16, gold: 0, diamonds: 50, neighbors: 50, level: 1 },
  { size: 18, gold: 0, diamonds: 100, neighbors: 75, level: 1 },
];

export const DIG_COST = 10; // the guide's formula subtracts 10 for digging the bed

/* ---------- single registry of cellar items ---------- */

export interface ItemDef { id: string; price: number; emoji?: string; draw?: { color: string; color2?: string; shape: string } }

export const ITEMS: Record<string, ItemDef> = {};

for (const c of CROPS) ITEMS[c.id] = { id: c.id, price: c.sell, emoji: c.emoji, draw: { color: c.fruit, color2: c.fruit2 ?? c.leaf, shape: c.kind } };
for (const t of TREES) ITEMS['t_' + t.id] = { id: 't_' + t.id, price: t.income, emoji: t.emoji, draw: { color: t.fruit, color2: t.leaf, shape: 'fruit' } };
for (const a of ANIMALS) ITEMS['a_' + a.id] = { id: 'a_' + a.id, price: a.income, emoji: a.productEmoji };
for (const m of MATERIALS) ITEMS[m.id] = { id: m.id, price: Math.round(m.price / 4), emoji: m.emoji };
for (const r of RECIPES) {
  if (r.output.kind !== 'item') continue;
  const sum = Object.entries(r.inputs).reduce((s, [id, n]) => s + (ITEMS[id]?.price ?? 0) * n, 0);
  ITEMS[r.output.id] = { id: r.output.id, price: Math.round(sum * 1.5 + 10), emoji: r.emoji };
}

export const cropById = Object.fromEntries(CROPS.map((c) => [c.id, c]));
export const treeById = Object.fromEntries(TREES.map((t) => [t.id, t]));
export const animalById = Object.fromEntries(ANIMALS.map((a) => [a.id, a]));
export const decorById = Object.fromEntries(DECOR.map((d) => [d.id, d]));
export const buildingById = Object.fromEntries(BUILDINGS.map((b) => [b.id, b])) as Record<BuildingId, BuildingDef>;
export const recipeById = Object.fromEntries(RECIPES.map((r) => [r.id, r]));
export const materialById = Object.fromEntries(MATERIALS.map((m) => [m.id, m]));

export type PlaceKind = 'tree' | 'animal' | 'decor' | 'building';

/** 'tree:apple' → description of a placeable object */
export function placeInfo(key: string): { kind: PlaceKind; id: string; w: number; h: number; emoji: string } {
  const [kind, id] = key.split(':') as [PlaceKind, string];
  switch (kind) {
    case 'tree': { const t = treeById[id]; return { kind, id, w: 1, h: 1, emoji: t.emoji ?? '🌳' }; }
    case 'animal': { const a = animalById[id]; return { kind, id, w: a.size, h: a.size, emoji: a.emoji }; }
    case 'decor': { const d = decorById[id]; return { kind, id, w: d.size, h: d.size, emoji: d.emoji }; }
    case 'building': { const b = buildingById[id as BuildingId]; return { kind, id, w: b.w, h: b.h, emoji: b.emoji }; }
  }
}

/* ---------------- achievements ---------------- */

export interface Achievement { id: string; stat: string; tiers: number[]; diamonds: number[] }

// the original rewarded achievements with diamonds (e.g. 1.5 for the tractor ones)
export const ACHIEVEMENTS: Achievement[] = [
  { id: 'dig', stat: 'dug', tiers: [25, 250, 2500], diamonds: [0.5, 1.5, 3] },
  { id: 'harvest', stat: 'harvested', tiers: [50, 500, 5000], diamonds: [0.5, 2, 5] },
  { id: 'water', stat: 'watered', tiers: [30, 300, 3000], diamonds: [0.5, 1.5, 3] },
  { id: 'pests', stat: 'pests', tiers: [10, 100, 1000], diamonds: [0.5, 1.5, 3] },
  { id: 'gardener', stat: 'trees', tiers: [5, 25, 100], diamonds: [1, 2, 4] },
  { id: 'rancher', stat: 'animals', tiers: [3, 15, 50], diamonds: [1, 2, 4] },
  { id: 'trader', stat: 'earned', tiers: [5000, 50000, 500000], diamonds: [1, 2, 5] },
  { id: 'friend', stat: 'helped', tiers: [10, 100, 1000], diamonds: [1, 2, 4] },
  { id: 'orders', stat: 'orders', tiers: [5, 50, 250], diamonds: [1, 2, 5] },
  { id: 'chef', stat: 'crafted', tiers: [5, 50, 300], diamonds: [1, 2, 4] },
];
