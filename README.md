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

The daily `Watch Foundry major releases` workflow starts when a new Foundry major reaches Testing or Stable. It opens an assigned GitHub issue, which produces normal GitHub email notifications. If `COPILOT_GITHUB_TOKEN` is configured, Copilot CLI may open a draft migration PR only after local tests pass with at least 0.90 confidence. Complex or uncertain migrations stop with a detailed issue comment.

The agent cannot publish. GitHub releases build native LevelDB assets. The separate `Register Foundry package release` workflow can then validate or publish the corresponding package-listing entry. It uses the `foundry-publish` environment and is dry-run by default.

Older releases are preserved through version-pinned GitHub assets and Foundry package entries. If automatic fallback is not available in a particular older Foundry client, users can install the older version's pinned manifest URL manually.

Repository setup required before agent use:

1. Create `COPILOT_GITHUB_TOKEN` as an Actions repository secret using a fine-grained PAT with **Copilot Requests** permission.
2. Create a `foundry-publish` environment, require yourself as its reviewer, and restrict it to `main` or approved release tags.
3. Add `FOUNDRY_RELEASE_TOKEN` to that environment using this module's private Foundry package token.
4. Protect `main` with required checks and require review for migration PRs.
5. Allow Actions to create pull requests and use read/write workflow permissions.

## License

Content based on the Pathfinder 2e Remaster ORC license.
