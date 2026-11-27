import process from "process";

const repository = process.env.GITHUB_REPOSITORY;
const token = process.env.FOUNDRY_RELEASE_TOKEN;
const tag = process.argv[2];
const dryRun = process.argv[3] !== "publish";

if (!repository) throw new Error("GITHUB_REPOSITORY is required");
if (!token) throw new Error("FOUNDRY_RELEASE_TOKEN is required");
if (!tag || !/^v\d+\.\d+\.\d+(?:-.+)?$/.test(tag)) {
    throw new Error("Provide a release tag such as v1.2.3");
}

const manifestUrl = `https://github.com/${repository}/releases/download/${tag}/module.json`;
const notesUrl = `https://github.com/${repository}/releases/tag/${tag}`;
const response = await fetch(manifestUrl);
if (!response.ok) throw new Error(`Release manifest returned ${response.status}: ${manifestUrl}`);
const manifest = await response.json();

const releaseRequest = {
    id: manifest.id,
    "dry-run": dryRun,
    release: {
        version: manifest.version,
        manifest: manifestUrl,
        notes: notesUrl,
        compatibility: {
            minimum: manifest.compatibility.minimum,
            verified: manifest.compatibility.verified,
            maximum: manifest.compatibility.maximum
        }
    }
};

const result = await fetch("https://foundryvtt.com/_api/packages/release_version/", {
    method: "POST",
    headers: {
        Authorization: token,
        "Content-Type": "application/json"
    },
    body: JSON.stringify(releaseRequest)
});
const body = await result.text();
if (!result.ok) throw new Error(`Foundry release registration failed (${result.status}): ${body}`);
console.log(JSON.stringify({
    dryRun,
    manifest: manifestUrl,
    result: body
}, null, 2));
