import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { spawnSync } from "child_process";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const dist = path.join(root, "dist");

fs.rmSync(dist, { recursive: true, force: true });
fs.mkdirSync(dist, { recursive: true });
fs.copyFileSync(path.join(root, "module.json"), path.join(dist, "module.json"));
fs.cpSync(path.join(root, "lang"), path.join(dist, "lang"), { recursive: true });
fs.mkdirSync(path.join(dist, "scripts"), { recursive: true });
for (const file of ["journal-injection.js", "journal-injection-data.json"]) {
    fs.copyFileSync(path.join(root, "scripts", file), path.join(dist, "scripts", file));
}
fs.copyFileSync(path.join(root, "README.md"), path.join(dist, "README.md"));
if (fs.existsSync(path.join(root, "LICENSE"))) {
    fs.copyFileSync(path.join(root, "LICENSE"), path.join(dist, "LICENSE"));
}

const result = spawnSync(process.execPath, ["scripts/build-native-packs.mjs"], {
    cwd: root,
    stdio: "inherit"
});
if (result.status !== 0) process.exit(result.status ?? 1);
