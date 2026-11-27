const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const root = path.resolve(__dirname, "..");
const packs = path.join(root, "packs", "Everything-Archetypes-Wilderness");
const legacyTerms = [
    /\bflat-footed\b/i,
    /\bcounteract level\b/i,
    /\bpositive energy\b/i,
    /\bnegative energy\b/i,
    /\bendure elements\b/i
];
const customFeatTraits = new Set(["trick"]);
const journalScript = fs.readFileSync(path.join(root, "scripts", "journal-injection.js"), "utf8");
const expectedCounts = new Map([
    ["eaw-actions.json", 10],
    ["eaw-effects.json", 28],
    ["eaw-equipment.json", 9],
    ["eaw-feats.json", 130],
    ["eaw-macros.json", 6],
    ["eaw-spells.json", 6]
]);

let failures = 0;
let ruleDocuments = 0;
let ruleElements = 0;
for (const file of fs.readdirSync(packs).filter(name => name.endsWith(".json")).sort()) {
    const jsonPath = path.join(packs, file);
    const documents = JSON.parse(fs.readFileSync(jsonPath, "utf8"));
    const dbDocuments = fs.readFileSync(jsonPath.replace(/\.json$/, ".db"), "utf8")
        .split(/\r?\n/)
        .filter(Boolean)
        .map(line => JSON.parse(line));

    if (documents.length !== expectedCounts.get(file)) {
        console.error(`${file}: expected ${expectedCounts.get(file)} documents, got ${documents.length}`);
        failures++;
    }

    if (JSON.stringify(documents) !== JSON.stringify(dbDocuments)) {
        console.error(`${file}: JSON/NEDB mismatch`);
        failures++;
    }

    const ids = new Set();
    for (const document of documents) {
        const rules = document.system?.rules ?? [];
        if (rules.length) {
            ruleDocuments++;
            ruleElements += rules.length;
        }
        if (!/^[A-Za-z0-9]{16}$/.test(document._id ?? "")) {
            console.error(`${file}: invalid ID for ${document.name}`);
            failures++;
        }
        if (ids.has(document._id)) {
            console.error(`${file}: duplicate ID ${document._id}`);
            failures++;
        }
        ids.add(document._id);

        const modifiedBy = document._stats?.lastModifiedBy;
        if (modifiedBy && !/^[A-Za-z0-9]{16}$/.test(modifiedBy)) {
            console.error(`${file}: invalid lastModifiedBy for ${document.name}`);
            failures++;
        }

        const description = document.system?.description?.value ?? "";
        for (const term of legacyTerms) {
            if (term.test(description)) {
                console.error(`${file}: ${document.name} contains ${term}`);
                failures++;
            }
        }
        if (document.system?.rules?.some(rule => rule.predicate && !Array.isArray(rule.predicate))) {
            console.error(`${file}: ${document.name} has a non-array predicate`);
            failures++;
        }
        if (document.system?.rules?.some(rule =>
            rule.key === "Sense" && rule.acuity && rule.range === undefined
        )) {
            console.error(`${file}: ${document.name} has a ranged Sense rule without range`);
            failures++;
        }
        for (const trait of document.system?.traits?.value ?? []) {
            if (!customFeatTraits.has(trait)) continue;
            if (!new RegExp(`featTraits[\\s\\S]*?${trait}\\s*:`).test(journalScript)) {
                console.error(`${file}: ${document.name} uses unregistered custom trait ${trait}`);
                failures++;
            }
        }
        const ammoType = document.system?.baseItem;
        if (document.type === "ammo" && !journalScript.includes(`'${ammoType}':`)) {
            console.error(`${file}: ${document.name} uses unregistered ammunition type ${ammoType}`);
            failures++;
        }
    }
}

if (ruleDocuments !== 78 || ruleElements !== 144) {
    console.error(`Expected 78 rule-bearing documents and 144 Rule Elements, got ${ruleDocuments}/${ruleElements}`);
    failures++;
}

if (!fs.existsSync(path.join(root, "macros", "test-wilderness-rule-elements.js"))) {
    console.error("Live Wilderness Rule Element battery is missing");
    failures++;
}

const localSemanticPath = path.join(root, "gmbinder-markdown.txt");
const workspaceSemanticPath = path.join(root, "..", "pdf", "semantic", "gmbinder-source.txt");
const expectedHashPath = path.join(root, "scripts", "semantic-source.sha256");
const expectedHash = fs.readFileSync(expectedHashPath, "utf8").trim().toLowerCase();
const sourcePath = fs.existsSync(workspaceSemanticPath) ? workspaceSemanticPath : localSemanticPath;
const sourceHash = crypto.createHash("sha256")
    .update(fs.readFileSync(sourcePath, "utf8").replace(/\r\n/g, "\n"))
    .digest("hex");
if (sourceHash !== expectedHash) {
    console.error(`Semantic source hash mismatch: expected ${expectedHash}, got ${sourceHash}`);
    failures++;
}

if (failures) process.exit(1);
console.log("Wilderness packs valid");
