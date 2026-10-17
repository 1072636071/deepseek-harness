# WeKnora 知识库体检转发壳 —— 由 weknora-kb-ops 技能的 kb-install.ps1 生成，勿手改。
# 本文件不含任何逻辑：运行时定位全局脚本并原样转发参数。
[CmdletBinding()]
param(
  [string[]]$Kb,
  [string]$Workspace,
  [string]$Base = "http://123.206.125.149:8127/api/v1",
  [string[]]$Query = @(),
  [switch]$All,
  [switch]$Json,
  [int]$MaxPages = 50
)

$roots = @(
  "$env:USERPROFILE\.agents\skills",
  "$env:USERPROFILE\.codebuddy\skills",
  "$env:USERPROFILE\.codeartsdoer\skills",
  "$env:USERPROFILE\.trae-cn\skills",
  "$env:USERPROFILE\.qoder-cn\skills",
  "$env:USERPROFILE\.qwenworkcn\skills"
)
$target = $null
foreach ($r in $roots) {
  $p = Join-Path $r "weknora-kb-ops\scripts\kb-check.ps1"
  if (Test-Path -LiteralPath $p) { $target = $p; break }
}
if (-not $target) {
  Write-Error "未找到全局 weknora-kb-ops 技能。请先在 JwikisSkills 仓执行：node base/scripts/ship.mjs install"
  exit 2
}

# 未显式指定 -Workspace 时，回落到本转发壳所属的工作区根（scripts/ 的上一级），
# 这样从任意 cwd 调用都体检的是本项目。
$forward = @{}
foreach ($k in $PSBoundParameters.Keys) { $forward[$k] = $PSBoundParameters[$k] }
if (-not $forward.ContainsKey("Workspace")) {
  $forward["Workspace"] = Split-Path -Parent (Split-Path -Parent $PSCommandPath)
}

& $target @forward
exit $LASTEXITCODE