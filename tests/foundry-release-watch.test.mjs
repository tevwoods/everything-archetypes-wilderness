import assert from "node:assert/strict";
import test from "node:test";
import { findMigrationCandidate, parseReleasePage } from "../scripts/foundry-release-watch.mjs";

const page = `
    <h3><a>Release 15.002</a></h3><p>Full Development</p>
    <h3><a>Release 15.001</a></h3><p>Full Testing</p>
    <h3><a>Release 14.371</a></h3><p>Full Stable</p>
`;

test("parser recognizes major releases and lifecycle phases", () => {
    const releases = parseReleasePage(page);
    assert.deepEqual(
        releases.map(release => [release.version, release.phase]),
        [["15.002", "Development"], ["15.001", "Testing"], ["14.371", "Stable"]]
    );
});

test("candidate waits for Testing and ignores current major", () => {
    const releases = parseReleasePage(page);
    assert.equal(findMigrationCandidate(releases, "14").version, "15.001");
    assert.equal(findMigrationCandidate(releases, "15"), null);
});

test("parser fails loudly when the page shape changes", () => {
    assert.throws(() => parseReleasePage("<html>changed</html>"), /found no releases/);
});
