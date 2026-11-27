const PACKS = [
    "everything-archetypes-wilderness.eaw-feats",
    "everything-archetypes-wilderness.eaw-effects"
];

class WildernessRuleHarness {
    constructor() {
        this.actors = new Set();
        this.results = [];
    }

    assert(condition, message, details = "") {
        if (!condition) throw new Error(`${message}${details ? `: ${details}` : ""}`);
    }

    async timeout(operation, milliseconds, message) {
        let timer;
        try {
            return await Promise.race([
                operation,
                new Promise((_, reject) => {
                    timer = setTimeout(() => reject(new Error(message)), milliseconds);
                })
            ]);
        } finally {
            clearTimeout(timer);
        }
    }

    async test(name, callback) {
        const before = performance.now();
        const actorsBefore = new Set(this.actors);
        try {
            await this.timeout(callback(), 15000, `${name} timed out`);
            this.results.push({ name, passed: true, duration: Math.round(performance.now() - before) });
        } catch (error) {
            console.error(`Wilderness Rule Test | ${name} failed`, error);
            this.results.push({
                name,
                passed: false,
                duration: Math.round(performance.now() - before),
                error: error.message
            });
        } finally {
            for (const actor of [...this.actors].filter(actor => !actorsBefore.has(actor))) {
                await actor.delete().catch(error => console.warn("Wilderness Rule Test cleanup", error));
                this.actors.delete(actor);
            }
        }
    }

    async actor(overrides = {}) {
        const actor = await this.timeout(Actor.create({
            name: `EAW Rule Test ${foundry.utils.randomID()}`,
            type: "character",
            ...overrides
        }), 5000, "Actor creation timed out");
        this.actors.add(actor);
        return actor;
    }

    async withChoices(choices, operation) {
        const ChoiceSet = game.pf2e.RuleElements.builtin.ChoiceSet;
        const original = ChoiceSet.prototype.preCreate;
        ChoiceSet.prototype.preCreate = async function (context) {
            if (this.selection === null) {
                const available = Array.isArray(this.choices) ? this.choices : [];
                const requested = choices[this.flag] ?? choices[this.item?.name] ?? choices.default;
                const selected = requested === undefined || requested === "__first__"
                    ? available[0]
                    : available.find(choice => choice.value === requested || choice.label === requested);
                if (selected) {
                    this.selection = context.ruleSource.selection = selected.value;
                }
            }
            return original.call(this, context);
        };
        try {
            return await operation();
        } finally {
            ChoiceSet.prototype.preCreate = original;
        }
    }

    async import(actor, source, choices = {}) {
        const [item] = await this.withChoices(choices, () =>
            actor.createEmbeddedDocuments("Item", [source.toObject()])
        );
        await new Promise(resolve => setTimeout(resolve, 50));
        this.assert(
            item.rules.length === item.system.rules.length,
            `${item.name} compiled the wrong number of rules`,
            `${item.rules.length}/${item.system.rules.length}`
        );
        for (const rule of item.rules) {
            this.assert(!rule.invalid, `${item.name} has invalid ${rule.key}`, String(rule.validationFailures ?? ""));
            this.assert(!rule.ignored, `${item.name} ignored ${rule.key}`);
        }
        return item;
    }

    async clean() {
        for (const actor of this.actors) {
            await actor.delete().catch(error => console.warn("Wilderness Rule Test cleanup", error));
        }
        this.actors.clear();
    }
}

export async function runWildernessRuleElementSuite() {
    const harness = new WildernessRuleHarness();
    const documents = [];

    for (const id of PACKS) {
        const pack = game.packs.get(id);
        if (!pack) throw new Error(`Missing compendium ${id}`);
        documents.push(...(await pack.getDocuments()).filter(document =>
            (document.system.rules?.length ?? 0) > 0
        ));
    }

    try {
        for (const source of documents) {
            await harness.test(`${source.name} compiles all Rule Elements`, async () => {
                const actor = await harness.actor();
                await harness.import(actor, source);
            });
        }

        const get = async (name, packId = "everything-archetypes-wilderness.eaw-feats") =>
            (await game.packs.get(packId).getDocuments()).find(document => document.name === name);

        await harness.test("Called Speaker Dedication upgrades Nature proficiency", async () => {
            const actor = await harness.actor();
            await harness.import(actor, await get("Called Speaker Dedication"));
            harness.assert(actor.system.skills.nature.rank === 1, "Nature was not upgraded to trained");
        });

        await harness.test("Arboreal Arms grants its spell", async () => {
            const actor = await harness.actor();
            const item = await harness.import(actor, await get("Arboreal Arms"));
            const granted = actor.items.find(candidate =>
                candidate.flags?.pf2e?.grantedBy?.id === item.id
            );
            harness.assert(granted, "Arboreal Arms did not grant its spell");
        });

        await harness.test("Aspect of Oak grants level-scaled resistances", async () => {
            const actor = await harness.actor();
            await actor.update({ "system.details.level.value": 10 });
            await harness.import(actor, await get("Aspect of Oak"));
            for (const type of ["piercing", "slashing"]) {
                const resistance = actor.attributes.resistances.find(entry => entry.type === type);
                harness.assert(resistance?.value === 5, `${type} resistance is incorrect`);
            }
        });

        await harness.test("Timeless Persuasion toggle changes Diplomacy", async () => {
            const actor = await harness.actor();
            const item = await harness.import(actor, await get("Timeless Persuasion"));
            const baseline = actor.getStatistic("diplomacy").mod;
            const toggle = item.rules.find(rule => rule.key === "RollOption");
            await toggle.toggle();
            await new Promise(resolve => setTimeout(resolve, 50));
            harness.assert(actor.getStatistic("diplomacy").mod === baseline + 2, "Diplomacy toggle delta is incorrect");
        });

        await harness.test("Terrain Specialist choice grants the selected benefit", async () => {
            const actor = await harness.actor();
            await actor.update({ "system.details.level.value": 8 });
            await harness.import(actor, await get("Terrain Specialist"), { terrainSpecialist: "arctic" });
            harness.assert(
                actor.attributes.resistances.some(entry => entry.type === "cold" && entry.value === 8),
                "Arctic specialization did not grant cold resistance"
            );
        });

        await harness.test("Extraplanar Walker choice grants tremorsense", async () => {
            const actor = await harness.actor();
            await harness.import(actor, await get("Extraplanar Walker"), { extraplanarWalker: "earth" });
            harness.assert(
                actor.perception.senses.some(sense => sense.type === "tremorsense" && sense.range === 30),
                "Plane of Earth did not grant tremorsense"
            );
        });

        await harness.test("Planar Walker choice activates the selected damage die", async () => {
            const actor = await harness.actor();
            const item = await harness.import(actor, await get("Planar Walker"), { planarWalker: "fire" });
            harness.assert(
                item.rules.some(rule => rule.key === "DamageDice" && rule.damageType === "fire" && !rule.ignored),
                "Selected Planar Walker fire damage rule was not active"
            );
        });

        await harness.test("Terrain Dominance underground grants speed and vision", async () => {
            const actor = await harness.actor();
            const item = await harness.import(actor, await get("Terrain Dominance"), {
                terrainDominance: "underground"
            });
            harness.assert(
                item.rules.some(rule => rule.key === "BaseSpeed" && rule.selector === "burrow" && !rule.ignored),
                "Underground burrow speed rule was not active"
            );
            harness.assert(
                actor.perception.senses.some(sense => sense.type === "greater-darkvision"),
                "Underground dominance did not grant greater darkvision"
            );
        });

        await harness.test("Net Charge matches the Net Gun ammunition type", async () => {
            const documents = await game.packs
                .get("everything-archetypes-wilderness.eaw-equipment")
                .getDocuments();
            const weapon = documents.find(document => document.name === "Net Gun");
            const ammo = documents.find(document => document.name === "Net Charge");
            harness.assert(weapon, "Net Gun is missing");
            harness.assert(ammo?.type === "ammo", "Net Charge is not native ammunition");
            harness.assert(
                ammo.system.baseItem === weapon.system.ammo.baseType,
                "Net Gun and Net Charge ammunition types differ"
            );
        });
    } finally {
        await harness.clean();
    }

    const failures = harness.results.filter(result => !result.passed);
    await ChatMessage.create({
        user: game.user.id,
        whisper: [game.user.id],
        content: `<h2>Wilderness Rule Element Battery</h2><p>${harness.results.length - failures.length}/${harness.results.length} passed</p>`
    });
    ui.notifications[failures.length ? "error" : "info"](
        `Wilderness Rule Element Battery: ${harness.results.length - failures.length}/${harness.results.length} passed`
    );
    console.table(harness.results);
    return { passed: failures.length === 0, results: harness.results };
}
