# Copies the public website code into ..\thela-web (the GitHub repo that Netlify deploys from).
# Only website files go there: no flow/, pilot/, archive/, strategy or creators' private store files.
# Run after scripts/build.ps1, then commit and push from ..\thela-web.
$ErrorActionPreference = 'Stop'
$src = Resolve-Path (Join-Path $PSScriptRoot '..')
$dst = Join-Path (Split-Path $src -Parent) 'thela-web'
New-Item -ItemType Directory -Force $dst | Out-Null

# Clear everything except the repo's own files, so deleted pages don't linger
Get-ChildItem $dst -Force | Where-Object { $_.Name -notin '.git', 'README.md', '.gitignore', 'netlify.toml' } | Remove-Item -Recurse -Force

$files = @(
  'thela.html',
  'pages',
  'stores\_template.html', 'stores\demo.json', 'stores\_site.json', 'stores\vendor',
  'scripts\build.ps1', 'scripts\serve.ps1', 'scripts\shots.js', 'scripts\store-test.js', 'scripts\export-repo.ps1',
  'site\index.html', 'site\about.html', 'site\ad.html', 'site\media', 'site\s\demo'
)
foreach ($f in $files) {
  $from = Join-Path $src $f
  $to = Join-Path $dst $f
  New-Item -ItemType Directory -Force (Split-Path $to -Parent) | Out-Null
  Copy-Item $from $to -Recurse -Force
}
Write-Host "Exported website code to $dst"
