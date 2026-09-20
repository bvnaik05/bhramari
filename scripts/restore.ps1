param(
  [Parameter(Mandatory = $true)][string]$Source,
  [switch]$ConfirmRestore
)

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest
if (-not $ConfirmRestore) { throw "Restore replaces current Bhramari data. Re-run with -ConfirmRestore." }
$sourcePath = [System.IO.Path]::GetFullPath($Source)
$manifest = Get-Content -Raw (Join-Path $sourcePath "manifest.json") | ConvertFrom-Json
foreach ($file in $manifest.files) {
  $actual = (Get-FileHash -Algorithm SHA256 (Join-Path $sourcePath $file.name)).Hash.ToLowerInvariant()
  if ($actual -ne $file.sha256) { throw "Backup checksum failed for $($file.name)." }
}

docker compose up -d postgres
$postgres = docker compose ps -q postgres
if (-not $postgres) { throw "PostgreSQL did not start." }
docker cp (Join-Path $sourcePath "database.dump") "${postgres}:/tmp/bhramari.dump"
docker compose exec -T postgres pg_restore -U bhramari -d bhramari --clean --if-exists /tmp/bhramari.dump
docker compose down

$volumes = @("evidence-data", "ledger-data", "object-data", "keycloak-data")
foreach ($volume in $volumes) {
  docker volume rm -f "bhramari_${volume}" | Out-Null
  docker volume create "bhramari_${volume}" | Out-Null
  docker run --rm -v "bhramari_${volume}:/target" -v "${sourcePath}:/backup:ro" alpine:3.20 tar xzf "/backup/${volume}.tgz" -C /target
}
docker compose up -d
Write-Host "Restore complete. Verify health, sign-in, evidence download, and an anchored proof."
