import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

export function parseReleasePage(html) {
    const releases = [];
    const text = html.replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/\s+/g, " ");
    const pattern = /Release\s+(\d+)\.(\d+)[\s\S]{0,700}?(Full|Update)\s+(Prototype|Development|Testing|Stable)/g;
    for (const match of text.matchAll(pattern)) {
        releases.push({
            version: `${match[1]}.${match[2]}`,
            major: Number(match[1]),
            build: Number(match[2]),
            phase: match[4],
            stage: match[3],
            url: `https://foundryvtt.com/releases/${match[1]}.${match[2]}`
        });
    }
    if (!releases.length) throw new Error("Foundry release page parser found no releases");
    return releases;
}

export function findMigrationCandidate(releases, currentMaximum) {
    const maximumMajor = Number.parseInt(String(currentMaximum), 10);
    if (!Number.isInteger(maximumMajor)) throw new Error(`Invalid current maximum: ${currentMaximum}`);
    return releases
        .filter(release =>
            release.major > maximumMajor &&
            ["Testing", "Stable"].includes(release.phase)
        )
        .sort((a, b) => a.major - b.major || b.build - a.build)[0] ?? null;
    }

export async function createReport({ releaseUrl = "https://foundryvtt.com/releases/", fetchImpl = fetch } = {}) {
    const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
    const manifest = JSON.parse(fs.readFileSync(path.join(root, "module.json"), "utf8"));
    const response = await fetchImpl(releaseUrl);
    if (!response.ok) throw new Error(`Foundry release page returned ${response.status}`);
    const releases = parseReleasePage(await response.text());
    const candidate = findMigrationCandidate(releases, manifest.compatibility.maximum);
    return {
        triggered: Boolean(candidate),
        currentMaximum: manifest.compatibility.maximum,
        candidate,
        checkedAt: new Date().toISOString()
    };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
    try {
        const report = await createReport();
        console.log(JSON.stringify(report, null, 2));
    } catch (error) {
        console.error(error);
        process.exit(1);
    }
}
