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

// Determine if this is the PF2e Archetypes journal by checking the document
// and its parent (for page-level hooks).
function isArchetypesJournal(doc) {
  if (!doc) return false;
  // Journal-level: doc is the JournalEntry
  if (doc.pack === 'pf2e.journals' && doc.name === 'Archetypes') return true;
  // Page-level: doc is a JournalEntryPage, parent is the JournalEntry
  const parent = doc.parent;
  if (parent?.pack === 'pf2e.journals' && parent.name === 'Archetypes') return true;
  return false;
}

// Hook into journal rendering at multiple levels to catch however Foundry/PF2e
// renders the content. Each hook in the ApplicationV1 inheritance chain fires.
for (const hookName of [
  'renderJournalSheet',
  'renderJournalSheetPF2e',
  'renderJournalTextPageSheet',
  'renderJournalPageSheet',
  'renderApplication',
]) {
  Hooks.on(hookName, (app, html) => {
    if (!isArchetypesJournal(app.document)) return;
    console.log(`${MODULE_ID} | ${hookName} fired for Archetypes journal`);
    const root = html[0] ?? html;
    injectArchetypeFeats(root);
  });
}

// Also support ApplicationV2 (Foundry v13+) which passes HTMLElement directly.
for (const hookName of [
  'renderJournalSheetV2',
  'renderJournalTextPageSheetPF2e',
]) {
  Hooks.on(hookName, (app, element) => {
    if (!isArchetypesJournal(app.document)) return;
    console.log(`${MODULE_ID} | ${hookName} fired for Archetypes journal`);
    injectArchetypeFeats(element);
  });
}

// Debug: log ALL render hooks to find the correct one.
// Enable with: game.settings.set('everything-archetypes-wilderness', 'debug', true)
// Or just check the console after opening the Archetypes journal from the compendium.
Hooks.on('renderApplication', (app, html) => {
  const name = app?.constructor?.name;
  const docName = app?.document?.name;
  if (docName === 'Archetypes' || name?.includes('Journal')) {
    console.log(`${MODULE_ID} | DEBUG renderApplication: class=${name} doc=${docName} pack=${app?.document?.pack}`);
  }
});
