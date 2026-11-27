# Everything Archetypes: Wilderness

A Foundry VTT module for Pathfinder 2e (Remastered) providing expanded archetype feats, spells, and equipment for wilderness-themed archetypes.

## Contents

- **130 Archetype Feats** across 10 wilderness archetypes
- **6 Custom Spells**
- **9 Equipment Items**, including native Net Gun ammunition
- **28 Automation Effects**
- **10 Companion Actions**
- **6 Utility Macros**

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

The live PF2e acceptance battery is available at `macros/test-wilderness-rule-elements.js`. In Foundry:

```js
const suite = await import(
  "/modules/everything-archetypes-wilderness/macros/test-wilderness-rule-elements.js"
);
await suite.runWildernessRuleElementSuite();
```

## License

Content based on the Pathfinder 2e Remaster ORC license.
