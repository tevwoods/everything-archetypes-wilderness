/**
 * Generate Foundry VTT PF2e compendium JSON files from gmbinder-markdown.txt
 * Run with: node scripts/generate-packs.js
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

// ---------- helpers ----------
function rid() { return crypto.randomBytes(8).toString('hex').slice(0, 16); }
function stableId(seed) { return crypto.createHash('sha256').update(seed).digest('hex').slice(0, 16); }
function spellUuid(name) { return `Compendium.everything-archetypes-wilderness.eaw-spells.${stableId('eaw-spells:' + name)}`; }
function featUuid(name) { return `Compendium.everything-archetypes-wilderness.eaw-feats.${stableId('eaw-feats:' + name)}`; }
function macroUuid(name) { return `Compendium.everything-archetypes-wilderness.eaw-macros.${stableId('eaw-macros:' + name)}`; }
function effectUuid(name) { return `Compendium.everything-archetypes-wilderness.eaw-effects.${stableId('eaw-effects:' + name)}`; }
function sysSpell(id, label) { return `@UUID[Compendium.pf2e.spells-srd.Item.${id}]{${label}}`; }
const now = Date.now();

// ---------- read markdown & pre-index headers ----------
const markdownPath = path.join(process.cwd(), 'gmbinder-markdown.txt');
const raw = fs.readFileSync(markdownPath, 'utf8');
const allLines = raw.split('\n');

// Build index: every #### header with name, label type, and 0-based line number
const headerIndex = [];
allLines.forEach((line, i) => {
  const m = line.match(/^####\s+(.+?)\s*(?:\{[^}]+\})?\s*<div class="label">(FEAT|FOCUS|SPELL|ITEM)\s/);
  if (m) headerIndex.push({ name: m[1].trim(), type: m[2], line: i });
});

/**
 * Extract cleaned description HTML for a named #### entry.
 * @param {string} entryName
 * @param {string} [labelType] - optional: 'FEAT', 'FOCUS', 'SPELL', 'ITEM' to disambiguate same-name entries
 */
function extractDescription(entryName, labelType) {
  const entry = labelType
    ? headerIndex.find(h => h.name === entryName && h.type === labelType)
    : headerIndex.find(h => h.name === entryName);
  if (!entry) {
    console.warn(`WARNING: Could not find "${entryName}" in header index`);
    return `<p>[Description for ${entryName} - not found in source]</p>`;
  }
  const startIdx = entry.line;
  const nextEntry = headerIndex.find(h => h.line > startIdx);
  const endIdx = nextEntry ? nextEntry.line : allLines.length;
  const block = allLines.slice(startIdx + 1, endIdx);

  // State machine to extract the description content
  let inTagList = false, inReqBox = false, inRule = false;
  let tagDepth = 0, reqDepth = 0;
  const desc = [];

  for (const rawLine of block) {
    const t = rawLine.trim();
    if (!t) {
      if (inRule && desc.length > 0) desc.push('</p>\n<p>');
      continue;
    }
    if (t.includes('\\pagebreakNum') || t.includes('\\columnbreak')) {
      if (inRule) break;
      continue;
    }
    if (t.includes('class="feat-margin')) continue;

    // Stop at any markdown header (# through ######)
    if (/^#{1,6}\s/.test(t)) {
      if (inRule) break;
      continue;
    }
    // Stop at wide intro paragraphs, flavor sections, and sidebars (not feat content)
    if (t.includes('class="wide"') || t.includes('class="wide ')) {
      if (inRule) break;
      continue;
    }
    if (t.includes('class="flavor')) {
      if (inRule) break;
      continue;
    }
    if (t.includes('class="smallsidebar"') || t.includes('class="sidebar"')) {
      if (inRule) break;
      continue;
    }
    if (t.includes('<p class="wide"') || t.includes('<p style=')) {
      if (inRule) break;
      continue;
    }

    // --- skip taglist ---
    if (t.includes('class="taglist"')) { inTagList = true; tagDepth = 1; continue; }
    if (inTagList) {
      tagDepth += (t.match(/<div/g) || []).length;
      tagDepth -= (t.match(/<\/div>/g) || []).length;
      if (tagDepth <= 0) inTagList = false;
      continue;
    }
    // --- skip reqbox ---
    if (t.includes('class="reqbox"')) { inReqBox = true; reqDepth = 1; continue; }
    if (inReqBox) {
      reqDepth += (t.match(/<div/g) || []).length;
      reqDepth -= (t.match(/<\/div>/g) || []).length;
      if (reqDepth <= 0) inReqBox = false;
      continue;
    }

    // Start collecting on first rule/box div
    if (!inRule && (t.includes('class="rule"') || t.includes('class="box"'))) {
      inRule = true;
    }
    if (!inRule) continue;

    let c = t
      .replace(/<div class="rule">\s*/g, '')
      .replace(/<div class="box">\s*/g, '')
      .replace(/<\/div><br\s*\/?>/g, '')
      .replace(/<div class="r4[^"]*">/g, '<p><strong>Critical Success</strong> ')
      .replace(/<div class="r3[^"]*">/g, '<p><strong>Success</strong> ')
      .replace(/<div class="r2[^"]*">/g, '<p><strong>Failure</strong> ')
      .replace(/<div class="r1[^"]*">/g, '<p><strong>Critical Failure</strong> ')
      .replace(/<div class="ability-box">/g, '<hr /><p>')
      .replace(/<span class="ability-box-name">([^<]+)<\/span>/g, '<strong>$1</strong>')
      .replace(/<span class="rule targets">\s*/g, '<strong>Targets</strong> ')
      .replace(/<span class="rule effect">\s*/g, '<strong>Effect</strong> ')
      .replace(/<\/span>/g, '')
      .replace(/\{3A\}/g, '[three-actions]')
      .replace(/\{2A\}/g, '[two-actions]')
      .replace(/\{1A\}/g, '[one-action]')
      .replace(/\{0A\}/g, '[free-action]')
      .replace(/\{R\}/g, '[reaction]')
      .replace(/<b>/g, '<strong>').replace(/<\/b>/g, '</strong>')
      .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
      .replace(/<div class="rule heightened\w+">/g, '<p>')
      .replace(/<div class="line-break-above"><\/div>/g, '')
      .replace(/<div style="[^"]*"><\/div>/g, '')
      .replace(/<div style="[^"]*">/g, '')
      .replace(/<div[^>]*>/g, '').replace(/<\/div>/g, '')
      .replace(/<i>/g, '<em>').replace(/<\/i>/g, '</em>')
      .trim();

    if (!c || c === '<br>' || c === '<br/>' || c === '</p>' || c === '<p></p>') continue;
    desc.push(c);
  }

  let result = desc.join('\n');

  // Final cleanup: strip remaining span wrappers and class attributes
  result = result.replace(/<span class="rule req">/g, '<strong>Requirements</strong> ');
  result = result.replace(/<span class="rule effect">/g, '<strong>Effect</strong> ');
  result = result.replace(/<span class="rule">/g, '');
  result = result.replace(/<\/span>/g, '');
  result = result.replace(/\s*class="[^"]*"/g, '');
  result = result.replace(/<div\s*>/g, '');

  if (result && !result.startsWith('<p>') && !result.startsWith('<hr')) {
    result = `<p>${result}</p>`;
  }
  result = result.replace(/<p>\s*<\/p>/g, '');
  // Strip Special paragraphs from parsed content (featDoc appends these from the special param)
  result = result.replace(/\n?<p><strong>Special<\/strong>\s[^<]*<\/p>/g, '');
  result = result.replace(/<strong>Special<\/strong>\s[^<]*/g, '');
  return result || `<p>${entryName} description.</p>`;
}

// ============================================================
// Document builders
// ============================================================

function featDoc({
  name, level, description, traits = [], rarity = 'common',
  actionType = 'passive', actionCount = null,
  prerequisites = [], rules = [], frequency = null,
  special = null, trigger = null, requirements = null,
  targets = null, range = null, featType = 'archetype',
}) {
  let desc = description.trim();
  if (!desc.startsWith('<p>')) desc = `<p>${desc}</p>`;
  if (frequency) desc = `<p><strong>Frequency</strong> ${frequency}</p>\n${desc}`;
  if (trigger) desc = `<p><strong>Trigger</strong> ${trigger}</p>\n${desc}`;
  if (requirements) desc = `<p><strong>Requirements</strong> ${requirements}</p>\n${desc}`;
  if (targets) desc = `<p><strong>Targets</strong> ${targets}</p>\n${desc}`;
  if (range) desc = `<p><strong>Range</strong> ${range}</p>\n${desc}`;
  if (special) desc += `\n<p><strong>Special</strong> ${special}</p>`;

  return {
    _id: stableId('eaw-feats:' + name), name, type: 'feat',
    img: 'systems/pf2e/icons/default-icons/feats.webp',
    effects: [], folder: null, sort: 0, flags: {},
    system: {
      description: { value: desc },
      source: { value: 'Everything Archetypes: Wilderness' },
      traits: { value: traits.map(t => t.toLowerCase()), rarity, custom: '' },
      rules,
      slug: name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, ''),
      schema: { version: 0.93, lastMigration: { datetime: new Date().toISOString(), version: { schema: 0.93, foundry: '13', system: '6.0.0' } } },
      level: { value: level },
      featType: { value: featType },
      onlyLevel1: false, maxTakable: 1,
      actionType: { value: actionType },
      actionCategory: { value: '' },
      actions: { value: actionCount },
      prerequisites: { value: prerequisites.map(p => ({ value: p })) },
      location: null,
    },
    ownership: { default: 0 },
    _stats: { systemId: 'pf2e', systemVersion: '6.0.0', coreVersion: '13', createdTime: now, modifiedTime: now, lastModifiedBy: 'generator' },
    schemaVersion: 13,
  };
}

function spellDoc({
  name, rank, description, traits = [], rarity = 'uncommon',
  traditions = [], castActions = 2, range = null, area = null,
  targets = null, duration = null, defense = null, rules = [],
  spellType = 'spell', heightened = null,
}) {
  let desc = description.trim();
  if (!desc.startsWith('<p>')) desc = `<p>${desc}</p>`;
  if (heightened) desc += `\n<hr />\n${heightened}`;
  return {
    _id: stableId('eaw-spells:' + name), name, type: 'spell',
    img: 'systems/pf2e/icons/default-icons/spell.webp',
    effects: [], folder: null, sort: 0, flags: {},
    system: {
      description: { value: desc },
      source: { value: 'Everything Archetypes: Wilderness' },
      traits: { value: traits.map(t => t.toLowerCase()), rarity, custom: '' },
      rules,
      slug: name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, ''),
      schema: { version: 0.93, lastMigration: { datetime: new Date().toISOString(), version: { schema: 0.93, foundry: '13', system: '6.0.0' } } },
      level: { value: rank },
      traditions: { value: traditions },
      time: { value: String(castActions) },
      components: {},
      range: { value: range || '' },
      area: area ? { value: area.value, type: area.type } : null,
      target: { value: targets || '' },
      duration: { value: duration || '' },
      defense: defense ? { save: { statistic: defense, basic: false } } : null,
      cost: { value: '' },
      spellType: { value: spellType },
      category: { value: spellType === 'focus' ? 'focus' : 'spell' },
    },
    ownership: { default: 0 },
    _stats: { systemId: 'pf2e', systemVersion: '6.0.0', coreVersion: '13', createdTime: now, modifiedTime: now, lastModifiedBy: 'generator' },
    schemaVersion: 13,
  };
}

function equipmentDoc({
  name, level = 0, description, traits = [], rarity = 'common',
  price = {}, bulk = '-', itemType = 'weapon', rules = [],
  category = null, group = null, damage = null, range = null,
  reload = null, hands = null, usage = null,
}) {
  let desc = description.trim();
  if (!desc.startsWith('<p>')) desc = `<p>${desc}</p>`;
  const doc = {
    _id: stableId('eaw-equipment:' + name), name, type: itemType,
    img: 'systems/pf2e/icons/default-icons/equipment.webp',
    effects: [], folder: null, sort: 0, flags: {},
    system: {
      description: { value: desc },
      source: { value: 'Everything Archetypes: Wilderness' },
      traits: { value: traits.map(t => t.toLowerCase()), rarity, custom: '' },
      rules,
      slug: name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, ''),
      schema: { version: 0.93, lastMigration: { datetime: new Date().toISOString(), version: { schema: 0.93, foundry: '13', system: '6.0.0' } } },
      level: { value: level },
      price, bulk: { value: bulk },
    },
    ownership: { default: 0 },
    _stats: { systemId: 'pf2e', systemVersion: '6.0.0', coreVersion: '13', createdTime: now, modifiedTime: now, lastModifiedBy: 'generator' },
    schemaVersion: 13,
  };
  if (damage) doc.system.damage = damage;
  if (range) doc.system.range = range;
  if (reload !== null) doc.system.reload = { value: String(reload) };
  if (hands) doc.system.usage = { value: hands };
  if (category) doc.system.category = category;
  if (group) doc.system.group = group;
  return doc;
}

function effectDoc({
  name, level = 0, description, traits = [], rules = [],
  duration = {}, img = null,
}) {
  return {
    _id: stableId('eaw-effects:' + name), name, type: 'effect',
    img: img || 'icons/svg/aura.svg',
    effects: [], folder: null, sort: 0, flags: {},
    system: {
      description: { value: description },
      source: { value: 'Everything Archetypes: Wilderness' },
      rules,
      slug: name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, ''),
      schema: { version: 0.93, lastMigration: { datetime: new Date().toISOString(), version: { schema: 0.93, foundry: '13', system: '6.0.0' } } },
      level: { value: level },
      traits: { value: traits, rarity: 'common' },
      duration: {
        value: duration.value ?? -1,
        unit: duration.unit || 'unlimited',
        sustained: duration.sustained || false,
        expiry: duration.expiry || 'turn-start',
      },
      start: { value: 0, initiative: null },
      tokenIcon: { show: true },
    },
    ownership: { default: 0 },
    _stats: { systemId: 'pf2e', systemVersion: '6.0.0', coreVersion: '13', createdTime: now, modifiedTime: now, lastModifiedBy: 'generator' },
    schemaVersion: 13,
  };
}

// ============================================================
// Helper to create a feat with auto-extracted description
// ============================================================
const allFeats = [];
function addFeat(opts) {
  let desc = extractDescription(opts.name, 'FEAT');
  if (opts.effectLinks) {
    desc += `\n<hr /><p><strong>Effects</strong> ${opts.effectLinks}</p>`;
  }
  if (opts.spellLinks) {
    desc += `\n<hr /><p><strong>Spells</strong> ${opts.spellLinks}</p>`;
  }
  allFeats.push(featDoc({ ...opts, description: desc }));
}

// ===== TREESPEAKER =====
addFeat({ name: 'Treespeaker Dedication', level: 6, rarity: 'uncommon', traits: ['archetype', 'dedication'], special: "You can't select another dedication feat until you have gained two other feats from the Treespeaker archetype.", spellLinks: `${sysSpell('dileJ0Yxqg76LMvu','One with Plants')} (at will) | ${sysSpell('qvwIwJ9QBihy8R0t','Speak with Plants')} (1/day, trees only)`, rules: [
  { key: 'ActiveEffectLike', mode: 'add', path: 'system.build.languages.granted', value: { slug: 'arboreal', source: '{item|name}' } }
] });
addFeat({ name: 'Native Treespeaker', level: 6, rarity: 'rare', traits: ['archetype'], prerequisites: ['Treespeaker Dedication'], rules: [
  { key: 'Note', selector: 'perception', text: '<p class="compact-text"><strong>Native Treespeaker</strong> You are permanently under the effects of <em>speak with plants</em> (trees only). You can draw out specific information even from disinterested trees.</p>' }
] });
addFeat({ name: 'Branch Out', level: 6, traits: ['archetype', 'skill'], prerequisites: ['Treespeaker Dedication', 'expert in Nature'], rules: [
  { key: 'Note', selector: ['nature', 'diplomacy'], text: `<p class="compact-text"><strong>Branch Out</strong> You can use Nature instead of Diplomacy to @UUID[${macroUuid('Branch Out - Gather Information')}]{Gather Information} or @UUID[${macroUuid('Branch Out - Make an Impression')}]{Make an Impression}.</p>`, predicate: [{ or: ['action:gather-information', 'action:make-an-impression'] }] }
] });
addFeat({ name: 'Arboreal Arms', level: 8, traits: ['archetype'], prerequisites: ['Treespeaker Dedication'], rules: [
  { key: 'GrantItem', uuid: spellUuid('Arboreal Arms') }
] });
addFeat({ name: 'Arboreal Mystic', level: 8, traits: ['archetype'], prerequisites: ['Treespeaker Dedication'] });
addFeat({ name: 'Rejuvenate', level: 8, traits: ['archetype'], prerequisites: ['Treespeaker Dedication'], effectLinks: `Drag to ally: @UUID[${effectUuid('Effect: Rejuvenate')}]{Effect: Rejuvenate}` });
addFeat({ name: 'Mystic Avenger', level: 10, traits: ['archetype'], prerequisites: ['Treespeaker Dedication', 'Arboreal Mystic'] });
addFeat({ name: 'Mystic Protector', level: 10, traits: ['archetype'], prerequisites: ['Treespeaker Dedication', 'Arboreal Mystic'] });
addFeat({ name: 'Versatile Arms', level: 10, traits: ['archetype'], prerequisites: ['Treespeaker Dedication', 'Arboreal Arms'] });
addFeat({ name: 'Aspect of Oak', level: 12, traits: ['archetype'], prerequisites: ['Treespeaker Dedication'], special: 'You cannot select this feat if you have Aspect of Rosewood or Aspect of Yew.', rules: [
  { key: 'Resistance', type: 'piercing', value: 'floor(@actor.level / 2)' },
  { key: 'Resistance', type: 'slashing', value: 'floor(@actor.level / 2)' }
] });
addFeat({ name: 'Aspect of Rosewood', level: 12, traits: ['archetype'], prerequisites: ['Treespeaker Dedication'], special: 'You cannot select this feat if you have Aspect of Oak or Aspect of Yew.', rules: [
  { key: 'FlatModifier', selector: 'ac', type: 'circumstance', value: 1, label: 'Aspect of Rosewood' },
  { key: 'Resistance', type: 'physical', value: 'floor(@actor.level / 2)' },
  { key: 'RollOption', domain: 'diplomacy', option: 'aspect-of-rosewood-scent', toggleable: true, label: 'Target can smell you' },
  { key: 'FlatModifier', selector: 'diplomacy', type: 'circumstance', value: 1, label: 'Aspect of Rosewood (scent)', predicate: ['aspect-of-rosewood-scent'] }
] });
addFeat({ name: 'Aspect of Yew', level: 12, traits: ['archetype'], prerequisites: ['Treespeaker Dedication'], special: 'You cannot select this feat if you have Aspect of Oak or Aspect of Rosewood.', rules: [
  { key: 'Resistance', type: 'bludgeoning', value: 'floor(@actor.level / 2)' }
] });
addFeat({ name: 'Expert Arboreal Mystic', level: 12, traits: ['archetype'], prerequisites: ['Treespeaker Dedication', 'Arboreal Mystic'], rules: [
  { key: 'Note', selector: 'spell-attack-roll', text: '<p class="compact-text"><strong>Expert Arboreal Mystic</strong> Your spell attack rolls and spell DCs increase to expert. You also gain a 2nd-rank and 3rd-rank spell slot.</p>' }
] });
addFeat({ name: 'All Connected', level: 14, rarity: 'uncommon', traits: ['archetype'], prerequisites: ['Treespeaker Dedication'], spellLinks: `${sysSpell('69L70wKfGDY66Mk9','Teleport')} (1/day, primal, destination adjacent to a tree)` });
addFeat({ name: 'Arboreal Legs', level: 14, traits: ['archetype'], prerequisites: ['Treespeaker Dedication'], rules: [
  { key: 'GrantItem', uuid: spellUuid('Arboreal Legs') }
] });
addFeat({ name: 'Effortless Grapple', level: 14, traits: ['archetype', 'flourish'], prerequisites: ['Treespeaker Dedication', 'Arboreal Arms'], actionType: 'free', requirements: 'You have a creature grappled by your arboreal arm.', targets: 'the creature you have grappled', rules: [
  { key: 'Note', selector: 'athletics', text: '<p class="compact-text"><strong>Effortless Grapple</strong> You may Grapple as a free action (Flourish) to maintain a grapple with your arboreal arm.</p>', predicate: ['action:grapple'] }
] });
addFeat({ name: 'Arboreal Bole', level: 16, traits: ['archetype'], prerequisites: ['Treespeaker Dedication'], rules: [
  { key: 'GrantItem', uuid: spellUuid('Arboreal Bole') }
] });
addFeat({ name: 'Tree Herald', level: 16, traits: ['archetype'], prerequisites: ['Treespeaker Dedication'], spellLinks: `${sysSpell('jSRAyd57kd4WZ4yE','Summon Plant or Fungus')} (1/day, 8th rank; 9th at 18th, 10th at 20th)` });
addFeat({ name: 'Master Arboreal Mystic', level: 18, traits: ['archetype'], prerequisites: ['Treespeaker Dedication', 'Expert Arboreal Mystic'], rules: [
  { key: 'Note', selector: 'spell-attack-roll', text: '<p class="compact-text"><strong>Master Arboreal Mystic</strong> Your spell attack rolls and spell DCs increase to master. You also gain a 4th-rank spell slot.</p>' }
] });
addFeat({ name: 'Ascended Aspect', level: 20, traits: ['archetype'], prerequisites: ['Treespeaker Dedication', 'one of Aspect of Oak, Aspect of Rosewood, or Aspect of Yew'], rules: [
  { key: 'ChoiceSet', choices: [
    { label: 'Aspect of Oak', value: 'oak' },
    { label: 'Aspect of Rosewood', value: 'rosewood' },
    { label: 'Aspect of Yew', value: 'yew' }
  ], flag: 'ascendedAspect', prompt: 'Choose which Aspect to enhance' },
  { key: 'RollOption', domain: 'all', option: 'ascended-aspect:{item|flags.pf2e.rulesSelections.ascendedAspect}' },
  { key: 'FlatModifier', selector: 'ac', type: 'circumstance', value: 3, label: 'Ascended Aspect of Rosewood', predicate: ['ascended-aspect:rosewood'] }
] });
addFeat({ name: 'Mystic Refocus', level: 20, traits: ['archetype'], prerequisites: ['Treespeaker Dedication', 'Arboreal Mystic'] });
addFeat({ name: 'Tree of Life', level: 20, traits: ['archetype', 'healing', 'primal'], prerequisites: ['Treespeaker Dedication'], actionType: 'action', actionCount: 3, frequency: 'once per day', effectLinks: `Drag to ally: @UUID[${effectUuid('Effect: Tree of Life')}]{Effect: Tree of Life}` });

// ===== CALLED SPEAKER =====
addFeat({ name: 'Called Speaker Dedication', level: 2, rarity: 'uncommon', traits: ['archetype', 'dedication'], rules: [
  { key: 'ActiveEffectLike', mode: 'upgrade', path: 'system.skills.nature.rank', value: 1 }
], special: "You can't select another dedication feat until you have gained two other feats from the Called Speaker archetype, though you may take the Treespeaker Dedication feat. It and any other feat from that archetype count as a Called Speaker feat for the purpose of satisfying this special requirement." });
addFeat({ name: 'Dumb Luck', level: 4, traits: ['archetype', 'fortune'], prerequisites: ['Called Speaker Dedication'], rules: [
  { key: 'Note', selector: 'saving-throw', text: '<p class="compact-text"><strong>Dumb Luck</strong> Once per day, you may reroll a failed or critically failed saving throw using your highest save modifier. You must use the new result.</p>' }
] });
addFeat({ name: 'Incredible Willpower', level: 4, traits: ['archetype'], prerequisites: ['Called Speaker Dedication'], actionType: 'reaction', trigger: 'You succeed on a saving throw against a mental effect.', rules: [
  { key: 'AdjustDegreeOfSuccess', selector: 'saving-throw', adjustment: { success: 'one-degree-better' }, predicate: ['trait:mental'] }
] });
addFeat({ name: 'Timeless Persuasion', level: 4, traits: ['archetype', 'skill'], prerequisites: ['Called Speaker Dedication', 'expert in Diplomacy'], rules: [
  { key: 'RollOption', domain: 'diplomacy', option: 'timeless-persuasion-extra-time', toggleable: true, label: 'Spending extra time (10 min+)' },
  { key: 'FlatModifier', selector: 'diplomacy', type: 'circumstance', value: 2, label: 'Timeless Persuasion', predicate: ['timeless-persuasion-extra-time'] }
] });

// ===== ANIMAL TRAINER =====
addFeat({ name: 'Cover Performance', level: 4, traits: ['archetype', 'exploration'], prerequisites: ['Animal Trainer Dedication'] });
addFeat({ name: 'Distract Trick', level: 4, traits: ['archetype', 'skill', 'trick'], prerequisites: ['Animal Trainer Dedication', 'Trick Teacher', 'expert in Nature'], actionType: 'action', actionCount: 1, effectLinks: `Drag to enemy: @UUID[${effectUuid('Effect: Distract (Off-Guard)')}]{Effect: Distract (Off-Guard)}` });
addFeat({ name: 'Fetch Trick', level: 4, traits: ['archetype', 'skill', 'trick'], prerequisites: ['Animal Trainer Dedication', 'Trick Teacher', 'expert in Nature'], actionType: 'action', actionCount: 2 });
addFeat({ name: 'Open and Close Trick', level: 4, traits: ['archetype', 'skill', 'trick'], prerequisites: ['Animal Trainer Dedication', 'Trick Teacher'], actionType: 'action', actionCount: 1 });
addFeat({ name: 'Play Dead Trick', level: 4, traits: ['archetype', 'skill', 'trick'], prerequisites: ['Animal Trainer Dedication', 'Trick Teacher'], actionType: 'action', actionCount: 1 });
addFeat({ name: 'Trick Teacher', level: 4, traits: ['archetype'], prerequisites: ['Animal Trainer Dedication'] });
addFeat({ name: 'Trickster Companion', level: 6, traits: ['archetype'], prerequisites: ['Animal Trainer Dedication', 'Trick Teacher'] });
addFeat({ name: 'Deliver Consumable Trick', level: 8, traits: ['archetype', 'skill', 'trick'], prerequisites: ['Animal Trainer Dedication', 'Trick Teacher', 'master in Nature'], actionType: 'action', actionCount: 2 });
addFeat({ name: 'Keep Away Trick', level: 8, traits: ['archetype', 'skill', 'trick'], prerequisites: ['Animal Trainer Dedication', 'Trick Teacher', 'master in Nature'], actionType: 'action', actionCount: 2, rules: [
  { key: 'RollOption', domain: 'ac', option: 'keep-away-active', toggleable: true, label: 'Companion using Keep Away' },
  { key: 'FlatModifier', selector: 'ac', type: 'circumstance', value: 2, label: 'Keep Away Trick', predicate: ['keep-away-active'] }
] });
addFeat({ name: 'Rolling Charge Trick', level: 8, traits: ['archetype', 'skill', 'trick'], prerequisites: ['Animal Trainer Dedication', 'Trick Teacher', 'master in Nature'], actionType: 'action', actionCount: 2 });
addFeat({ name: 'Trick Rider', level: 8, traits: ['archetype'], prerequisites: ['Animal Trainer Dedication'] });
addFeat({ name: 'Flamboyant Dismount', level: 10, traits: ['archetype', 'visual'], prerequisites: ['Animal Trainer Dedication', 'Trick Rider'] });
addFeat({ name: 'Swimming Companion', level: 10, traits: ['archetype'], prerequisites: ['Animal Trainer Dedication'] });
addFeat({ name: 'Dazzling Display Trick', level: 12, traits: ['archetype', 'skill', 'trick'], prerequisites: ['Animal Trainer Dedication', 'Trick Teacher', 'master in Nature'], actionType: 'action', actionCount: 2 });
addFeat({ name: 'Drag Trick', level: 12, traits: ['archetype', 'skill', 'trick'], prerequisites: ['Animal Trainer Dedication', 'Trick Teacher', 'master in Nature'], actionType: 'action', actionCount: 1 });
addFeat({ name: 'Tandem Performance', level: 14, traits: ['archetype', 'auditory', 'visual'], prerequisites: ['Animal Trainer Dedication'], rules: [
  { key: 'Note', selector: ['deception', 'diplomacy', 'intimidation', 'performance'], text: '<p class="compact-text"><strong>Tandem Performance</strong> If your animal companion is adjacent, it can Aid you without preparing or spending a reaction.</p>' }
] });
addFeat({ name: 'Flying Companion', level: 16, traits: ['archetype'], prerequisites: ['Animal Trainer Dedication'] });
addFeat({ name: 'Running Mount Trick', level: 16, traits: ['archetype', 'skill', 'trick'], prerequisites: ['Animal Trainer Dedication', 'Trick Teacher', 'legendary in Nature'], actionType: 'action', actionCount: 1 });

// ===== BOUNTY HUNTER =====
addFeat({ name: 'Hampering Critical', level: 4, traits: ['archetype'], prerequisites: ['Bounty Hunter Dedication'], effectLinks: `Drag to enemy: @UUID[${effectUuid('Effect: Hampering Critical')}]{Effect: Hampering Critical}`, rules: [
  { key: 'Note', selector: 'strike-attack-roll', text: '<p class="compact-text"><strong>Hampering Critical</strong> On a critical hit, you may give the target a -10 ft. circumstance penalty to Speeds until end of your next turn. If already affected, increase the penalty by 5 ft.</p>', outcome: ['criticalSuccess'] }
] });
addFeat({ name: 'Net Gun Proficiency', level: 4, rarity: 'uncommon', traits: ['archetype'], prerequisites: ['Bounty Hunter Dedication'], rules: [
  { key: 'ActiveEffectLike', mode: 'upgrade', path: 'system.martial.weapon-base-net-gun.rank', value: 1 },
  { key: 'Note', selector: 'strike-attack-roll', text: '<p class="compact-text"><strong>Net Gun Proficiency</strong> Your net gun proficiency scales with class features that grant expert or greater weapon proficiency.</p>' }
] });
addFeat({ name: 'Sketch Artist', level: 4, traits: ['archetype', 'skill'], prerequisites: ['Bounty Hunter Dedication', 'trained in Society'] });
addFeat({ name: 'Soporific Specialist', level: 4, traits: ['archetype'], prerequisites: ['Bounty Hunter Dedication'] });
addFeat({ name: 'Lethal Ultimatum', level: 6, traits: ['archetype', 'auditory', 'incapacitation', 'linguistic'], prerequisites: ['Bounty Hunter Dedication'], actionType: 'action', actionCount: 1, range: '30 feet', targets: 'your hunted prey', frequency: 'once per hour', effectLinks: `Drag to enemy: @UUID[${effectUuid('Effect: Lethal Ultimatum')}]{Effect: Lethal Ultimatum}` });
addFeat({ name: 'Paid Posse', level: 6, traits: ['archetype'], prerequisites: ['Bounty Hunter Dedication', 'Posse'], rules: [
  { key: 'Note', selector: 'initiative', text: '<p class="compact-text"><strong>Paid Posse</strong> You gain the Hireling Manager general feat. Your Posse hirelings can also use their trained skills to Aid you.</p>' }
] });
addFeat({ name: 'Soporific Expert', level: 8, traits: ['archetype'], prerequisites: ['Bounty Hunter Dedication', 'Soporific Specialist'], rules: [
  { key: 'Note', selector: 'strike-attack-roll', text: '<p class="compact-text"><strong>Soporific Expert</strong> On a critical hit, targets take a -2 circumstance penalty to saves against your soporifics. Treat soporific level as your level for incapacitation/counteracting.</p>', outcome: ['criticalSuccess'] }
] });
addFeat({ name: 'Tactical Posse', level: 8, traits: ['archetype'], prerequisites: ['Bounty Hunter Dedication', 'Posse'], rules: [
  { key: 'Note', selector: 'initiative', text: '<p class="compact-text"><strong>Tactical Posse</strong> When you and your prey both roll initiative and you have a Posse, the GM reveals one: highest weakness, lowest save modifier, one immunity, or highest resistance.</p>' }
] });
addFeat({ name: 'Dog Pile', level: 10, traits: ['archetype'], prerequisites: ['Bounty Hunter Dedication'], effectLinks: `Drag to ally: @UUID[${effectUuid('Effect: Dog Pile')}]{Effect: Dog Pile}`, rules: [
  { key: 'RollOption', domain: 'athletics', option: 'dog-pile-flanking-prey', toggleable: true, label: 'Flanking hunted prey with ally' },
  { key: 'FlatModifier', selector: 'athletics', type: 'circumstance', value: 2, label: 'Dog Pile', predicate: ['dog-pile-flanking-prey', { or: ['action:grapple', 'action:shove', 'action:trip'] }] }
] });
addFeat({ name: 'Projected Ultimatum', level: 10, traits: ['archetype'], prerequisites: ['Bounty Hunter Dedication', 'Lethal Ultimatum'] });
addFeat({ name: 'Hog Tie', level: 12, traits: ['archetype', 'manipulate'], prerequisites: ['Bounty Hunter Dedication'], actionType: 'action', actionCount: 1, requirements: 'Your most recent action was a successful Grapple or Trip check, or you successfully used Opportunistic Grapple since your last turn. You must be wearing or carrying a length of rope.', targets: 'The creature you successfully Grappled or Tripped' });
addFeat({ name: 'Net Gun Specialist', level: 12, rarity: 'uncommon', traits: ['archetype'], prerequisites: ['Bounty Hunter Dedication'], rules: [
  { key: 'Note', selector: 'strike-attack-roll', text: '<p class="compact-text"><strong>Net Gun Specialist</strong> Net gun reload reduced to 1. On crit Strike: target is grabbed. On crit Athletics check to Grapple: also deal nonlethal Strike damage.</p>', outcome: ['criticalSuccess'] }
] });
addFeat({ name: 'Persistent Soporifics', level: 14, traits: ['archetype'], prerequisites: ['Bounty Hunter Dedication', 'Soporific Expert'], rules: [
  { key: 'Note', selector: 'strike-attack-roll', text: '<p class="compact-text"><strong>Persistent Soporifics</strong> When a creature saves against one of your soporifics, it must attempt the save again at the start of its next turn.</p>', outcome: ['criticalSuccess', 'success'] }
] });
addFeat({ name: 'Spontaneous Posse', level: 14, traits: ['archetype'], prerequisites: ['Bounty Hunter Dedication', 'Posse'], rules: [
  { key: 'Note', selector: 'initiative', text: '<p class="compact-text"><strong>Spontaneous Posse</strong> When you roll initiative, you may Hunt Prey as a free action and immediately designate a Posse (no 1-minute guidance needed).</p>' }
] });
addFeat({ name: 'Pressure-Point Strike', level: 16, traits: ['archetype', 'incapacitation'], prerequisites: ['Bounty Hunter Dedication'], actionType: 'action', actionCount: 2 });
addFeat({ name: 'Eliminate', level: 18, traits: ['archetype', 'attack', 'flourish', 'incapacitation'], prerequisites: ['Bounty Hunter Dedication'], actionType: 'action', actionCount: 1, requirements: 'You have an adjacent creature grabbed or restrained' });
addFeat({ name: 'Helpful Posse', level: 20, traits: ['archetype'], prerequisites: ['Bounty Hunter Dedication', 'Posse'], rules: [
  { key: 'RollOption', domain: 'attack-roll', option: 'helpful-posse-active', toggleable: true, label: 'Posse is active' },
  { key: 'FlatModifier', selector: 'attack-roll', type: 'circumstance', value: 1, label: 'Helpful Posse', predicate: ['helpful-posse-active'] }
] });
addFeat({ name: 'Implacable Captor', level: 20, traits: ['archetype'], prerequisites: ['Bounty Hunter Dedication'], rules: [
  { key: 'Note', selector: 'athletics', text: '<p class="compact-text"><strong>Implacable Captor</strong> You are permanently quickened. The extra action can only be used to Grapple, Trip, or Hog Tie.</p>', predicate: [{ or: ['action:grapple', 'action:trip'] }] }
] });
addFeat({ name: 'Legendary Bounty Hunter', level: 20, traits: ['archetype', 'mental'], prerequisites: ['Bounty Hunter Dedication'], rules: [
  { key: 'Note', selector: 'initiative', text: '<p class="compact-text"><strong>Legendary Bounty Hunter</strong> When you roll initiative, each enemy that can see you must attempt a Will save vs your class/spell DC. Success: frightened 1. Failure: frightened 2. Critical Failure: frightened 3 and fleeing 1 round.</p>' }
] });

// ===== FOLKLORIST =====
addFeat({ name: 'Exchange Tales', level: 4, traits: ['archetype', 'skill'], prerequisites: ['Folklorist Dedication', 'trained in Society'] });
addFeat({ name: 'Recall Tale', level: 4, traits: ['archetype', 'auditory', 'concentrate', 'linguistic'], prerequisites: ['Folklorist Dedication'], actionType: 'action', actionCount: 1 });
addFeat({ name: 'Confounding Illusions', level: 6, traits: ['archetype', 'auditory', 'illusion', 'linguistic'], prerequisites: ['Folklorist Dedication'], actionType: 'action', actionCount: 2, range: '60 feet', targets: 'the hero of your Spin Tale', frequency: 'once per day', requirements: 'Spin Tale is active', spellLinks: `${sysSpell('j8vIoIEWElvpwkcI','Mirror Image')} (targets tale hero, not self)` });
addFeat({ name: 'Establish Foil', level: 6, traits: ['archetype', 'auditory', 'linguistic'], prerequisites: ['Folklorist Dedication'], actionType: 'action', actionCount: 1, requirements: 'Spin Tale is active', effectLinks: `Enemy: @UUID[${effectUuid('Effect: Establish Foil')}]{Establish Foil} | Ally: @UUID[${effectUuid('Effect: Establish Foil (Ally)')}]{Establish Foil (Ally)}` });
addFeat({ name: 'Darken Tone', level: 8, traits: ['archetype', 'auditory', 'linguistic'], prerequisites: ['Folklorist Dedication'], actionType: 'action', actionCount: 1, requirements: 'Spin Tale is active', effectLinks: `Drag to hero: @UUID[${effectUuid('Effect: Darken Tone')}]{Effect: Darken Tone}` });
addFeat({ name: 'Lighten Tone', level: 8, traits: ['archetype', 'auditory', 'linguistic'], prerequisites: ['Folklorist Dedication'], actionType: 'action', actionCount: 1, requirements: 'Spin Tale is active', effectLinks: `Drag to hero: @UUID[${effectUuid('Effect: Lighten Tone')}]{Effect: Lighten Tone}` });
addFeat({ name: 'Theme of Loss', level: 8, traits: ['archetype', 'auditory', 'linguistic'], prerequisites: ['Folklorist Dedication'], actionType: 'action', actionCount: 2, frequency: 'once per day', spellLinks: `${sysSpell('szIyEsvihc5e1w8n','Soothe')} (1/day, heightened to half your level)` });
addFeat({ name: 'Second Act', level: 10, traits: ['archetype', 'auditory', 'linguistic'], prerequisites: ['Folklorist Dedication'], actionType: 'action', actionCount: 2, requirements: "Spin Tale is active and you haven't used Second Act this encounter", effectLinks: `@UUID[${effectUuid('Effect: Second Act (Off-Guard)')}]{Off-Guard 1 rnd} | @UUID[${effectUuid('Effect: Second Act (Off-Guard, 1 min)')}]{Off-Guard 1 min} | @UUID[${effectUuid('Effect: Second Act (Off-Guard + Weakness)')}]{Off-Guard + Weakness}` });
addFeat({ name: 'Cast of Villains', level: 12, traits: ['archetype'], prerequisites: ['Folklorist Dedication'], effectLinks: `Drag to foil: @UUID[${effectUuid('Effect: Cast of Villains Foil')}]{Effect: Cast of Villains Foil}` });
addFeat({ name: 'Third Act', level: 14, traits: ['archetype', 'auditory', 'linguistic'], prerequisites: ['Folklorist Dedication', 'Second Act'], actionType: 'action', actionCount: 2, requirements: 'Spin Tale is active and you have used Second Act in the current story', frequency: 'once per hour', effectLinks: `@UUID[${effectUuid('Effect: Third Act (Off-Guard)')}]{Off-Guard 1 rnd} | @UUID[${effectUuid('Effect: Third Act (Enhanced Tale)')}]{Enhanced Tale} | @UUID[${effectUuid('Effect: Third Act (Off-Guard + Weakness)')}]{Off-Guard + Weakness}` });
addFeat({ name: 'Denouement', level: 16, traits: ['archetype', 'auditory', 'exploration', 'linguistic'], prerequisites: ['Folklorist Dedication'], frequency: 'once per 10 minutes' });
addFeat({ name: 'Climax', level: 18, traits: ['archetype', 'auditory', 'linguistic'], prerequisites: ['Folklorist Dedication'], actionType: 'action', actionCount: 2, requirements: 'Spin Tale is active', effectLinks: `Drag to hero: @UUID[${effectUuid('Effect: Climax')}]{Effect: Climax}` });

// ===== GAME HUNTER =====
addFeat({ name: 'Instant Tracker', level: 4, traits: ['archetype', 'skill'], prerequisites: ['Game Hunter Dedication', 'expert in Survival'], rules: [
  { key: 'Note', selector: ['perception', 'survival'], text: `<p class="compact-text"><strong>Instant Tracker</strong> You can use Survival instead of Perception to @UUID[${macroUuid('Instant Tracker - Seek')}]{Seek} your hunted prey.</p>`, predicate: ['action:seek'] }
] });
addFeat({ name: 'Sense Game', level: 4, rarity: 'uncommon', traits: ['archetype', 'exploration'], prerequisites: ['Game Hunter Dedication'] });
addFeat({ name: 'Trophy Collector', level: 4, traits: ['archetype', 'exploration'], prerequisites: ['Game Hunter Dedication'], rules: [
  { key: 'RollOption', domain: 'intimidation', option: 'trophy-collector-matching-type', toggleable: true, label: 'Target matches collected trophy type' },
  { key: 'FlatModifier', selector: 'intimidation', type: 'circumstance', value: 1, label: 'Trophy Collector', predicate: ['trophy-collector-matching-type'] },
  { key: 'Note', selector: 'intimidation', text: '<p class="compact-text"><strong>Trophy Collector</strong> This bonus increases to +2 if you are a master of Survival. You also gain this bonus to Recall Knowledge about creatures of the same type.</p>', predicate: ['trophy-collector-matching-type'] }
] });
addFeat({ name: 'Improved Slowing Strikes', level: 6, traits: ['archetype'], prerequisites: ['Game Hunter Dedication'], rules: [
  { key: 'Note', selector: 'strike-attack-roll', text: '<p class="compact-text"><strong>Improved Slowing Strikes</strong> When applying Speed reduction to off-guard hunted prey, the target also gains drained 1. The target no longer becomes immune to your Speed reduction.</p>' }
] });
addFeat({ name: "It's All Game", level: 6, traits: ['archetype'], prerequisites: ['Game Hunter Dedication'], rules: [
  { key: 'Note', selector: 'strike-attack-roll', text: '<p class="compact-text"><strong>It\'s All Game</strong> Your Speed reduction DC gains a +1 circumstance bonus. You may now Hunt Prey against any creature type.</p>', predicate: ['target:effect:hunted-prey'] }
] });
addFeat({ name: 'Lie in Wait', level: 8, traits: ['archetype'], prerequisites: ['Game Hunter Dedication'], rules: [
  { key: 'Note', selector: 'initiative', text: '<p class="compact-text"><strong>Lie in Wait</strong> If you Delay on your first turn, you may Hunt Prey as a free action. First Strike deals +1d6 precision (+2d6 at 16th; +1d10/+2d10 if undetected).</p>' }
] });
addFeat({ name: "Hunter's Verve", level: 10, traits: ['archetype'], prerequisites: ['Game Hunter Dedication'], rules: [
  { key: 'Note', selector: 'ac', text: '<p class="compact-text"><strong>Hunter\'s Verve</strong> When your hunted prey critically hits you, attempt a DC 17 flat check to reduce it to a normal hit. Or auto-reduce once per day.</p>' }
] });
addFeat({ name: 'Precise Trapper', level: 10, traits: ['archetype'], prerequisites: ['Game Hunter Dedication', 'Big Game Trapper'] });
addFeat({ name: 'Brandish Trophy', level: 12, traits: ['archetype', 'manipulate'], prerequisites: ['Game Hunter Dedication', 'Trophy Collector'], actionType: 'free', frequency: 'once per minute', targets: "a creature whose type matches a trophy you've collected" });
addFeat({ name: "Hunter's Certainty", level: 12, traits: ['archetype'], prerequisites: ['Game Hunter Dedication'], rules: [
  { key: 'Note', selector: 'initiative', text: '<p class="compact-text"><strong>Hunter\'s Certainty</strong> Once per day, if you\'ve already Hunted Prey on a creature in this encounter, you may adjust your initiative to be 1 higher than your prey\'s.</p>' }
] });
addFeat({ name: 'Lacerating Strikes', level: 14, traits: ['archetype'], prerequisites: ['Game Hunter Dedication'], actionType: 'action', actionCount: 2, requirements: 'You are wielding a piercing or slashing melee weapon', targets: 'your hunted prey' });
addFeat({ name: 'Slowing Shots', level: 14, traits: ['archetype'], prerequisites: ['Game Hunter Dedication'], actionType: 'action', actionCount: 2, requirements: 'You are wielding a ranged weapon', targets: 'your hunted prey' });
addFeat({ name: 'Preternatural Hunter', level: 16, rarity: 'uncommon', traits: ['archetype', 'exploration'], prerequisites: ['Game Hunter Dedication', "It's All Game"] });
addFeat({ name: 'Unshakeable Hunter', level: 18, traits: ['archetype'], prerequisites: ['Game Hunter Dedication'], rules: [
  { key: 'Note', selector: 'athletics', text: '<p class="compact-text"><strong>Unshakeable Hunter</strong> When hunting prey, all your Speeds equal the highest Speed between you and your prey.</p>' }
] });

// ===== HERBALIST =====
addFeat({ name: 'Battle Herbs', level: 4, traits: ['archetype', 'healing', 'manipulate'], prerequisites: ['Herbalist Dedication'], actionType: 'action', actionCount: 1 });
addFeat({ name: 'Constant Gatherer', level: 4, traits: ['archetype', 'exploration'], prerequisites: ['Herbalist Dedication'] });
addFeat({ name: 'Evening Brew', level: 6, traits: ['archetype', 'exploration'], prerequisites: ['Herbalist Dedication'], effectLinks: `Drag to ally: @UUID[${effectUuid('Effect: Evening Brew')}]{Effect: Evening Brew}` });
addFeat({ name: 'Energizing Chew', level: 8, traits: ['archetype', 'manipulate'], prerequisites: ['Herbalist Dedication'], actionType: 'action', actionCount: 1, targets: 'an adjacent ally', effectLinks: `Drag to target: @UUID[${effectUuid('Effect: Energizing Chew')}]{Effect: Energizing Chew}`, rules: [
  { key: 'RollOption', domain: 'all', option: 'energizing-chew-active', toggleable: true, label: 'Energizing Chew active' },
  { key: 'FlatModifier', selector: 'acrobatics', type: 'status', value: 1, label: 'Energizing Chew', predicate: ['energizing-chew-active'] },
  { key: 'FlatModifier', selector: 'athletics', type: 'status', value: 1, label: 'Energizing Chew', predicate: ['energizing-chew-active'] },
  { key: 'FlatModifier', selector: 'perception', type: 'status', value: 1, label: 'Energizing Chew', predicate: ['energizing-chew-active'] }
] });
addFeat({ name: 'Quick Poultice', level: 8, traits: ['archetype', 'flourish'], prerequisites: ['Herbalist Dedication'], actionType: 'free' });
addFeat({ name: 'Dietary Cleanse', level: 10, traits: ['archetype', 'downtime'], prerequisites: ['Herbalist Dedication'], effectLinks: `Drag to ally: @UUID[${effectUuid('Effect: Dietary Cleanse')}]{Effect: Dietary Cleanse}`, rules: [
  { key: 'RollOption', domain: 'saving-throw', option: 'dietary-cleanse-active', toggleable: true, label: 'Dietary Cleanse active (this week)' },
  { key: 'FlatModifier', selector: 'saving-throw:fortitude', type: 'circumstance', value: 2, label: 'Dietary Cleanse', predicate: ['dietary-cleanse-active'] }
] });
addFeat({ name: 'Long-Term Care', level: 10, traits: ['archetype', 'skill'], prerequisites: ['Herbalist Dedication', 'master in Nature'], rules: [
  { key: 'Note', selector: 'nature', text: '<p class="compact-text"><strong>Long-Term Care</strong> You may continue retrying Treat Disease/Treat Poison. On success, the target\'s next critical failure on their save becomes a failure instead.</p>', predicate: [{ or: ['action:treat-disease', 'action:treat-poison'] }] }
] });
addFeat({ name: 'Vapor Preparation', level: 12, traits: ['archetype'], prerequisites: ['Herbalist Dedication'] });
addFeat({ name: 'Anesthetic Tincture', level: 14, traits: ['archetype'], prerequisites: ['Herbalist Dedication'], effectLinks: `Drag to target: @UUID[${effectUuid('Effect: Anesthetic Tincture')}]{Effect: Anesthetic Tincture}` });
addFeat({ name: 'Smelling Vapors', level: 16, traits: ['archetype'], prerequisites: ['Herbalist Dedication', 'Vapor Preparation'] });
addFeat({ name: 'Merciful Killer', level: 18, traits: ['archetype'], prerequisites: ['Herbalist Dedication'] });
addFeat({ name: 'True Panacea', level: 20, traits: ['archetype'], prerequisites: ['Herbalist Dedication'] });

// ===== HORIZON WALKER =====
addFeat({ name: 'Natural Snares', level: 4, traits: ['archetype'], prerequisites: ['Horizon Walker Dedication', 'Snare Crafting'] });
addFeat({ name: 'Terrain Guidance', level: 4, traits: ['archetype'], prerequisites: ['Horizon Walker Dedication'], actionType: 'reaction', trigger: 'An ally within 30 feet of you is about to attempt a skill check to move through terrain or a saving throw against a hazard in your favored terrain.', effectLinks: `Drag to ally: @UUID[${effectUuid('Effect: Terrain Guidance')}]{Effect: Terrain Guidance}` });
addFeat({ name: 'Versatile Horizons', level: 4, traits: ['archetype', 'skill'], prerequisites: ['Horizon Walker Dedication', 'expert in Survival'], special: 'You may select this feat more than once. Each time you must select a terrain you have not yet chosen.', rules: [
  { key: 'ChoiceSet', choices: [
    { label: 'Aquatic', value: 'aquatic' },
    { label: 'Arctic', value: 'arctic' },
    { label: 'Desert', value: 'desert' },
    { label: 'Forest', value: 'forest' },
    { label: 'Mountain', value: 'mountain' },
    { label: 'Plains', value: 'plains' },
    { label: 'Sky', value: 'sky' },
    { label: 'Swamp', value: 'swamp' },
    { label: 'Underground', value: 'underground' }
  ], flag: 'versatileHorizons', prompt: 'Choose an additional favored terrain' },
  { key: 'RollOption', domain: 'all', option: 'favored-terrain:{item|flags.pf2e.rulesSelections.versatileHorizons}' }
] });
addFeat({ name: 'Known Predators', level: 6, traits: ['archetype'], prerequisites: ['Horizon Walker Dedication'], rules: [
  { key: 'Note', selector: ['survival', 'perception'], text: `<p class="compact-text"><strong>Known Predators</strong> In your favored terrain, you may use Survival instead of the normal skill to @UUID[${macroUuid('Known Predators - Recall Knowledge')}]{Recall Knowledge} to identify a creature.</p>` }
] });
addFeat({ name: 'Live off the Land', level: 6, traits: ['archetype', 'skill'], prerequisites: ['Horizon Walker Dedication', 'expert in Survival'], rules: [
  { key: 'RollOption', domain: 'survival', option: 'live-off-the-land-favored-terrain', toggleable: true, label: 'In favored terrain' },
  { key: 'AdjustDegreeOfSuccess', selector: 'survival', adjustment: { criticalFailure: 'one-degree-better', failure: 'one-degree-better', success: 'one-degree-better' }, predicate: ['live-off-the-land-favored-terrain', 'action:subsist'] }
] });
addFeat({ name: 'Terrain Specialist', level: 6, traits: ['archetype'], prerequisites: ['Horizon Walker Dedication'], special: 'You can take this feat more than once. Each time you must choose a different terrain that is already a favored terrain for you.', rules: [
  { key: 'ChoiceSet', choices: [
    { label: 'Aquatic', value: 'aquatic' },
    { label: 'Arctic', value: 'arctic' },
    { label: 'Desert', value: 'desert' },
    { label: 'Forest', value: 'forest' },
    { label: 'Mountain', value: 'mountain' },
    { label: 'Underground', value: 'underground' },
    { label: 'Plains', value: 'plains' },
    { label: 'Sky', value: 'sky' },
    { label: 'Swamp', value: 'swamp' }
  ], flag: 'terrainSpecialist', prompt: 'Choose your specialized terrain' },
  { key: 'RollOption', domain: 'all', option: 'terrain-specialist:{item|flags.pf2e.rulesSelections.terrainSpecialist}' },
  // Aquatic: +2 status Athletics to Swim
  { key: 'FlatModifier', selector: 'athletics', type: 'status', value: 2, label: 'Terrain Specialist (Aquatic)', predicate: ['terrain-specialist:aquatic', 'action:swim'] },
  // Arctic: cold resistance = level
  { key: 'Resistance', type: 'cold', value: '@actor.level', predicate: ['terrain-specialist:arctic'] },
  // Desert: immunity to fatigued
  { key: 'Immunity', type: 'fatigued', predicate: ['terrain-specialist:desert'] },
  // Forest: +1 status Stealth
  { key: 'FlatModifier', selector: 'stealth', type: 'status', value: 1, label: 'Terrain Specialist (Forest)', predicate: ['terrain-specialist:forest'] },
  // Mountain: +2 status Athletics to Climb
  { key: 'FlatModifier', selector: 'athletics', type: 'status', value: 2, label: 'Terrain Specialist (Mountain)', predicate: ['terrain-specialist:mountain', 'action:climb'] },
  // Underground: Note (low-light/darkvision + flat check reduction)
  { key: 'Note', selector: 'perception', text: '<p class="compact-text"><strong>Terrain Specialist (Underground)</strong> You gain low-light vision, or darkvision if you already have low-light vision. Reduce the flat check DC to target hidden or concealed creatures by 1.</p>', predicate: ['terrain-specialist:underground'] },
  // Plains: Note (armor Speed penalty reduction)
  { key: 'Note', selector: 'speed', text: '<p class="compact-text"><strong>Terrain Specialist (Plains)</strong> Reduce your Speed penalty from armor by 5 feet.</p>', predicate: ['terrain-specialist:plains'] },
  // Sky: electricity resistance = level
  { key: 'Resistance', type: 'electricity', value: '@actor.level', predicate: ['terrain-specialist:sky'] },
  // Swamp: poison resistance = level
  { key: 'Resistance', type: 'poison', value: '@actor.level', predicate: ['terrain-specialist:swamp'] }
] });
addFeat({ name: 'Wide Snares', level: 8, traits: ['archetype'], prerequisites: ['Horizon Walker Dedication', 'Natural Snares'] });
addFeat({ name: 'Extraplanar Walker', level: 10, rarity: 'uncommon', traits: ['archetype'], prerequisites: ['Horizon Walker Dedication'], special: 'This feat requires having spent 30 days on the chosen plane. At GM discretion, 30 days of downtime and 1,000 gp may substitute.', rules: [
  { key: 'ChoiceSet', choices: [
    { label: 'Astral Plane', value: 'astral' },
    { label: 'Ethereal Plane', value: 'ethereal' },
    { label: 'Plane of Air', value: 'air' },
    { label: 'Plane of Earth', value: 'earth' },
    { label: 'Plane of Fire', value: 'fire' },
    { label: 'Plane of Water', value: 'water' },
    { label: 'Netherworld', value: 'netherworld' }
  ], flag: 'extraplanarWalker', prompt: 'Choose your plane' },
  { key: 'RollOption', domain: 'all', option: 'extraplanar-walker:{item|flags.pf2e.rulesSelections.extraplanarWalker}' },
  // Plane of Earth: imprecise tremorsense 30 feet
  { key: 'Sense', selector: 'tremorsense', acuity: 'imprecise', value: 30, predicate: ['extraplanar-walker:earth'] },
  // Plane of Fire: fire resistance = level
  { key: 'Resistance', type: 'fire', value: '@actor.level', predicate: ['extraplanar-walker:fire'] }
] });
addFeat({ name: 'Urban Walker', level: 10, rarity: 'uncommon', traits: ['archetype'], prerequisites: ['Horizon Walker Dedication'], rules: [
  { key: 'Note', selector: ['survival', 'diplomacy'], text: `<p class="compact-text"><strong>Urban Walker</strong> In urban areas with Wild Stride, use Survival instead of Diplomacy to @UUID[${macroUuid('Urban Walker - Gather Information')}]{Gather Information} or @UUID[${macroUuid('Urban Walker - Make an Impression')}]{Make an Impression}.</p>`, predicate: [{ or: ['action:gather-information', 'action:make-an-impression'] }] }
] });
addFeat({ name: 'Planar Walker', level: 12, rarity: 'uncommon', traits: ['archetype'], prerequisites: ['Horizon Walker Dedication'], special: 'You may choose this feat more than once, selecting a different outer plane each time. This feat requires having spent 30 days on the chosen plane.', rules: [
  { key: 'ChoiceSet', choices: [
    { label: 'Abaddon (void)', value: 'void' },
    { label: 'Abyss (poison)', value: 'poison' },
    { label: 'Axis (force)', value: 'force' },
    { label: 'Elysium (sonic)', value: 'sonic' },
    { label: 'Heaven (spirit)', value: 'spirit' },
    { label: 'Hell (fire)', value: 'fire' },
    { label: 'Nirvana (vitality)', value: 'vitality' },
    { label: 'The Maelstrom (mental)', value: 'mental' }
  ], flag: 'planarWalker', prompt: 'Choose your outer plane' },
  { key: 'RollOption', domain: 'all', option: 'planar-walker:{item|flags.pf2e.rulesSelections.planarWalker}' },
  // Extra 1d6 damage of chosen type on Strikes
  { key: 'DamageDice', selector: 'strike-damage', diceNumber: 1, dieSize: 'd6', damageType: 'void', label: 'Planar Walker (Abaddon)', predicate: ['planar-walker:void'] },
  { key: 'DamageDice', selector: 'strike-damage', diceNumber: 1, dieSize: 'd6', damageType: 'poison', label: 'Planar Walker (Abyss)', predicate: ['planar-walker:poison'] },
  { key: 'DamageDice', selector: 'strike-damage', diceNumber: 1, dieSize: 'd6', damageType: 'force', label: 'Planar Walker (Axis)', predicate: ['planar-walker:force'] },
  { key: 'DamageDice', selector: 'strike-damage', diceNumber: 1, dieSize: 'd6', damageType: 'sonic', label: 'Planar Walker (Elysium)', predicate: ['planar-walker:sonic'] },
  { key: 'DamageDice', selector: 'strike-damage', diceNumber: 1, dieSize: 'd6', damageType: 'spirit', label: 'Planar Walker (Heaven)', predicate: ['planar-walker:spirit'] },
  { key: 'DamageDice', selector: 'strike-damage', diceNumber: 1, dieSize: 'd6', damageType: 'fire', label: 'Planar Walker (Hell)', predicate: ['planar-walker:fire'] },
  { key: 'DamageDice', selector: 'strike-damage', diceNumber: 1, dieSize: 'd6', damageType: 'vitality', label: 'Planar Walker (Nirvana)', predicate: ['planar-walker:vitality'] },
  { key: 'DamageDice', selector: 'strike-damage', diceNumber: 1, dieSize: 'd6', damageType: 'mental', label: 'Planar Walker (Maelstrom)', predicate: ['planar-walker:mental'] }
] });
addFeat({ name: 'Brutal Snares', level: 12, traits: ['archetype'], prerequisites: ['Horizon Walker Dedication', 'Natural Snares'] });
addFeat({ name: 'Greater Magical Adaptation', level: 14, traits: ['archetype'], prerequisites: ['Horizon Walker Dedication', 'Magical Adaptation'], spellLinks: `${sysSpell('6AqH5SGchbdhOJxA','Flammable Fumes')} (1/day) | ${sysSpell('IFuEzfmmWyNwVbhY','Safe Passage')} (1/day) | ${sysSpell('piMJO6aYeDJbrhEo','Solid Fog')} (1/day)` });
addFeat({ name: 'Terrain Dominance', level: 14, traits: ['archetype'], prerequisites: ['Horizon Walker Dedication', 'Terrain Specialist'], special: 'You can take this feat more than once. Each time you must choose a different terrain for which you have Terrain Specialist.', rules: [
  { key: 'ChoiceSet', choices: [
    { label: 'Aquatic', value: 'aquatic' },
    { label: 'Arctic', value: 'arctic' },
    { label: 'Desert', value: 'desert' },
    { label: 'Forest', value: 'forest' },
    { label: 'Mountain', value: 'mountain' },
    { label: 'Underground', value: 'underground' },
    { label: 'Plains', value: 'plains' },
    { label: 'Sky', value: 'sky' },
    { label: 'Swamp', value: 'swamp' }
  ], flag: 'terrainDominance', prompt: 'Choose your dominant terrain' },
  { key: 'RollOption', domain: 'all', option: 'terrain-dominance:{item|flags.pf2e.rulesSelections.terrainDominance}' },
  // Desert: immunity to dazzled
  { key: 'Immunity', type: 'dazzled', predicate: ['terrain-dominance:desert'] },
  // Plane of Earth: burrow Speed equal to land Speed
  { key: 'BaseSpeed', selector: 'burrow', value: '@actor.attributes.speed.value', predicate: ['terrain-dominance:underground'] },
  // Underground: greater darkvision
  { key: 'Sense', selector: 'greaterDarkvision', predicate: ['terrain-dominance:underground'] },
  // Swamp: improve saves vs poison by one step
  { key: 'AdjustDegreeOfSuccess', selector: 'saving-throw', adjustment: { criticalFailure: 'one-degree-better', failure: 'one-degree-better', success: 'one-degree-better' }, predicate: ['terrain-dominance:swamp', 'trait:poison'] },
  // Arctic: reduce slowed by 1
  { key: 'Note', selector: 'saving-throw', text: '<p class=\"compact-text\"><strong>Terrain Dominance (Arctic)</strong> When you gain the slowed condition, reduce its value by 1.</p>', predicate: ['terrain-dominance:arctic'] },
  // Aquatic: ignore difficult terrain while swimming
  { key: 'Note', selector: 'athletics', text: '<p class=\"compact-text\"><strong>Terrain Dominance (Aquatic)</strong> You ignore difficult terrain while swimming, including when moving up or down.</p>', predicate: ['terrain-dominance:aquatic', 'action:swim'] },
  // Forest: Hide/Sneak anywhere at -2
  { key: 'Note', selector: 'stealth', text: '<p class=\"compact-text\"><strong>Terrain Dominance (Forest)</strong> You can attempt to Hide or Sneak anywhere without cover or concealment, at a -2 circumstance penalty to Stealth.</p>', predicate: ['terrain-dominance:forest'] },
  // Mountain: gecko grip + double climb Speed
  { key: 'Note', selector: 'athletics', text: '<p class=\"compact-text\"><strong>Terrain Dominance (Mountain)</strong> You may gain or Dismiss gecko grip at will as a free action. Your climb Speed while under this effect equals double your Speed.</p>', predicate: ['terrain-dominance:mountain', 'action:climb'] },
  // Plains: ignore all Speed penalties
  { key: 'Note', selector: 'speed', text: '<p class=\"compact-text\"><strong>Terrain Dominance (Plains)</strong> You ignore all Speed penalties from armor, encumbrance, and non-magical effects.</p>', predicate: ['terrain-dominance:plains'] },
  // Sky: ignore difficult terrain while flying
  { key: 'Note', selector: 'athletics', text: '<p class=\"compact-text\"><strong>Terrain Dominance (Sky)</strong> You ignore difficult terrain while Flying, including when moving upward.</p>', predicate: ['terrain-dominance:sky'] }
] });
addFeat({ name: 'Major Magical Adaptation', level: 18, traits: ['archetype'], prerequisites: ['Horizon Walker Dedication', 'Greater Magical Adaptation'], spellLinks: `${sysSpell('YtBZq49N4Um1cwm7',"Nature's Reprisal")} (1/day, 9th rank)` });

// ===== SCOUT =====
addFeat({ name: 'Demoralizing Volley', level: 4, traits: ['archetype'], prerequisites: ['Scout Dedication'], actionType: 'action', actionCount: 2, requirements: 'You are wielding a ranged weapon with reload 1 or less, and you have not made any Strikes yet this encounter.' });
addFeat({ name: 'Hidden Scout', level: 4, traits: ['archetype', 'exploration'], prerequisites: ['Scout Dedication', 'trained in Stealth'], rules: [
  { key: 'Note', selector: 'stealth', text: '<p class="compact-text"><strong>Hidden Scout</strong> You gain the Foil Senses skill feat even if you don\'t meet the prerequisites.</p>' }
] });
addFeat({ name: 'Spotted!', level: 4, traits: ['archetype', 'skill'], prerequisites: ['Scout Dedication', 'expert in Stealth'], rules: [
  { key: 'RollOption', domain: 'initiative', option: 'spotted-failed-stealth', toggleable: true, label: 'Rolling initiative because Stealth failed' },
  { key: 'FlatModifier', selector: 'initiative', type: 'status', value: 2, label: 'Spotted!', predicate: ['spotted-failed-stealth'] }
] });
addFeat({ name: 'Beleaguering Attack', level: 6, traits: ['archetype', 'flourish'], prerequisites: ['Scout Dedication'], actionType: 'action', actionCount: 1, requirements: 'You are hidden from or undetected by the target' });
addFeat({ name: 'Detailed Report', level: 6, traits: ['archetype', 'exploration'], prerequisites: ['Scout Dedication'], effectLinks: `@UUID[${effectUuid('Effect: Detailed Report (+1)')}]{+1 (Expert)} | @UUID[${effectUuid('Effect: Detailed Report (+2)')}]{+2 (Master)} | @UUID[${effectUuid('Effect: Detailed Report (+3)')}]{+3 (Legendary)}`, rules: [
  { key: 'Note', selector: 'perception', text: '<p class="compact-text"><strong>Detailed Report</strong> Retain a creature\'s details for 10 min. Allies who hear your report get +1 (expert), +2 (master), or +3 (legendary Perception) circumstance bonus to Recall Knowledge about it.</p>' }
] });
addFeat({ name: 'Scout Language', level: 6, traits: ['archetype', 'skill'], prerequisites: ['Scout Dedication', 'expert in Survival'] });
addFeat({ name: 'Marking Shot', level: 8, traits: ['archetype', 'fighter', 'flourish'], prerequisites: ['Scout Dedication'], actionType: 'action', actionCount: 1, requirements: 'You are wielding a ranged weapon', effectLinks: `Drag to enemy: @UUID[${effectUuid('Effect: Marking Shot')}]{Marking Shot} | @UUID[${effectUuid('Effect: Marking Shot (Critical)')}]{Marking Shot (Critical)}` });
addFeat({ name: "Scout's Ambush", level: 8, traits: ['archetype'], prerequisites: ['Scout Dedication', 'master in Stealth'], rules: [
  { key: 'Note', selector: 'initiative', text: '<p class="compact-text"><strong>Scout\'s Ambush</strong> When you used the Scout exploration activity and gain a circumstance bonus to initiative, you may roll Stealth instead of Perception. If your initiative beats all enemies, you may immediately use a single action.</p>' }
] });
addFeat({ name: 'Exhaustive Report', level: 10, traits: ['archetype'], prerequisites: ['Scout Dedication', 'Detailed Report'], rules: [
  { key: 'Note', selector: 'perception', text: '<p class="compact-text"><strong>Exhaustive Report</strong> You can retain details about any number of creatures (not just one). Relay details at any time before next daily preparations. Allies gain additional context on successful Recall Knowledge using your report.</p>' }
] });
addFeat({ name: 'Quick Scout', level: 10, traits: ['archetype'], prerequisites: ['Scout Dedication'] });
addFeat({ name: 'Harrying Charge', level: 14, traits: ['archetype'], prerequisites: ['Scout Dedication', "Scout's Charge"] });
addFeat({ name: 'Shattering Volley', level: 14, traits: ['archetype'], prerequisites: ['Scout Dedication', 'Demoralizing Volley'], rules: [
  { key: 'Note', selector: 'strike-attack-roll', text: '<p class="compact-text"><strong>Shattering Volley</strong> When both Demoralizing Volley Strikes hit, increase frightened by 2 (not 1), and the target must attempt a Will save or flee for 1 round.</p>' }
] });
addFeat({ name: "Legendary Scout's Ambush", level: 16, traits: ['archetype'], prerequisites: ['Scout Dedication', "Scout's Ambush", 'legendary in Stealth'], rules: [
  { key: 'Note', selector: 'initiative', text: '<p class="compact-text"><strong>Legendary Scout\'s Ambush</strong> If your initiative beats all enemies: 2 free actions (not 1), plus designate an ally within 30 ft. who also gets 1 action.</p>' }
] });
addFeat({ name: "Scout's Senses", level: 18, traits: ['archetype'], prerequisites: ['Scout Dedication'], rules: [
  { key: 'RollOption', domain: 'perception', option: 'scouts-senses-scouting', toggleable: true, label: 'Using Scout exploration activity' },
  { key: 'FlatModifier', selector: 'perception', type: 'circumstance', value: 2, label: "Scout's Senses", predicate: ['scouts-senses-scouting'] }
] });
addFeat({ name: 'Must Have Been the Wind', level: 20, traits: ['archetype'], prerequisites: ['Scout Dedication'], spellLinks: `${sysSpell('wfleiawxsfhpRRwf','Disappearance')} (1/day, occult)` });

// ============================================================
// SPELLS
// ============================================================
const allSpells = [];

allSpells.push(spellDoc({
  name: 'Arboreal Arms', rank: 4,
  description: extractDescription('Arboreal Arms', 'FOCUS'),
  traits: ['manipulate', 'morph', 'plant'], rarity: 'uncommon',
  traditions: [], castActions: 1, spellType: 'focus',
  targets: 'self', duration: '1 minute',
}));
allSpells.push(spellDoc({
  name: 'Arboreal Bole', rank: 8,
  description: extractDescription('Arboreal Bole', 'FOCUS'),
  traits: ['manipulate', 'morph', 'plant'], rarity: 'uncommon',
  traditions: [], castActions: 1, spellType: 'focus',
  targets: 'self', duration: '10 minutes',
}));
allSpells.push(spellDoc({
  name: 'Arboreal Legs', rank: 7,
  description: extractDescription('Arboreal Legs', 'FOCUS'),
  traits: ['manipulate', 'morph', 'plant'], rarity: 'uncommon',
  traditions: [], castActions: 1, spellType: 'focus',
  targets: 'self', duration: '10 minutes',
}));
allSpells.push(spellDoc({
  name: 'Splinter Bolt', rank: 3,
  description: extractDescription('Splinter Bolt', 'SPELL'),
  traits: ['attack', 'concentrate', 'manipulate', 'plant'], rarity: 'uncommon',
  traditions: ['primal'], castActions: 2, spellType: 'spell',
  range: '60 feet', targets: 'one creature',
}));
allSpells.push(spellDoc({
  name: 'Vine Shield', rank: 4,
  description: extractDescription('Vine Shield', 'SPELL'),
  traits: ['concentrate', 'plant'], rarity: 'uncommon',
  traditions: ['primal'], castActions: 1, spellType: 'spell',
  range: '60 feet', targets: 'one creature on the ground', duration: '1 round',
}));
allSpells.push(spellDoc({
  name: 'Forest Avenger', rank: 8,
  description: extractDescription('Forest Avenger', 'SPELL'),
  traits: ['concentrate', 'manipulate', 'plant', 'polymorph'], rarity: 'uncommon',
  traditions: ['primal'], castActions: 2, spellType: 'spell',
  targets: 'self', duration: '1 minute',
}));

// ============================================================
// EQUIPMENT
// ============================================================
const allEquipment = [];

allEquipment.push(equipmentDoc({
  name: 'Lasso', level: 0,
  description: '<p>The lasso is a treated rope tied in a specific way to allow it to be thrown over some part of a creature and pulled tight.</p>',
  traits: ['nonlethal', 'ranged-grapple', 'tethered', 'thrown'],
  itemType: 'weapon', price: { value: { gp: 1 } }, bulk: 'L',
  damage: { dice: 1, die: 'd4', damageType: 'bludgeoning' },
  range: 20, reload: 0, hands: 'held-in-one-plus-hands',
  category: 'martial', group: 'brawling',
}));
allEquipment.push(equipmentDoc({
  name: 'Barbed Lasso', level: 0,
  description: '<p>The barbed lasso is a variation on the lasso in which metal barbs are woven into the end of the rope to make it a particularly brutal way of capturing someone.</p>',
  traits: ['ranged-grapple', 'tethered', 'thrown'],
  itemType: 'weapon', price: { value: { gp: 3 } }, bulk: 'L',
  damage: { dice: 1, die: 'd4', damageType: 'piercing' },
  range: 20, reload: 0, hands: 'held-in-one-plus-hands',
  category: 'martial', group: 'knife',
}));
allEquipment.push(equipmentDoc({
  name: 'Net Gun', level: 0, rarity: 'rare',
  description: '<p>The net gun is powered by black powder charges to launch a folded net with weighted ends at an enemy to entangle them. The net is attached to two lead ropes that anchor back to the firearm. Once a net is fired, you can quickly grab these lead ropes with one hand and use them to keep the target grappled. Packing and loading the net is a difficult and time-consuming task, so net guns are often only fired once in a given engagement, though it is said that some people have mastered the art of reloading them quickly. Ammunition for a net gun is a pre-packed net charge that costs 1gp each. However, you may recover any spent charges as a 10 minute activity to repair and repack the nets.</p>',
  traits: ['nonlethal', 'ranged-grapple'],
  itemType: 'weapon', price: { value: { gp: 15 } }, bulk: '1',
  damage: { dice: 1, die: 'd10', damageType: 'bludgeoning' },
  range: 30, reload: 2, hands: 'held-in-two-hands',
  category: 'advanced', group: 'firearm',
}));
allEquipment.push(equipmentDoc({
  name: 'Bag Rounds', level: 2, rarity: 'uncommon',
  description: '<p>These small bags filled with soft pellets can be shot from a firearm instead of normal rounds. These rounds can only deal bludgeoning damage, even if fired from a concussive weapon, and you do not take a penalty when attempting a non-lethal attack when using these rounds. You can attempt to make a lethal attack with these rounds with a -2 circumstance penalty. Purchased in sets of 10.</p>',
  traits: ['consumable'], itemType: 'consumable', price: { value: { gp: 1 } }, bulk: '-',
}));
allEquipment.push(equipmentDoc({
  name: 'Blunted Arrows', level: 2, rarity: 'uncommon',
  description: '<p>Instead of an arrow or bolt for puncturing or making large wounds, these shafts end in a blunt tip. When fired from a weapon in the bow group the weapon deals bludgeoning damage, and you do not take a penalty when attempting a non-lethal attack when using this ammunition. You can attempt to make a lethal attack with this ammunition with a -2 circumstance penalty. Purchased in sets of 10.</p>',
  traits: ['consumable'], itemType: 'consumable', price: { value: { gp: 1 } }, bulk: '-',
}));
allEquipment.push(equipmentDoc({
  name: 'Blunted Bolts', level: 2, rarity: 'uncommon',
  description: '<p>Instead of an arrow or bolt for puncturing or making large wounds, these shafts end in a blunt tip. When fired from a weapon in the crossbow group the weapon deals bludgeoning damage, and you do not take a penalty when attempting a non-lethal attack when using this ammunition. You can attempt to make a lethal attack with this ammunition with a -2 circumstance penalty. Purchased in sets of 10.</p>',
  traits: ['consumable'], itemType: 'consumable', price: { value: { gp: 1 } }, bulk: '-',
}));
allEquipment.push(equipmentDoc({
  name: 'Slow Takedown', level: 2, rarity: 'uncommon',
  description: '<p>This synthetic toxin mixture causes the target to slowly become drowsier until it cannot move and falls unconscious.</p><p><strong>Saving Throw</strong> DC 18 Fortitude; <strong>Maximum Duration</strong> 5 minutes; <strong>Stage 1</strong> 1d6 non-lethal poison damage (1 round); <strong>Stage 2</strong> 1d8 non-lethal poison damage (1 round); <strong>Stage 3</strong> 1d10 non-lethal poison damage (1 round); <strong>Stage 4</strong> 2d8 non-lethal poison damage and immobilized (1 round)</p>',
  traits: ['alchemical', 'consumable', 'injury', 'sleep'],
  itemType: 'consumable', price: { value: { gp: 5 } }, bulk: 'L',
  usage: 'held-in-two-hands',
}));
allEquipment.push(equipmentDoc({
  name: 'Quick Nap', level: 7, rarity: 'uncommon',
  description: '<p>This synthetic toxin mixture is injected into the bloodstream and almost immediately knocks the victim unconscious.</p><p><strong>Saving Throw</strong> DC 24 Fortitude; <strong>Maximum Duration</strong> 10 minutes; <strong>Stage 1</strong> stunned 1 (1 round); <strong>Stage 2</strong> stunned (1 round); <strong>Stage 3</strong> unconscious and can\'t attempt Perception checks to wake up (1 minute)</p>',
  traits: ['alchemical', 'consumable', 'drug', 'incapacitation', 'injury', 'sleep'],
  itemType: 'consumable', price: { value: { gp: 80 } }, bulk: 'L',
  usage: 'held-in-two-hands',
}));

// ============================================================
// WRITE OUTPUT
// ============================================================
// Macro builder
// ============================================================

function macroDoc({ name, command, img = 'systems/pf2e/icons/default-icons/feats.webp' }) {
  return {
    _id: stableId('eaw-macros:' + name),
    name,
    type: 'script',
    img,
    command,
    scope: 'global',
    folder: null,
    sort: 0,
    flags: {},
    ownership: { default: 0 },
    _stats: { systemId: 'pf2e', systemVersion: '6.0.0', coreVersion: '13', createdTime: now, modifiedTime: now, lastModifiedBy: 'generator' },
  };
}

const allMacros = [];

allMacros.push(macroDoc({
  name: 'Branch Out - Gather Information',
  command: [
    '// Branch Out: Use Nature instead of Diplomacy to Gather Information',
    'const actor = canvas.tokens.controlled[0]?.actor ?? game.user.character;',
    'if (!actor) return ui.notifications.warn("Select a token or assign a default character.");',
    'const skill = actor.skills?.nature;',
    'if (!skill) return ui.notifications.warn("This actor has no Nature skill.");',
    'skill.roll({ extraRollOptions: ["action:gather-information"] });',
  ].join('\n'),
}));

allMacros.push(macroDoc({
  name: 'Branch Out - Make an Impression',
  command: [
    '// Branch Out: Use Nature instead of Diplomacy to Make an Impression',
    'const actor = canvas.tokens.controlled[0]?.actor ?? game.user.character;',
    'if (!actor) return ui.notifications.warn("Select a token or assign a default character.");',
    'const skill = actor.skills?.nature;',
    'if (!skill) return ui.notifications.warn("This actor has no Nature skill.");',
    'skill.roll({ extraRollOptions: ["action:make-an-impression"] });',
  ].join('\n'),
}));

allMacros.push(macroDoc({
  name: 'Instant Tracker - Seek',
  command: [
    '// Instant Tracker: Use Survival instead of Perception to Seek your hunted prey',
    'const actor = canvas.tokens.controlled[0]?.actor ?? game.user.character;',
    'if (!actor) return ui.notifications.warn("Select a token or assign a default character.");',
    'const skill = actor.skills?.survival;',
    'if (!skill) return ui.notifications.warn("This actor has no Survival skill.");',
    'skill.roll({ extraRollOptions: ["action:seek"] });',
  ].join('\n'),
}));

allMacros.push(macroDoc({
  name: 'Known Predators - Recall Knowledge',
  command: [
    '// Known Predators: Use Survival instead of the normal skill to Recall Knowledge in favored terrain',
    'const actor = canvas.tokens.controlled[0]?.actor ?? game.user.character;',
    'if (!actor) return ui.notifications.warn("Select a token or assign a default character.");',
    'const skill = actor.skills?.survival;',
    'if (!skill) return ui.notifications.warn("This actor has no Survival skill.");',
    'skill.roll({ extraRollOptions: ["action:recall-knowledge"] });',
  ].join('\n'),
}));

allMacros.push(macroDoc({
  name: 'Urban Walker - Gather Information',
  command: [
    '// Urban Walker: Use Survival instead of Diplomacy to Gather Information in urban areas',
    'const actor = canvas.tokens.controlled[0]?.actor ?? game.user.character;',
    'if (!actor) return ui.notifications.warn("Select a token or assign a default character.");',
    'const skill = actor.skills?.survival;',
    'if (!skill) return ui.notifications.warn("This actor has no Survival skill.");',
    'skill.roll({ extraRollOptions: ["action:gather-information"] });',
  ].join('\n'),
}));

allMacros.push(macroDoc({
  name: 'Urban Walker - Make an Impression',
  command: [
    '// Urban Walker: Use Survival instead of Diplomacy to Make an Impression in urban areas',
    'const actor = canvas.tokens.controlled[0]?.actor ?? game.user.character;',
    'if (!actor) return ui.notifications.warn("Select a token or assign a default character.");',
    'const skill = actor.skills?.survival;',
    'if (!skill) return ui.notifications.warn("This actor has no Survival skill.");',
    'skill.roll({ extraRollOptions: ["action:make-an-impression"] });',
  ].join('\n'),
}));

// ============================================================
// EFFECTS
// ============================================================
const allEffects = [];

// --- Herbalist Effects ---
allEffects.push(effectDoc({ name: 'Effect: Energizing Chew', level: 8,
  description: '<p>You gain a +1 status bonus to Acrobatics, Athletics, and Perception checks for 1 hour. If you were fatigued, the condition is suppressed for the duration.</p>',
  duration: { value: 1, unit: 'hours' },
  rules: [
    { key: 'FlatModifier', selector: 'acrobatics', type: 'status', value: 1, label: 'Energizing Chew' },
    { key: 'FlatModifier', selector: 'athletics', type: 'status', value: 1, label: 'Energizing Chew' },
    { key: 'FlatModifier', selector: 'perception', type: 'status', value: 1, label: 'Energizing Chew' }
  ],
}));
allEffects.push(effectDoc({ name: 'Effect: Dietary Cleanse', level: 10,
  description: '<p>You gain a +2 circumstance bonus to Fortitude saves for 1 week.</p>',
  duration: { value: -1, unit: 'unlimited' },
  rules: [
    { key: 'FlatModifier', selector: 'saving-throw:fortitude', type: 'circumstance', value: 2, label: 'Dietary Cleanse' }
  ],
}));
allEffects.push(effectDoc({ name: 'Effect: Evening Brew', level: 6,
  description: '<p>You gain temporary Hit Points equal to half the herbalist\'s level (or their full level if master in Nature). Lasts until next daily preparations.</p>',
  duration: { value: -1, unit: 'unlimited' },
  rules: [
    { key: 'TempHP', value: 'floor(@actor.level/2)' }
  ], img: 'icons/svg/heal.svg',
}));
allEffects.push(effectDoc({ name: 'Effect: Anesthetic Tincture', level: 14,
  description: '<p>The next time you are reduced to 0 HP but not killed, you instead remain at 1 HP, your wounded condition increases by 1, and you gain temporary HP equal to the herbalist\'s level for 1 minute. Then remove this effect.</p>',
  duration: { value: -1, unit: 'unlimited' },
  rules: [
    { key: 'Note', selector: 'ac', text: '<p class="compact-text"><strong>Anesthetic Tincture</strong> If reduced to 0 HP (not killed): stay at 1 HP, wounded +1, gain TempHP = herbalist level for 1 min. Then remove this effect.</p>' }
  ],
}));

// --- Treespeaker Effects ---
allEffects.push(effectDoc({ name: 'Effect: Rejuvenate', level: 8,
  description: '<p>You gain fast healing 1 for 30 minutes.</p>',
  duration: { value: 30, unit: 'minutes' },
  rules: [
    { key: 'FastHealing', value: 1 }
  ], img: 'icons/svg/heal.svg',
}));
allEffects.push(effectDoc({ name: 'Effect: Tree of Life', level: 20,
  description: '<p>You gain regeneration 30 for 3 rounds (deactivated by fire damage).</p>',
  duration: { value: 3, unit: 'rounds' },
  rules: [
    { key: 'FastHealing', value: 30 },
    { key: 'Note', selector: 'ac', text: '<p class="compact-text"><strong>Tree of Life</strong> This regeneration is deactivated by fire damage.</p>' }
  ], img: 'icons/svg/heal.svg',
}));

// --- Horizon Walker Effects ---
allEffects.push(effectDoc({ name: 'Effect: Terrain Guidance', level: 4,
  description: '<p>You gain a +2 circumstance bonus to skill checks to move through terrain and to saving throws against hazards. You ignore non-magical difficult terrain until the end of your turn.</p>',
  duration: { value: 1, unit: 'rounds', expiry: 'turn-end' },
  rules: [
    { key: 'FlatModifier', selector: 'acrobatics', type: 'circumstance', value: 2, label: 'Terrain Guidance' },
    { key: 'FlatModifier', selector: 'athletics', type: 'circumstance', value: 2, label: 'Terrain Guidance' }
  ],
}));

// --- Scout Effects ---
allEffects.push(effectDoc({ name: 'Effect: Detailed Report (+1)', level: 6,
  description: '<p>You gain a +1 circumstance bonus to Recall Knowledge checks about the creature described in the scout\'s report. (Scout has expert Perception.) Duration: 10 minutes.</p>',
  duration: { value: 10, unit: 'minutes' },
  rules: [
    { key: 'FlatModifier', selector: ['arcana', 'crafting', 'medicine', 'nature', 'occultism', 'religion', 'society'], type: 'circumstance', value: 1, label: 'Detailed Report', predicate: ['action:recall-knowledge'] }
  ],
}));
allEffects.push(effectDoc({ name: 'Effect: Detailed Report (+2)', level: 6,
  description: '<p>You gain a +2 circumstance bonus to Recall Knowledge checks about the creature described in the scout\'s report. (Scout has master Perception.) Duration: 10 minutes.</p>',
  duration: { value: 10, unit: 'minutes' },
  rules: [
    { key: 'FlatModifier', selector: ['arcana', 'crafting', 'medicine', 'nature', 'occultism', 'religion', 'society'], type: 'circumstance', value: 2, label: 'Detailed Report', predicate: ['action:recall-knowledge'] }
  ],
}));
allEffects.push(effectDoc({ name: 'Effect: Detailed Report (+3)', level: 6,
  description: '<p>You gain a +3 circumstance bonus to Recall Knowledge checks about the creature described in the scout\'s report. (Scout has legendary Perception.) Duration: 10 minutes.</p>',
  duration: { value: 10, unit: 'minutes' },
  rules: [
    { key: 'FlatModifier', selector: ['arcana', 'crafting', 'medicine', 'nature', 'occultism', 'religion', 'society'], type: 'circumstance', value: 3, label: 'Detailed Report', predicate: ['action:recall-knowledge'] }
  ],
}));
allEffects.push(effectDoc({ name: 'Effect: Marking Shot', level: 8,
  description: '<p>This creature has been marked. The next creature other than the attacker to Strike this target gains a +1 circumstance bonus to their attack roll. Remove after the next attack against this creature.</p>',
  duration: { value: 1, unit: 'rounds', expiry: 'turn-end' },
  rules: [], img: 'icons/svg/eye.svg',
}));
allEffects.push(effectDoc({ name: 'Effect: Marking Shot (Critical)', level: 8,
  description: '<p>This creature has been critically marked. The next creature other than the attacker to Strike this target gains a +2 circumstance bonus to their attack roll. Remove after the next attack against this creature.</p>',
  duration: { value: 1, unit: 'rounds', expiry: 'turn-end' },
  rules: [], img: 'icons/svg/eye.svg',
}));

// --- Bounty Hunter Effects ---
allEffects.push(effectDoc({ name: 'Effect: Hampering Critical', level: 4,
  description: '<p>You take a -10-foot circumstance penalty to all Speeds until the end of the attacker\'s next turn.</p>',
  duration: { value: 1, unit: 'rounds', expiry: 'turn-end' },
  rules: [
    { key: 'FlatModifier', selector: 'speed', type: 'circumstance', value: -10, label: 'Hampering Critical' }
  ], img: 'icons/svg/downgrade.svg',
}));
allEffects.push(effectDoc({ name: 'Effect: Lethal Ultimatum', level: 6,
  description: '<p>You take a -1 status penalty to attack rolls for 1 round.</p>',
  duration: { value: 1, unit: 'rounds' },
  rules: [
    { key: 'FlatModifier', selector: 'attack-roll', type: 'status', value: -1, label: 'Lethal Ultimatum' }
  ], img: 'icons/svg/downgrade.svg',
}));
allEffects.push(effectDoc({ name: 'Effect: Dog Pile', level: 10,
  description: '<p>You gain a +2 circumstance bonus to Athletics checks to Grapple, Shove, or Trip while flanking the bounty hunter\'s hunted prey.</p>',
  duration: { value: -1, unit: 'unlimited' },
  rules: [
    { key: 'FlatModifier', selector: 'athletics', type: 'circumstance', value: 2, label: 'Dog Pile', predicate: [{ or: ['action:grapple', 'action:shove', 'action:trip'] }] }
  ],
}));

// --- Folklorist Effects ---
allEffects.push(effectDoc({ name: 'Effect: Darken Tone', level: 8,
  description: '<p>You gain a status bonus to damage rolls equal to the number of your weapon\'s damage dice. When you critically hit an enemy, the enemy becomes frightened 1.</p><p><em>Note: The damage bonus defaults to 1. Adjust if your weapon has more damage dice.</em></p>',
  duration: { value: -1, unit: 'unlimited' },
  rules: [
    { key: 'FlatModifier', selector: 'strike-damage', type: 'status', value: 1, label: 'Darken Tone (adjust to weapon dice count)' },
    { key: 'Note', selector: 'strike-attack-roll', text: '<p class="compact-text"><strong>Darken Tone</strong> On a critical hit, the enemy becomes frightened 1.</p>', outcome: ['criticalSuccess'] }
  ],
}));
allEffects.push(effectDoc({ name: 'Effect: Lighten Tone', level: 8,
  description: '<p>You gain temporary HP equal to half the folklorist\'s level. Once per round when you damage the villain, regain these temporary HP.</p>',
  duration: { value: -1, unit: 'unlimited' },
  rules: [
    { key: 'TempHP', value: 'floor(@actor.level/2)' },
    { key: 'Note', selector: 'strike-damage', text: '<p class="compact-text"><strong>Lighten Tone</strong> Once per round when you damage the Spin Tale villain, regain TempHP equal to half the folklorist\'s level.</p>' }
  ], img: 'icons/svg/heal.svg',
}));
allEffects.push(effectDoc({ name: 'Effect: Establish Foil', level: 6,
  description: '<p>This creature is a foil of the Spin Tale. The hero gains their Spin Tale status bonus to attacks and damage against this creature in addition to the original villain.</p>',
  duration: { value: -1, unit: 'unlimited' },
  rules: [], img: 'icons/svg/eye.svg',
}));
allEffects.push(effectDoc({ name: 'Effect: Establish Foil (Ally)', level: 6,
  description: '<p>You are an ally foil of the Spin Tale. The hero gains a +1 status bonus to checks to Aid you. Each time you take damage, reduce it by 5 (10 at master Performance, 15 at legendary) — the Spin Tale hero takes that damage instead (unreducible).</p>',
  duration: { value: -1, unit: 'unlimited' },
  rules: [
    { key: 'Note', selector: 'ac', text: '<p class="compact-text"><strong>Establish Foil</strong> When you take damage, reduce by 5/10/15. The Spin Tale hero takes that unreducible damage instead.</p>' }
  ],
}));
allEffects.push(effectDoc({ name: 'Effect: Cast of Villains Foil', level: 12,
  description: '<p>You take a -2 status penalty to attack rolls and skill checks against targets that are not the hero of the Spin Tale.</p>',
  duration: { value: -1, unit: 'unlimited' },
  rules: [
    { key: 'FlatModifier', selector: 'attack-roll', type: 'status', value: -2, label: 'Cast of Villains Foil' },
    { key: 'FlatModifier', selector: 'skill-check', type: 'status', value: -2, label: 'Cast of Villains Foil' },
    { key: 'Note', selector: 'attack-roll', text: '<p class="compact-text"><strong>Cast of Villains</strong> This penalty does NOT apply against the Spin Tale hero.</p>' }
  ], img: 'icons/svg/downgrade.svg',
}));
allEffects.push(effectDoc({ name: 'Effect: Second Act (Off-Guard)', level: 10,
  description: '<p>This creature is off-guard to the hero of the Spin Tale for 1 round.</p>',
  duration: { value: 1, unit: 'rounds' },
  rules: [], img: 'icons/svg/downgrade.svg',
}));
allEffects.push(effectDoc({ name: 'Effect: Second Act (Off-Guard, 1 min)', level: 10,
  description: '<p>This creature is off-guard to the hero of the Spin Tale for 1 minute.</p>',
  duration: { value: 1, unit: 'minutes' },
  rules: [], img: 'icons/svg/downgrade.svg',
}));
allEffects.push(effectDoc({ name: 'Effect: Second Act (Off-Guard + Weakness)', level: 10,
  description: '<p>This creature is off-guard to the hero of the Spin Tale for 1 minute and gains weakness 3 to the hero\'s primary weapon damage type.</p>',
  duration: { value: 1, unit: 'minutes' },
  rules: [
    { key: 'Note', selector: 'ac', text: '<p class="compact-text"><strong>Second Act</strong> This creature has weakness 3 to the Spin Tale hero\'s primary weapon damage type.</p>' }
  ], img: 'icons/svg/downgrade.svg',
}));
allEffects.push(effectDoc({ name: 'Effect: Third Act (Off-Guard)', level: 14,
  description: '<p>This creature is off-guard for 1 round.</p>',
  duration: { value: 1, unit: 'rounds' },
  rules: [], img: 'icons/svg/downgrade.svg',
}));
allEffects.push(effectDoc({ name: 'Effect: Third Act (Enhanced Tale)', level: 14,
  description: '<p>This creature is off-guard for 1 round. The Spin Tale status bonus to attacks and damage against all villains increases to +2 for the remainder of the tale.</p>',
  duration: { value: 1, unit: 'rounds' },
  rules: [], img: 'icons/svg/downgrade.svg',
}));
allEffects.push(effectDoc({ name: 'Effect: Third Act (Off-Guard + Weakness)', level: 14,
  description: '<p>This creature is off-guard for 1 round and gains weakness to the hero\'s primary weapon damage type equal to half the folklorist\'s level for the remainder of the tale.</p>',
  duration: { value: -1, unit: 'unlimited' },
  rules: [
    { key: 'Note', selector: 'ac', text: '<p class="compact-text"><strong>Third Act</strong> This creature has weakness to the Spin Tale hero\'s primary weapon damage type equal to half the folklorist\'s level.</p>' }
  ], img: 'icons/svg/downgrade.svg',
}));
allEffects.push(effectDoc({ name: 'Effect: Climax', level: 18,
  description: '<p>During this extra turn from Climax, you gain a +3 status bonus to all checks.</p>',
  duration: { value: 1, unit: 'rounds', expiry: 'turn-end' },
  rules: [
    { key: 'FlatModifier', selector: 'skill-check', type: 'status', value: 3, label: 'Climax' },
    { key: 'FlatModifier', selector: 'attack-roll', type: 'status', value: 3, label: 'Climax' },
    { key: 'FlatModifier', selector: 'spell-attack-roll', type: 'status', value: 3, label: 'Climax' },
    { key: 'FlatModifier', selector: 'saving-throw', type: 'status', value: 3, label: 'Climax' },
    { key: 'FlatModifier', selector: 'perception', type: 'status', value: 3, label: 'Climax' }
  ],
}));

// --- Animal Trainer Effects ---
allEffects.push(effectDoc({ name: 'Effect: Distract (Off-Guard)', level: 4,
  description: '<p>This creature is off-guard to the animal trainer\'s attacks until the end of the animal trainer\'s next turn.</p>',
  duration: { value: 1, unit: 'rounds', expiry: 'turn-end' },
  rules: [], img: 'icons/svg/downgrade.svg',
}));

// ============================================================
// Auto-link first mention of module items in feat descriptions
// ============================================================
{
  // Build name → @UUID map for all module items (spells, feats, equipment)
  const linkMap = [];
  allSpells.forEach(s => linkMap.push({ name: s.name, uuid: `@UUID[Compendium.everything-archetypes-wilderness.eaw-spells.${s._id}]{${s.name}}` }));
  allFeats.forEach(f => linkMap.push({ name: f.name, uuid: `@UUID[Compendium.everything-archetypes-wilderness.eaw-feats.${f._id}]{${f.name}}` }));
  allEquipment.forEach(e => linkMap.push({ name: e.name, uuid: `@UUID[Compendium.everything-archetypes-wilderness.eaw-equipment.${e._id}]{${e.name}}` }));
  // Sort longest names first to avoid partial matches
  linkMap.sort((a, b) => b.name.length - a.name.length);

  for (const feat of allFeats) {
    let desc = feat.system.description.value;
    for (const item of linkMap) {
      // Don't link a feat to itself
      if (item.name === feat.name) continue;
      // Skip if this item is already linked via @UUID in this description
      if (desc.includes(`{${item.name}}`)) continue;
      // Replace first occurrence (case-insensitive, word boundary, not inside HTML tags)
      const escaped = item.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const re = new RegExp(`(?<![\\w@])(?:<em>)?${escaped}(?:<\\/em>)?(?!\\w)`, 'i');
      desc = desc.replace(re, item.uuid);
    }
    feat.system.description.value = desc;
  }
}

// ============================================================
const outDir = path.join(process.cwd(), 'packs', 'Everything-Archetypes-Wilderness');
fs.mkdirSync(outDir, { recursive: true });

function writeCompendium(filename, docs) {
  const jsonPath = path.join(outDir, filename + '.json');
  fs.writeFileSync(jsonPath, JSON.stringify(docs, null, 2), 'utf8');
  console.log(`Wrote ${jsonPath} (${docs.length} documents)`);
  const dbPath = path.join(outDir, filename + '.db');
  fs.writeFileSync(dbPath, docs.map(d => JSON.stringify(d)).join('\n') + '\n', 'utf8');
  console.log(`Wrote ${dbPath}`);
}

writeCompendium('eaw-feats', allFeats);
writeCompendium('eaw-spells', allSpells);
writeCompendium('eaw-equipment', allEquipment);
writeCompendium('eaw-macros', allMacros);
writeCompendium('eaw-effects', allEffects);

// Report any feats with placeholder descriptions
const missing = allFeats.filter(f => f.system.description.value.includes('[Description for'));
if (missing.length > 0) {
  console.warn(`\n${missing.length} feats have placeholder descriptions:`);
  missing.forEach(f => console.warn(`  - ${f.name}`));
}

console.log(`\nDone! Generated ${allFeats.length} feats, ${allSpells.length} spells, ${allEquipment.length} equipment items, ${allMacros.length} macros, ${allEffects.length} effects.`);
