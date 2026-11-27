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

let failures = 0;
for (const file of fs.readdirSync(packs).filter(name => name.endsWith(".json")).sort()) {
    const jsonPath = path.join(packs, file);
    const documents = JSON.parse(fs.readFileSync(jsonPath, "utf8"));
    const dbDocuments = fs.readFileSync(jsonPath.replace(/\.json$/, ".db"), "utf8")
        .split(/\r?\n/)
        .filter(Boolean)
        .map(line => JSON.parse(line));

    if (JSON.stringify(documents) !== JSON.stringify(dbDocuments)) {
        console.error(`${file}: JSON/NEDB mismatch`);
        failures++;
    }

    const ids = new Set();
    for (const document of documents) {
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
        for (const trait of document.system?.traits?.value ?? []) {
            if (!customFeatTraits.has(trait)) continue;
            if (!new RegExp(`featTraits[\\s\\S]*?${trait}\\s*:`).test(journalScript)) {
                console.error(`${file}: ${document.name} uses unregistered custom trait ${trait}`);
                failures++;
            }
        }
    }
}

const semanticPath = path.join(root, "..", "pdf", "semantic", "gmbinder-source.txt");
const conversionPath = path.join(root, "..", "pdf", "semantic", "conversion.json");
const conversion = JSON.parse(fs.readFileSync(conversionPath, "utf8"));
const sourceHash = crypto.createHash("sha256")
    .update(fs.readFileSync(semanticPath))
    .digest("hex");
if (sourceHash !== conversion.sourceSha256) {
    console.error(`Semantic source hash mismatch: expected ${conversion.sourceSha256}, got ${sourceHash}`);
    failures++;
}

if (failures) process.exit(1);
console.log("Wilderness packs valid");
