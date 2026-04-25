param(
  [Parameter(Mandatory = $true, Position = 0)]
  [string]$CommitMessage,

  [Parameter(Position = 1)]
  [string]$PrTitle,

  [string]$BaseBranch = 'main',

  [switch]$Ready,

  [switch]$Merge
)

$ErrorActionPreference = 'Stop'

Set-Location (Join-Path $PSScriptRoot '..')

function Require-Command {
  param([string]$Name)

  if (-not (Get-Command $Name -ErrorAction SilentlyContinue)) {
    throw "'$Name' 명령을 찾을 수 없습니다."
  }
}

Require-Command git
Require-Command gh

$branch = (git branch --show-current).Trim()
if (-not $branch) {
  throw '현재 Git 브랜치를 확인할 수 없습니다.'
}

if ($branch -eq $BaseBranch) {
  throw "현재 브랜치가 '$BaseBranch' 입니다. 별도 작업 브랜치에서 실행하세요."
}

if (-not $PrTitle) {
  $PrTitle = $CommitMessage
}

if ($Merge) {
  $Ready = $true
}

$status = git status --porcelain
if ($LASTEXITCODE -ne 0) {
  throw 'git status 실행에 실패했습니다.'
}

if ($status) {
  Write-Host "[publish-pr] 변경사항을 스테이징합니다..." -ForegroundColor Cyan
  git add -A
  if ($LASTEXITCODE -ne 0) {
    throw 'git add 실행에 실패했습니다.'
  }

  git diff --cached --quiet
  if ($LASTEXITCODE -gt 1) {
    throw '스테이징된 변경사항 확인에 실패했습니다.'
  }

  if ($LASTEXITCODE -eq 0) {
    Write-Host '[publish-pr] 스테이징된 변경사항이 없습니다. 커밋을 건너뜁니다.' -ForegroundColor Yellow
  } else {
  Write-Host "[publish-pr] 커밋을 생성합니다..." -ForegroundColor Cyan
    git commit -m $CommitMessage
    if ($LASTEXITCODE -ne 0) {
      throw 'git commit 실행에 실패했습니다.'
    }
  }
} else {
  Write-Host '[publish-pr] 작업 트리가 깨끗합니다. 새 커밋 없이 진행합니다.' -ForegroundColor Yellow
}

Write-Host "[publish-pr] 브랜치 '$branch' 를 푸시합니다..." -ForegroundColor Cyan
git push -u origin $branch
if ($LASTEXITCODE -ne 0) {
  throw 'git push 실행에 실패했습니다.'
}

$existingPrJson = gh pr list --head $branch --base $BaseBranch --json number,title,url,state,isDraft
if ($LASTEXITCODE -ne 0) {
  throw '기존 PR 조회에 실패했습니다.'
}

$existingPr = $existingPrJson | ConvertFrom-Json
if ($existingPr.Count -gt 0) {
  $prNumber = $existingPr[0].number
  $prUrl = $existingPr[0].url
  Write-Host "[publish-pr] 기존 PR이 이미 존재합니다: $prUrl" -ForegroundColor Yellow
} else {
  $body = @"
## 변경 요약
- $CommitMessage

## 변경 이유
- 현재 작업 브랜치 변경사항을 main에 반영하기 위한 자동화 실행입니다.

## 테스트 방법
- 필요 시 로컬에서 관련 명령으로 확인

## 체크리스트
- [ ] npm run lint
- [ ] npm run build
"@

  $bodyFile = Join-Path $PWD 'tmp-pr-body.md'
  [System.IO.File]::WriteAllText($bodyFile, $body, [System.Text.UTF8Encoding]::new($false))

  try {
    Write-Host "[publish-pr] PR을 생성합니다..." -ForegroundColor Cyan
    if ($Ready) {
      $prUrl = gh pr create --base $BaseBranch --head $branch --title $PrTitle --body-file $bodyFile
    } else {
      $prUrl = gh pr create --base $BaseBranch --head $branch --draft --title $PrTitle --body-file $bodyFile
    }

    if ($LASTEXITCODE -ne 0) {
      throw 'gh pr create 실행에 실패했습니다.'
    }
  } finally {
    Remove-Item -LiteralPath $bodyFile -ErrorAction SilentlyContinue
  }

  $prJson = gh pr view $prUrl --json number,url
  if ($LASTEXITCODE -ne 0) {
    throw '생성된 PR 조회에 실패했습니다.'
  }

  $pr = $prJson | ConvertFrom-Json
  $prNumber = $pr.number
  $prUrl = $pr.url
}

if ($Merge) {
  Write-Host "[publish-pr] PR #$prNumber 을 일반 병합합니다..." -ForegroundColor Cyan
  gh pr merge $prNumber --merge
  if ($LASTEXITCODE -ne 0) {
    throw 'gh pr merge 실행에 실패했습니다.'
  }

  Write-Host "[publish-pr] 원격 브랜치 '$branch' 를 삭제합니다..." -ForegroundColor Cyan
  $remoteBranch = git ls-remote --heads origin $branch
  if ($LASTEXITCODE -ne 0) {
    throw '원격 브랜치 조회에 실패했습니다.'
  }

  if ($remoteBranch) {
    git push origin --delete $branch
    if ($LASTEXITCODE -ne 0) {
      throw '원격 브랜치 삭제에 실패했습니다.'
    }
  } else {
    Write-Host "[publish-pr] 원격 브랜치 '$branch' 가 이미 삭제되어 있습니다." -ForegroundColor Yellow
  }

  Write-Host "[publish-pr] origin/$BaseBranch 기준 detached HEAD로 정리합니다..." -ForegroundColor Cyan
  git fetch --prune origin $BaseBranch
  if ($LASTEXITCODE -ne 0) {
    throw 'base 브랜치 갱신에 실패했습니다.'
  }

  git switch --detach "origin/$BaseBranch"
  if ($LASTEXITCODE -ne 0) {
    throw 'detached HEAD 전환에 실패했습니다.'
  }
}

Write-Host "[publish-pr] 완료: $prUrl" -ForegroundColor Green
