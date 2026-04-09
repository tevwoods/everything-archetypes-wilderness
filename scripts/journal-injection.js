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

function ordinal(n) {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}

function injectArchetypeFeats(root) {
  if (!injectionData) return;

  for (const [, archData] of Object.entries(injectionData)) {
    // Find the dedication feat's enriched link by its system compendium ID.
    // After TextEditor.enrichHTML, @UUID becomes <a class="content-link" data-uuid="...">.
    const dedLink = root.querySelector(
      `a.content-link[data-uuid*="${archData.dedicationId}"]`
    );
    if (!dedLink) continue;

    // Walk up to the page content container
    const container = dedLink.closest('.journal-page-content')
                   || dedLink.closest('.journal-entry-page')
                   || dedLink.closest('.editor-content')
                   || dedLink.parentElement;
    if (!container || container.querySelector(`.${MARKER_CLASS}`)) continue;

    // Build feat entries in PF2e "Additional Feats" style: "4th Link; 6th Link"
    const entries = archData.feats.map(f => {
      const name = escapeHtml(f.name);
      const uuid = escapeHtml(f.uuid);
      return `${ordinal(f.level)} <a class="content-link" draggable="true" `
           + `data-uuid="${uuid}" data-type="Item">`
           + `<i class="fas fa-suitcase"></i> ${name}</a>`;
    });

    const section = document.createElement('div');
    section.className = MARKER_CLASS;
    section.style.marginTop = '0.5em';
    section.innerHTML =
      '<hr>' +
      '<p><strong>Additional Feats (<em>Everything Archetypes: Wilderness</em>):</strong> ' +
      entries.join('; ') +
      '</p>';
    container.appendChild(section);
  }
}

// Hook into JournalSheet rendering (ApplicationV1 — Foundry v12/v13).
// The hook fires for every subclass in the inheritance chain, so this catches
// any PF2e-specific JournalSheet subclass as well.
Hooks.on('renderJournalSheet', (app, html) => {
  const journal = app.document;
  if (journal?.pack !== 'pf2e.journals' || journal.name !== 'Archetypes') return;
  injectArchetypeFeats(html[0] ?? html);
});
