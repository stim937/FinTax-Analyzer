$ErrorActionPreference = 'Stop'

Set-Location $PSScriptRoot

function Find-CommandPath {
  param([string]$Name)

  $command = Get-Command $Name -ErrorAction SilentlyContinue
  if ($command) {
    return $command.Source
  }

  return $null
}

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

$nodePath = Find-CommandPath 'node'
if (-not $nodePath) {
  $bundledNode = 'C:\Users\HOME\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe'
  if (Test-Path $bundledNode) {
    $nodePath = $bundledNode
  }
}

if (-not $nodePath) {
  Write-Host '[FinTax Analyzer] node 실행 파일을 찾을 수 없습니다.' -ForegroundColor Red
  Write-Host '  Node.js가 PATH에 없으면 실행이 불가합니다.' -ForegroundColor Yellow
  exit 1
}

$vercelCli = Join-Path $PSScriptRoot 'node_modules\vercel\dist\vc.js'
if (-not (Test-Path $vercelCli)) {
  $npxPath = Find-CommandPath 'npx'

  if ($npxPath) {
    & $npxPath vercel dev --listen 3000
    exit $LASTEXITCODE
  }

  Write-Host '[FinTax Analyzer] 로컬 Vercel CLI를 찾을 수 없습니다.' -ForegroundColor Red
  Write-Host '  먼저 npm install 로 devDependencies(vercel 포함)를 설치하세요.' -ForegroundColor Yellow
  exit 1
}

& $nodePath $vercelCli dev --listen 3000
exit $LASTEXITCODE
