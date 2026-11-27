# Everything Archetypes: Wilderness

A Foundry VTT module for Pathfinder 2e (Remastered) providing expanded archetype feats, spells, and equipment for wilderness-themed archetypes.

## Contents

- **130 Archetype Feats** across 10 wilderness archetypes
- **6 Custom Spells**
- **9 Equipment Items**, including native Net Gun ammunition
- **28 Automation Effects**
- **10 Companion Actions**
- **6 Utility Macros**
- Native Foundry LevelDB packs built from reviewable JSON sources

## Installation

### Foundry VTT Module Browser
Search for **Everything Archetypes: Wilderness** in the Foundry VTT module browser.

### Manual Install
Paste the following manifest URL into Foundry's **Install Module** dialog:

```
https://github.com/tevwoods/everything-archetypes-wilderness/releases/latest/download/module.json
```

## Requirements

- Foundry VTT v12+
- PF2e System 5.0.0+

## Validation

Run `npm run validate` to regenerate the packs and verify document counts, JSON/NEDB parity, PF2e IDs, custom traits/ammunition, Rule Element structure, Remaster terminology, and semantic-source synchronization.

Run `npm run build` to validate the source and produce a release-ready V11–V14 native LevelDB package under `dist/`. The same artifact retains V13 compatibility while targeting V14.

The live PF2e acceptance battery is available at `macros/test-wilderness-rule-elements.js`. In Foundry:

```js
const suite = await import(
  "/modules/everything-archetypes-wilderness/macros/test-wilderness-rule-elements.js"
);
await suite.runWildernessRuleElementSuite();
```

## Automated Foundry upgrades

The daily `Watch Foundry major releases` workflow starts when a new Foundry major reaches Testing or Stable. It opens an assigned GitHub issue, which produces normal GitHub email notifications. Copilot CLI authenticates with the workflow's built-in `GITHUB_TOKEN` and `copilot-requests: write` permission. It may open a draft migration PR only after local tests pass with at least 0.90 confidence. If the account or plan cannot authorize the Copilot request, the workflow posts the failure for review instead.

The agent cannot publish. When you create and publish a GitHub Release, the release workflow builds native LevelDB assets and uploads the versioned ZIP plus `module.json`. Users continue to install from the repository's stable `releases/latest/download/module.json` URL.

Older releases are preserved through version-pinned GitHub assets and Foundry package entries. If automatic fallback is not available in a particular older Foundry client, users can install the older version's pinned manifest URL manually.

Repository setup required before agent use:

1. Confirm the account has Copilot access for Actions/Copilot CLI; no PAT is normally required.
2. Keep older GitHub Releases and their versioned manifest assets available for users who remain on older Foundry versions.

## License

Content based on the Pathfinder 2e Remaster ORC license.
