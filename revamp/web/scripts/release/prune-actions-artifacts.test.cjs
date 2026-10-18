/* eslint-disable @typescript-eslint/no-require-imports -- github-script loads this CommonJS module. */
const assert = require("node:assert/strict");
const test = require("node:test");
const pruneArtifacts = require("./prune-actions-artifacts.cjs");
const { planArtifactCleanup } = pruneArtifacts;

const activeSha = "a".repeat(40);
const rollbackSha = "b".repeat(40);
const oldSha = "c".repeat(40);
const newerSha = "d".repeat(40);
const prefix = "anugrahplastik-vps-release-";

function artifact(id, sha, createdAt, overrides = {}) {
  return {
    id,
    name: `${prefix}${sha}`,
    created_at: createdAt,
    workflow_run: { id },
    expired: false,
    ...overrides,
  };
}

test("keeps live, rollback, and newer candidates; removes only old scoped packages", () => {
  const activeArtifact = artifact(1, activeSha, "2026-10-16T03:34:47Z");
  const artifacts = [
    activeArtifact,
    artifact(2, rollbackSha, "2026-10-15T09:01:44Z"),
    artifact(3, oldSha, "2026-10-14T12:00:00Z"),
    artifact(4, newerSha, "2026-10-17T12:00:00Z"),
    artifact(5, oldSha, "2026-10-14T12:00:00Z", { name: "another-project" }),
    artifact(6, oldSha, "2026-10-14T12:00:00Z", { workflow_run: null }),
  ];
  const plan = planArtifactCleanup(artifacts, { releaseSha: activeSha, rollbackSha, activeArtifact });
  assert.deepEqual(
    plan.remove.map((item) => item.id),
    [3],
  );
  assert.deepEqual(
    plan.preserve.map((item) => item.id),
    [1, 2, 4, 5, 6],
  );
});

test("fails closed without a valid active artifact or two distinct full SHAs", () => {
  const activeArtifact = artifact(1, activeSha, "2026-10-16T03:34:47Z");
  assert.throws(() =>
    planArtifactCleanup([], {
      releaseSha: activeSha,
      rollbackSha: activeSha,
      activeArtifact,
    }),
  );
  assert.throws(() =>
    planArtifactCleanup([], {
      releaseSha: activeSha,
      rollbackSha: rollbackSha,
      activeArtifact: { ...activeArtifact, expired: true },
    }),
  );
  assert.throws(() =>
    planArtifactCleanup([], {
      releaseSha: "short",
      rollbackSha,
      activeArtifact,
    }),
  );
});

test("deletes only obsolete packages after verifying the successful packaging run", async () => {
  const activeArtifact = artifact(1, activeSha, "2026-10-16T03:34:47Z");
  const deleted = [];
  const listWorkflowRunArtifacts = () => {};
  const listArtifactsForRepo = () => {};
  const github = {
    rest: {
      actions: {
        getWorkflowRun: async () => ({
          data: {
            conclusion: "success",
            path: ".github/workflows/release-anugrahplastik.yml",
          },
        }),
        listWorkflowRunArtifacts,
        listArtifactsForRepo,
        deleteArtifact: async ({ artifact_id }) => deleted.push(artifact_id),
      },
    },
    paginate: async (method) =>
      method === listWorkflowRunArtifacts
        ? [activeArtifact]
        : [
            activeArtifact,
            artifact(2, rollbackSha, "2026-10-15T09:01:44Z"),
            artifact(3, oldSha, "2026-10-14T12:00:00Z"),
          ],
  };
  const core = { info() {}, summary: { addRaw() {}, async write() {} } };
  await pruneArtifacts({
    github,
    context: { repo: { owner: "razornez", repo: "anugrahplastik" } },
    core,
    releaseSha: activeSha,
    rollbackSha,
    packageRunId: "123",
  });
  assert.deepEqual(deleted, [3]);
});

test("never deletes anything when the packaging run has not succeeded", async () => {
  let deleteCalled = false;
  const github = {
    rest: {
      actions: {
        getWorkflowRun: async () => ({
          data: { conclusion: "failure", path: ".github/workflows/release-anugrahplastik.yml" },
        }),
        deleteArtifact: async () => {
          deleteCalled = true;
        },
      },
    },
  };
  await assert.rejects(
    pruneArtifacts({
      github,
      context: { repo: { owner: "razornez", repo: "anugrahplastik" } },
      core: {},
      releaseSha: activeSha,
      rollbackSha,
      packageRunId: "123",
    }),
  );
  assert.equal(deleteCalled, false);
});
