param([string]$Destination = (Join-Path "backups" (Get-Date -Format "yyyyMMdd-HHmmss")))

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest
$target = [System.IO.Path]::GetFullPath($Destination)
New-Item -ItemType Directory -Force -Path $target | Out-Null

$postgres = docker compose ps -q postgres
if (-not $postgres) { throw "Start the PostgreSQL service before taking a backup." }
docker compose exec -T postgres pg_dump -U bhramari -d bhramari -Fc -f /tmp/bhramari.dump
docker cp "${postgres}:/tmp/bhramari.dump" (Join-Path $target "database.dump")
docker compose exec -T postgres rm -f /tmp/bhramari.dump

$volumes = @("evidence-data", "ledger-data", "object-data", "keycloak-data")
foreach ($volume in $volumes) {
  docker run --rm -v "bhramari_${volume}:/source:ro" -v "${target}:/backup" alpine:3.20 tar czf "/backup/${volume}.tgz" -C /source .
}

$files = Get-ChildItem -File $target | ForEach-Object {
  @{ name = $_.Name; sha256 = (Get-FileHash -Algorithm SHA256 $_.FullName).Hash.ToLowerInvariant() }
}
@{ created_at = (Get-Date).ToUniversalTime().ToString("o"); files = $files } |
  ConvertTo-Json -Depth 3 | Set-Content -Encoding utf8 (Join-Path $target "manifest.json")
Write-Host "Backup created at $target"
