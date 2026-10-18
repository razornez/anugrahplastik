param(
  [Parameter(Mandatory = $true)]
  [ValidatePattern('^[0-9a-f]{40}$')]
  [string]$ReleaseSha,

  [Parameter(Mandatory = $true)]
  [ValidatePattern('^[0-9a-f]{40}$')]
  [string]$RollbackSha,

  [Parameter(Mandatory = $true)]
  [ValidateRange(1, [long]::MaxValue)]
  [long]$PackageRunId,

  [Parameter(Mandatory = $true)]
  [ValidateRange(1, [long]::MaxValue)]
  [long]$RollbackRunId,

  [string]$WorkflowRef = 'codex/revamp',
  [string]$VpsHost = 'root@145.79.11.161'
)

$ErrorActionPreference = 'Stop'
$repository = 'razornez/anugrahplastik'

if ($ReleaseSha -eq $RollbackSha) {
  throw 'Release and rollback SHA must be different.'
}

$releaseDirectory = "/srv/anugrahplastik/releases/$($ReleaseSha.Substring(0, 7))-$PackageRunId"
$rollbackDirectory = "/srv/anugrahplastik/releases/$($RollbackSha.Substring(0, 7))-$RollbackRunId"
$currentDirectory = (ssh -o BatchMode=yes -o ConnectTimeout=10 $VpsHost 'readlink -f /srv/anugrahplastik/current' | Out-String).Trim()
if ($LASTEXITCODE -ne 0 -or $currentDirectory -ne $releaseDirectory) {
  throw "Production does not point to the verified release: $currentDirectory"
}

ssh -o BatchMode=yes -o ConnectTimeout=10 $VpsHost "test -s '$releaseDirectory/app/server.js' && test -s '$rollbackDirectory/app/server.js' && systemctl is-active --quiet anugrahplastik-web && systemctl is-active --quiet anugrahplastik-analytics && curl -fsS -o /dev/null http://127.0.0.1:3050/api/health"
if ($LASTEXITCODE -ne 0) {
  throw 'Production health or rollback availability check failed; no cleanup was requested.'
}

$landing = Invoke-WebRequest -Uri 'https://anugrahplastik.com/' -UseBasicParsing -TimeoutSec 20
if ($landing.StatusCode -ne 200) {
  throw "Public landing returned HTTP $($landing.StatusCode); no cleanup was requested."
}

$packageRun = gh api "repos/$repository/actions/runs/$PackageRunId" | ConvertFrom-Json
if ($LASTEXITCODE -ne 0 -or $packageRun.conclusion -ne 'success') {
  throw 'The release packaging run is not successful.'
}
$releaseArtifacts = (gh api "repos/$repository/actions/runs/$PackageRunId/artifacts?per_page=100" | ConvertFrom-Json).artifacts
if ($LASTEXITCODE -ne 0 -or -not @($releaseArtifacts | Where-Object { $_.name -eq "anugrahplastik-vps-release-$ReleaseSha" -and -not $_.expired }).Count) {
  throw 'The active release artifact is missing or expired.'
}

gh workflow run release-anugrahplastik.yml --repo $repository --ref $WorkflowRef -f "ref=$ReleaseSha" -f 'operation=cleanup' -f "rollback_sha=$RollbackSha" -f "package_run_id=$PackageRunId"
if ($LASTEXITCODE -ne 0) {
  throw 'Production is healthy, but GitHub artifact cleanup could not be queued.'
}

Write-Output "Production verified at $ReleaseSha. Artifact cleanup queued; inspect the workflow result before closing the release."
