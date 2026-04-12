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
  if (!injectionData || !root) return;

  try {
    for (const [archName, archData] of Object.entries(injectionData)) {
      if (!archData.dedicationId || !archData.feats?.length) continue;

      const dedLink = root.querySelector(
        `a.content-link[data-uuid*="${archData.dedicationId}"]`
      );
      if (!dedLink) continue;

      const container = dedLink.closest('.journal-page-content')
                     || dedLink.closest('.journal-entry-page')
                     || dedLink.closest('.editor-content')
                     || dedLink.parentElement;
      if (!container || container.querySelector(`.${MARKER_CLASS}`) || container.dataset.eawPending) continue;

      // Mark synchronously to prevent duplicate injection from concurrent async hooks.
      container.dataset.eawPending = '1';

      try {
        // Collect system feat headings with their levels so we can intersperse.
        // Uses a broad regex to handle variations like "Feat 8", "FEAT 8", "Feat 12".
        // If the system changes heading format, feats gracefully append at the end.
        const featHeadings = [];
        for (const h of container.querySelectorAll('h1, h2, h3, h4')) {
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
          if ((feat.rarity && feat.rarity !== 'common') || (feat.traits && feat.traits.length > 0)) {
            html += `<div style="margin:2px 0 4px;">${traitTags(feat.traits || [], feat.rarity)}</div>`;
          }

          // Description (already contains prerequisites, trigger, body, special, etc.)
          if (feat.description) html += feat.description;

          // Source
          html += `<p style="text-align:right;font-style:italic;font-size:0.85em;">Source: <em>Everything Archetypes: Wilderness</em></p>`;

          // Enrich HTML to make @UUID links clickable.
          // If enrichHTML fails, fall back to raw HTML (links won't be clickable but content still shows).
          let enriched;
          try {
            enriched = await TextEditor.enrichHTML(html, { async: true });
          } catch {
            enriched = html;
          }

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
      } catch (err) {
        console.warn(`${MODULE_ID} | Failed to inject feats for ${archName}:`, err);
      }
    }
  } catch (err) {
    console.warn(`${MODULE_ID} | Journal injection failed:`, err);
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

// Foundry v13 (ApplicationV2) — page-level hook (primary).
Hooks.on('renderJournalEntryPageProseMirrorSheet', (app, element) => {
  try {
    if (!isArchetypesPage(app?.document)) return;
    console.log(`${MODULE_ID} | page render for "${app.document.name}"`);
    injectArchetypeFeats(element);
  } catch (err) {
    console.warn(`${MODULE_ID} | Hook error (v13):`, err);
  }
});

// Foundry v12 (ApplicationV1) — legacy page-level hook.
Hooks.on('renderJournalTextPageSheet', (app, html) => {
  try {
    if (!isArchetypesPage(app?.document)) return;
    console.log(`${MODULE_ID} | v1 page render for "${app.document.name}"`);
    injectArchetypeFeats(html[0] ?? html);
  } catch (err) {
    console.warn(`${MODULE_ID} | Hook error (v12):`, err);
  }
});
