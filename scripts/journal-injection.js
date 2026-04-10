/**
 * Everything Archetypes: Wilderness — Journal Injection
 * Injects module archetype feat links into the PF2e system's Archetypes journal
 * pages at render time, so module feats appear alongside system feats.
 */
const MODULE_ID = 'everything-archetypes-wilderness';
const MARKER_CLASS = 'eaw-injected';

let injectionData = null;

// Pre-load injection data during init so the render hook can run synchronously.
Hooks.once('init', () => {
  fetch(`modules/${MODULE_ID}/scripts/journal-injection-data.json`)
    .then(r => r.json())
    .then(data => { injectionData = data; })
    .catch(() => console.warn(`${MODULE_ID} | Could not load journal injection data`));
});

function escapeHtml(s) {
  const el = document.createElement('span');
  el.textContent = s;
  return el.innerHTML;
}

function rarityColor(rarity) {
  switch (rarity) {
    case 'uncommon': return '#98513d';
    case 'rare': return '#002664';
    case 'unique': return '#800080';
    default: return '#5e0000';
  }
}

function traitTags(traits, rarity) {
  const tags = [];
  if (rarity && rarity !== 'common') {
    tags.push(`<span style="display:inline-block;padding:0 6px;margin:1px 2px;background:${rarityColor(rarity)};color:white;font-size:0.7em;text-transform:uppercase;font-weight:bold;border-radius:2px;">${escapeHtml(rarity)}</span>`);
  }
  for (const t of traits) {
    tags.push(`<span style="display:inline-block;padding:0 6px;margin:1px 2px;background:#5e0000;color:white;font-size:0.7em;text-transform:uppercase;font-weight:bold;border-radius:2px;">${escapeHtml(t)}</span>`);
  }
  return tags.join('');
}

async function injectArchetypeFeats(root) {
  if (!injectionData) return;

  for (const [, archData] of Object.entries(injectionData)) {
    const dedLink = root.querySelector(
      `a.content-link[data-uuid*="${archData.dedicationId}"]`
    );
    if (!dedLink) continue;

    const container = dedLink.closest('.journal-page-content')
                   || dedLink.closest('.journal-entry-page')
                   || dedLink.closest('.editor-content')
                   || dedLink.parentElement;
    if (!container || container.querySelector(`.${MARKER_CLASS}`)) continue;

    // Collect system feat headings with their levels so we can intersperse.
    const featHeadings = [];
    for (const h of container.querySelectorAll('h2, h3')) {
      const m = h.textContent.match(/Feat\s+(\d+)/i);
      if (m) featHeadings.push({ el: h, level: parseInt(m[1]) });
    }

    // Sort module feats by level, then alphabetically.
    const sorted = [...archData.feats].sort((a, b) =>
      a.level - b.level || a.name.localeCompare(b.name)
    );

    for (const feat of sorted) {
      // Insert before the first system heading whose level exceeds this feat's.
      let target = null;
      for (const fh of featHeadings) {
        if (fh.level > feat.level) { target = fh.el; break; }
      }

      // Build feat block HTML with @UUID for enrichment
      let html =
        `<h2 style="display:flex;justify-content:space-between;align-items:baseline;">` +
        `<span>@UUID[${feat.uuid}]{${feat.name}}</span>` +
        `<span>Feat ${feat.level}</span></h2>`;

      // Trait tags
      if ((feat.rarity && feat.rarity !== 'common') || feat.traits.length > 0) {
        html += `<div style="margin:2px 0 4px;">${traitTags(feat.traits, feat.rarity)}</div>`;
      }

      // Description (already contains prerequisites, trigger, body, special, etc.)
      html += feat.description;

      // Source
      html += `<p style="text-align:right;font-style:italic;font-size:0.85em;">Source: <em>Everything Archetypes: Wilderness</em></p>`;

      // Enrich HTML to make @UUID links clickable
      const enriched = await TextEditor.enrichHTML(html, { async: true });

      const entry = document.createElement('div');
      entry.className = MARKER_CLASS;
      entry.innerHTML = enriched;

      if (target) {
        target.before(entry);
        entry.after(document.createElement('hr'));
      } else {
        if (container.lastElementChild && container.lastElementChild.tagName !== 'HR') {
          container.appendChild(document.createElement('hr'));
        }
        container.appendChild(entry);
      }
    }
  }
}

// Determine if this is a page within the PF2e Archetypes journal.
function isArchetypesPage(doc) {
  if (!doc) return false;
  const parent = doc.parent;
  return parent?.pack === 'pf2e.journals' && parent.name === 'Archetypes';
}

// Determine if this is the PF2e Archetypes journal entry itself.
function isArchetypesJournal(doc) {
  if (!doc) return false;
  return doc.pack === 'pf2e.journals' && doc.name === 'Archetypes';
}

// Foundry v13 (ApplicationV2) — page-level hook.
// This fires when each archetype page is rendered inside the journal.
// Class: JournalEntryPageProseMirrorSheet, doc = page name (e.g. "Animal Trainer")
Hooks.on('renderJournalEntryPageProseMirrorSheet', (app, element) => {
  if (!isArchetypesPage(app.document)) return;
  console.log(`${MODULE_ID} | renderJournalEntryPageProseMirrorSheet for page "${app.document.name}"`);
  injectArchetypeFeats(element);
});

// Also hook the parent chain for page rendering (v13).
for (const hookName of [
  'renderJournalEntryPageTextSheet',
  'renderJournalEntryPageHandlebarsSheet',
  'renderJournalEntryPageSheet',
]) {
  Hooks.on(hookName, (app, element) => {
    if (!isArchetypesPage(app.document)) return;
    console.log(`${MODULE_ID} | ${hookName} for page "${app.document.name}"`);
    injectArchetypeFeats(element);
  });
}

// Foundry v13 — journal-level hook (backup: inject into any visible page content).
Hooks.on('renderJournalEntrySheet', (app, element) => {
  if (!isArchetypesJournal(app.document)) return;
  console.log(`${MODULE_ID} | renderJournalEntrySheet for Archetypes journal`);
  injectArchetypeFeats(element);
});

// Foundry v12 (ApplicationV1) — legacy hooks for backward compatibility.
for (const hookName of [
  'renderJournalSheet',
  'renderJournalSheetPF2e',
  'renderJournalTextPageSheet',
  'renderJournalPageSheet',
]) {
  Hooks.on(hookName, (app, html) => {
    const doc = app.document;
    if (!isArchetypesJournal(doc) && !isArchetypesPage(doc)) return;
    console.log(`${MODULE_ID} | ${hookName} fired`);
    const root = html[0] ?? html;
    injectArchetypeFeats(root);
  });
}
