// Field metadata for the config tool — the equivalent of Unity attributes ([Header], [Tooltip], [Range], ...).
// The inspector builds itself from the JSON it loads, so EVERY value is editable even with no entry here.
// An entry only adds a label, tooltip, range (slider), unit, etc. to that value.
//
// Pattern syntax: dot-separated path, '*' matches one segment (array index or object key).
//   e.g. 'boosters.*.price' matches boosters.reveal.price
// Entry keys:
//   label   display name          tip     tooltip (shown on hover and as ⓘ)
//   min/max range (min+max => slider)   step  step size     int  integers only
//   unit    suffix text           type    'color' | 'text' | 'multiline' | 'select'
//   options for type 'select'     header  bold heading drawn above the row
//   dict    object whose keys can be added / removed
//   title   array-item title template, e.g. '{name} ({id})'
//   open    foldout starts open
//   readonly  shown but not editable
(function () {
  const M = {};

  M['mechanics.json'] = {
    description: 'Level mechanics (pond, mystery numbers, twin portals, locked cells): unlock level and the intro screen text. Read by mechanics.js and main.js. Keep the unlock levels in sync with HB.MECH_UNLOCK in level-tool/js/model.js (the level tool warns with it).',
    fields: [
      { path: 'order', label: 'Unlock order', tip: 'Order the mechanics unlock in; the win-screen progress bar follows it.', readonly: true },
      { path: '*.unlockLevel', label: 'Unlock level', tip: 'The level where the mechanic first appears (the intro screen opens before it). The win-screen bar counts levels up to this one.', int: true, min: 1, max: 99 },
      { path: '*.intro', label: 'Show intro screen', tip: 'Show the intro screen once per save before the unlock level.' },
      { path: '*.title', label: 'Intro title' },
      { path: '*.lines', label: 'Intro lines', tip: 'One line per bullet on the intro screen.' },
    ],
  };

  M['tuning.json'] = {
    description: 'Constants that used to be hard-coded in game code: hearts, hint timing, combo praise, layout and board colours. Read by game.js, hint.js, praise.js, profile.js, main.js.',
    fields: [
      { path: 'hearts', label: 'Hearts', open: true },
      { path: 'hearts.max', label: 'Max hearts', tip: 'Mistakes allowed per attempt. Stars = hearts left when the level is cleared (1 to 3), so values above 3 add no extra stars, and values below 3 make 3 stars impossible. Levels 1-2 on first play ignore hearts.', int: true, min: 1, max: 9 },
      { path: 'hint', label: 'Auto hint', open: true },
      { path: 'hint.idleSeconds', label: 'Idle before hint', tip: 'Seconds without placing a tile before the auto hint appears (when the Hints setting is on).', unit: 's', min: 1, max: 30, step: 0.5 },
      { path: 'daily', label: 'Daily gifts', open: true },
      { path: 'daily.unlockLevel', label: 'Unlock level', tip: 'The daily gift button unlocks once level (this - 1) is cleared.', int: true, min: 1, max: 30 },
      { path: 'avatars', label: 'Avatars' },
      { path: 'avatars.prices', label: 'Avatar prices', tip: 'Coin price per avatar, in the order cat, cow, fox, chick, pig, sheep, rabbit, bee, duck. 0 = free.' },
      { path: 'avatars.prices.*', int: true, min: 0, max: 100000 },

      { path: 'praise', label: 'Combo praise' },
      { path: 'praise.idleMaxMs', label: 'Combo window (start)', tip: 'Time allowed to place the next tile before the combo resets, at streak 0 -> 1.', unit: 'ms', int: true, min: 500, max: 60000, step: 100 },
      { path: 'praise.idleMinMs', label: 'Combo window (top tier)', tip: 'Shortest window, reached at the top praise tier and kept after it. Window shrinks linearly from the start value.', unit: 'ms', int: true, min: 500, max: 60000, step: 100 },
      { path: 'praise.chainText', label: 'Chain texts', tip: 'Text when one drop links up several neighbours at once. Key = number of links.', dict: true },
      { path: 'praise.tiers', label: 'Praise tiers', tip: 'Tier shown at streak >= min. Keep them sorted by min; the highest matching tier wins.' },
      { path: 'praise.tiers.*', title: '{min}+  {text}' },
      { path: 'praise.tiers.*.min', label: 'From streak', int: true, min: 1, max: 50 },
      { path: 'praise.tiers.*.text', label: 'Text' },
      { path: 'praise.tiers.*.colorTop', label: 'Colour (top)', type: 'color' },
      { path: 'praise.tiers.*.colorBottom', label: 'Colour (bottom)', type: 'color' },
      { path: 'praise.tiers.*.parts', label: 'Particles', int: true, min: 0, max: 120 },
      { path: 'praise.tiers.*.size', label: 'Text size', tip: 'Scale of the praise text.', min: 0.5, max: 3, step: 0.05 },

      { path: 'layout', label: 'Board layout' },
      { path: 'layout.maxCellRadius', label: 'Max cell radius', tip: 'Cap on hex cell size (px) so tiny maps like level 1 do not look huge.', unit: 'px', int: true, min: 20, max: 120 },
      { path: 'layout.trayPad', label: 'Tray side padding', unit: 'px', int: true, min: 0, max: 60 },
      { path: 'layout.trayGap', label: 'Tray tile gap', tip: 'Space between tile groups in the bottom tray.', unit: 'px', int: true, min: 0, max: 60 },
      { path: 'layout.boardGap', label: 'Board top gap', tip: 'Space between the HUD and the board on normal levels.', unit: 'px', int: true, min: 0, max: 80 },
      { path: 'layout.tutorialGap', label: 'Board top gap (tutorial levels)', tip: 'Same, on levels that show a tutorial bubble (level 1 and each booster unlock level).', unit: 'px', int: true, min: 0, max: 120 },

      { path: 'colors', label: 'Board colours' },
      { path: 'colors.*', type: 'color' },
      { path: 'colors.background', label: 'Background' },
      { path: 'colors.water', label: 'Water' },
      { path: 'colors.waterEdge', label: 'Water edge' },
      { path: 'colors.hint', label: 'Hint highlight' },
      { path: 'colors.ghostOk', label: 'Drop preview: valid' },
      { path: 'colors.ghostBad', label: 'Drop preview: invalid' },
    ],
  };

  M['economy.json'] = {
    description: 'Coins, win rewards, revive costs, boosters and the daily-gift table. Read by progress.js and main.js (and by the sim bot).',
    fields: [
      { path: 'startCoins', label: 'Starting coins', tip: 'Coins a brand-new save starts with.', int: true, min: 0, max: 100000 },
      { path: 'win', label: 'Win reward', open: true },
      { path: 'win.base', label: 'Base reward', tip: 'Coins for the first clear, before the star bonus.', int: true, min: 0, max: 1000 },
      { path: 'win.starBonus', label: 'Star bonus', tip: 'Extra coins by stars earned. Key = star count.', dict: true },
      { path: 'win.starBonus.*', int: true, min: 0, max: 1000 },
      { path: 'win.replayMultiplier', label: 'Replay multiplier', tip: 'Replaying a cleared level pays (base + bonus) x this.', min: 0, max: 1, step: 0.05 },
      { path: 'costs', label: 'Costs', open: true },
      { path: 'costs.revive', label: 'Revive cost', tip: 'Coin cost of the 1st, 2nd, 3rd... revive within one attempt. After the last entry no more revives are offered.' },
      { path: 'costs.revive.*', int: true, min: 0, max: 10000 },
      { path: 'boosters', label: 'Boosters', open: true },
      { path: 'boosters.order', label: 'Order', tip: 'Booster ids, in the order shown in the bar and shop. Each id needs an entry below.' },
      { path: 'boosters.packSize', label: 'Pack size', tip: 'How many boosters one "pack" purchase gives.', int: true, min: 1, max: 20 },
      { path: 'boosters.packDiscount', label: 'Pack discount factor', tip: '0.85 = pack costs 85% of buying singles (informational: the pack price is the "pack" field of each booster).', min: 0, max: 1, step: 0.01 },
      { path: 'boosters.*', title: '{name}' },
      { path: 'boosters.*.name', label: 'Name' },
      { path: 'boosters.*.price', label: 'Price (single)', int: true, min: 0, max: 10000, unit: 'coins' },
      { path: 'boosters.*.pack', label: 'Price (pack)', int: true, min: 0, max: 10000, unit: 'coins' },
      { path: 'boosters.*.unlockLevel', label: 'Unlock level', tip: 'Also the level whose tutorial teaches this booster.', int: true, min: 1, max: 100 },
      { path: 'boosters.*.desc', label: 'Description', type: 'multiline' },
      { path: 'daily', label: 'Daily rewards', open: true },
      { path: 'daily.days', label: 'Gift table (loops every N days)', tip: 'One card per day of the weekly table; the table loops.' },
      { path: 'daily.days.*', title: 'Day {#}' },
      { path: 'daily.days.*.coins', label: 'Coins', int: true, min: 0, max: 10000 },
      { path: 'daily.days.*.boosters', label: 'Boosters', dict: true },
      { path: 'daily.days.*.boosters.*', int: true, min: 0, max: 50 },
      { path: 'daily.milestones', label: 'Streak chests', tip: 'Chest opened at this streak length. The last one (highest "at") is also the cycle length: the streak resets after it.' },
      { path: 'daily.milestones.*', title: 'Day {at} chest' },
      { path: 'daily.milestones.*.at', label: 'At streak day', int: true, min: 1, max: 365 },
      { path: 'daily.milestones.*.coins', label: 'Coins', int: true, min: 0, max: 10000 },
      { path: 'daily.milestones.*.boosters', label: 'Boosters', dict: true },
      { path: 'daily.milestones.*.boosters.*', int: true, min: 0, max: 50 },
      { path: 'daily.milestones.*.cosmetic', label: 'Cosmetic id', tip: 'Cosmetic item (see cosmetics.json) granted by this chest.' },
      { path: 'daily.milestones.*.ownedCoins', label: 'Coins if already owned', tip: 'Coins given instead when the player already owns the cosmetic.', int: true, min: 0, max: 10000 },
    ],
  };

  M['shop.json'] = {
    description: 'Shop catalogue: starter offer, bundles, daily free gift, coin packs. Prices are in USD for the placeholder (fake) purchases. Read by main.js.',
    fields: [
      { path: '*.price', label: 'Price', unit: 'USD', min: 0, max: 200, step: 0.01 },
      { path: '*.was', label: 'Crossed-out price', unit: 'USD', min: 0, max: 400, step: 0.01 },
      { path: '*.off', label: 'Discount label', tip: 'The "% OFF" badge. Text only; it is not computed from the prices.', unit: '%', int: true, min: 0, max: 99 },
      { path: '*.coins', label: 'Coins', int: true, min: 0, max: 1000000 },
      { path: '*.*.price', label: 'Price', unit: 'USD', min: 0, max: 200, step: 0.01 },
      { path: '*.*.was', label: 'Crossed-out price', unit: 'USD', min: 0, max: 400, step: 0.01 },
      { path: '*.*.off', label: 'Discount label', tip: 'The "% OFF" badge. Text only; it is not computed from the prices.', unit: '%', int: true, min: 0, max: 99 },
      { path: '*.*.coins', label: 'Coins', int: true, min: 0, max: 1000000 },
      { path: '*.*.boosters', label: 'Boosters', dict: true },
      { path: '*.*.boosters.*', int: true, min: 0, max: 50 },
      { path: '*.*', title: '{name}{id}' },
      { path: 'removeAds.enabled', label: 'Enabled', tip: 'Show the Remove Ads offer.' },
      { path: '*.*.once', label: 'One-time only', tip: 'Can be bought once per save.' },
      { path: '*.*.tone', label: 'Colour tone' },
    ],
  };

  M['cosmetics.json'] = {
    description: 'Tile skins / garden themes. Each skin recolours the tiles and the whole UI through its "vars". Read by progress.js and main.js.',
    fields: [
      { path: 'defaults.owned', label: 'Owned at start', tip: 'Cosmetic ids a new save owns.' },
      { path: 'defaults.equipped', label: 'Equipped at start', dict: true },
      { path: 'items', label: 'Items' },
      { path: 'items.*', title: '{name} ({id})' },
      { path: 'items.*.price', label: 'Price', int: true, min: 0, max: 100000, unit: 'coins' },
      { path: 'items.*.id', label: 'Id', tip: 'Referenced by saves and chest rewards. Do not rename a published id.' },
      { path: 'items.*.face', label: 'Tile face (top, bottom)' },
      { path: 'items.*.rim', label: 'Tile rim (top, bottom)' },
      { path: 'items.*.base', label: 'Tile base', type: 'color' },
      { path: 'items.*.game', label: 'Game background', type: 'color' },
      { path: 'items.*.socket', label: 'Empty cell colours' },
      { path: 'items.*.vars', label: 'UI theme variables (CSS)' },
    ],
  };

  M['collection.json'] = {
    description: 'Album: sets and the creatures that appear in the garden after a win. Read by progress.js and main.js.',
    fields: [
      { path: 'sets', label: 'Sets' },
      { path: 'sets.*', title: '{name}' },
      { path: 'sets.*.bonus', label: 'Completion bonus', tip: 'Coins for completing the set.', int: true, min: 0, max: 10000, unit: 'coins' },
      { path: 'species', label: 'Species' },
      { path: 'species.*', title: '{icon} {name}' },
      { path: 'species.*.level', label: 'Appears at level', tip: 'Level whose win reveals this species.', int: true, min: 1, max: 200 },
      { path: 'species.*.set', label: 'Set id' },
      { path: 'species.*.fact', label: 'Fact', type: 'multiline' },
    ],
  };

  M['personas.json'] = {
    description: 'Bot personas for the simulator (sim/). Not read by the game.',
    fields: [
      { path: 'personas.*', title: '{name} ({id})' },
      { path: 'personas.*.share', label: 'Population share', min: 0, max: 1, step: 0.01 },
    ],
  };

  // Files the tool edits. `path` is relative to the project root.
  window.CONFIG_FILES = [
    { name: 'tuning.json', path: 'src/tuning.json', group: 'Game' },
    { name: 'mechanics.json', path: 'src/mechanics.json', group: 'Game' },
    { name: 'economy.json', path: 'src/economy.json', group: 'Game' },
    { name: 'shop.json', path: 'src/shop.json', group: 'Game' },
    { name: 'cosmetics.json', path: 'src/cosmetics.json', group: 'Game' },
    { name: 'collection.json', path: 'src/collection.json', group: 'Game' },
    { name: 'personas.json', path: 'sim/personas.json', group: 'Simulator' },
  ];
  window.CONFIG_META = M;
})();
