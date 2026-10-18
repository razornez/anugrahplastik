const ARTIFACT_PREFIX = "anugrahplastik-vps-release-";
const SHA_PATTERN = /^[0-9a-f]{40}$/;

function assertSha(value, label) {
  if (!SHA_PATTERN.test(value || "")) {
    throw new Error(`${label} must be a full, lowercase commit SHA`);
  }
}

function planArtifactCleanup(artifacts, { releaseSha, rollbackSha, activeArtifact }) {
  assertSha(releaseSha, "Release SHA");
  assertSha(rollbackSha, "Rollback SHA");
  if (releaseSha === rollbackSha) {
    throw new Error("Active and rollback releases must be different");
  }
  if (!activeArtifact || activeArtifact.name !== `${ARTIFACT_PREFIX}${releaseSha}` || activeArtifact.expired) {
    throw new Error("The successful packaging run has no usable active release artifact");
  }

  const cutoff = Date.parse(activeArtifact.created_at);
  if (!Number.isFinite(cutoff)) {
    throw new Error("Active artifact creation time is invalid");
  }

  const remove = [];
  const preserve = [];
  for (const artifact of artifacts) {
    const sha = artifact.name?.startsWith(ARTIFACT_PREFIX) ? artifact.name.slice(ARTIFACT_PREFIX.length) : "";
    const createdAt = Date.parse(artifact.created_at);
    if (
      !SHA_PATTERN.test(sha) ||
      !artifact.workflow_run?.id ||
      !Number.isFinite(createdAt) ||
      sha === releaseSha ||
      sha === rollbackSha ||
      createdAt > cutoff
    ) {
      preserve.push(artifact);
    } else {
      remove.push(artifact);
    }
  }
  return { remove, preserve };
}

async function pruneArtifacts({ github, context, core, releaseSha, rollbackSha, packageRunId }) {
  assertSha(releaseSha, "Release SHA");
  assertSha(rollbackSha, "Rollback SHA");
  if (!/^[1-9][0-9]*$/.test(packageRunId || "")) {
    throw new Error("Packaging run ID is required");
  }

  const { owner, repo } = context.repo;
  const runId = Number(packageRunId);
  if (!Number.isSafeInteger(runId)) {
    throw new Error("Packaging run ID is invalid");
  }
  const { data: run } = await github.rest.actions.getWorkflowRun({
    owner,
    repo,
    run_id: runId,
  });
  if (
    run.conclusion !== "success" ||
    !run.path?.split("@")[0].endsWith(".github/workflows/release-anugrahplastik.yml")
  ) {
    throw new Error("The specified packaging run did not complete successfully");
  }

  const runArtifacts = await github.paginate(github.rest.actions.listWorkflowRunArtifacts, {
    owner,
    repo,
    run_id: runId,
    per_page: 100,
  });
  const activeArtifact = runArtifacts.find(
    (artifact) => artifact.name === `${ARTIFACT_PREFIX}${releaseSha}` && !artifact.expired,
  );
  const allArtifacts = await github.paginate(github.rest.actions.listArtifactsForRepo, {
    owner,
    repo,
    per_page: 100,
  });
  const { remove, preserve } = planArtifactCleanup(allArtifacts, {
    releaseSha,
    rollbackSha,
    activeArtifact,
  });
  core.info(`Keeping ${preserve.length} artifacts; deleting ${remove.length} obsolete release packages.`);
  for (const artifact of remove) {
    await github.rest.actions.deleteArtifact({ owner, repo, artifact_id: artifact.id });
    core.info(`Deleted artifact ${artifact.id} (${artifact.name}).`);
  }
  core.summary.addRaw(
    `Obsolete Anugrah Plastik release artifacts removed: ${remove.length}. Active ${releaseSha}; rollback ${rollbackSha}.`,
  );
  await core.summary.write();
}

module.exports = pruneArtifacts;
module.exports.planArtifactCleanup = planArtifactCleanup;
