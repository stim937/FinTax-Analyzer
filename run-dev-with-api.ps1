$ErrorActionPreference = 'Stop'

Set-Location $PSScriptRoot

$envFile = Join-Path $PSScriptRoot '.env.local'

if (-not (Test-Path $envFile)) {
  Write-Host '[FinTax Analyzer] .env.local 파일을 찾을 수 없습니다.' -ForegroundColor Red
  exit 1
}

$loadedKeys = @()

foreach ($line in Get-Content $envFile) {
  $trimmed = $line.Trim()

  if (-not $trimmed -or $trimmed.StartsWith('#')) {
    continue
  }

  $pair = $trimmed -split '=', 2
  if ($pair.Count -ne 2) {
    continue
  }

  $key = $pair[0].Trim()
  $value = $pair[1]

  if (($value.StartsWith('"') -and $value.EndsWith('"')) -or ($value.StartsWith("'") -and $value.EndsWith("'"))) {
    $value = $value.Substring(1, $value.Length - 2)
  }

  [System.Environment]::SetEnvironmentVariable($key, $value, 'Process')
  $loadedKeys += $key
}

Write-Host '[FinTax Analyzer] Loaded environment keys from .env.local' -ForegroundColor Green
foreach ($key in $loadedKeys) {
  Write-Host "  - $key" -ForegroundColor Cyan
}

Write-Host ''
Write-Host '[FinTax Analyzer] Starting integrated Vercel dev server...' -ForegroundColor Green
Write-Host '  App + API: http://127.0.0.1:3000' -ForegroundColor Yellow
Write-Host ''

npx vercel dev --listen 3000
