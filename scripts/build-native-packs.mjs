import fs from "fs";
import os from "os";
import path from "path";
import { fileURLToPath } from "url";
import { compilePack, extractPack } from "@foundryvtt/foundryvtt-cli";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const manifest = JSON.parse(fs.readFileSync(path.join(root, "module.json"), "utf8"));
const outputRoot = path.join(root, "dist");
const staging = fs.mkdtempSync(path.join(os.tmpdir(), "everything-archetypes-wilderness-packs-"));
const collection = {
    Actor: "actors",
    Item: "items",
    JournalEntry: "journal",
    Macro: "macros",
    RollTable: "tables",
    Scene: "scenes"
};

try {
    for (const pack of manifest.packs) {
        const packPath = pack.path.replace(/\.db$/, "");
        const sourcePath = path.join(root, `${packPath}.json`);
        if (!fs.existsSync(sourcePath)) {
            throw new Error(`Missing pack source ${sourcePath}`);
        }

        const documents = JSON.parse(fs.readFileSync(sourcePath, "utf8"));
        const source = path.join(staging, pack.name);
        const destination = path.join(outputRoot, packPath);
        fs.mkdirSync(source, { recursive: true });
        fs.rmSync(destination, { recursive: true, force: true });

        for (const document of documents) {
            if (!document._id) throw new Error(`${pack.name} contains a document without an ID`);
            const documentCollection = collection[pack.type];
            if (!documentCollection) throw new Error(`${pack.name} has unsupported type ${pack.type}`);
            fs.writeFileSync(
                path.join(source, `${document._id}.json`),
                `${JSON.stringify({ ...document, _key: `!${documentCollection}!${document._id}` }, null, 2)}\n`,
                "utf8"
            );
        }

        await compilePack(source, destination);
        const verification = path.join(staging, `${pack.name}-roundtrip`);
        await extractPack(destination, verification);
        const packedCount = fs.readdirSync(verification)
            .filter(file => file.endsWith(".json"))
            .length;
        if (packedCount !== documents.length) {
            throw new Error(`${pack.name} packed ${packedCount}/${documents.length} documents`);
        }
        console.log(`Built ${pack.name}: ${packedCount} documents`);
    }
} finally {
    fs.rmSync(staging, { recursive: true, force: true });
}
