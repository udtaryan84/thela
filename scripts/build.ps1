# Builds the deployable site.
#   thela.html            -> site/index.html   (adds doctype/head/body wrapper)
#   pages/*.html          -> site/*.html       (complete pages, copied as they are)
#   site/ (pages + images) -> thela-netlify.zip and site/thela.zip (download link)
$root = Resolve-Path (Join-Path $PSScriptRoot "..")
$utf8 = New-Object Text.UTF8Encoding $false
$src = Get-Content -Raw -Encoding UTF8 "$root\thela.html"
$head = @'
<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="description" content="Stop chasing screenshots. One link for creators who sell by DM: buyers pay your own UPI, and Thela takes nothing from your sales. First month free, then ₹299 a month.">
<meta property="og:type" content="website">
<meta property="og:site_name" content="Thela">
<meta property="og:title" content="Thela: stop chasing screenshots">
<meta property="og:description" content="One link for creators who sell by DM: buyers pay your own UPI, and Thela takes nothing from your sales. First month free, then ₹299 a month.">
<meta property="og:url" content="https://thela.site/">
'@
$split = $src.IndexOf('<svg width="0"')
if ($split -lt 0) { throw "Could not find the icon sprite in thela.html; the build splits head/body there." }
$html = $head + $src.Substring(0, $split) + "</head>`n<body>`n" + $src.Substring($split) + "`n</body>`n</html>`n"

# Creator stores: stores/<name>.json + stores/_template.html -> site/s/<name>/index.html
# Files starting with "_" are not stores. "draft": true skips a store.
$tpl = Get-Content -Raw -Encoding UTF8 "$root\stores\_template.html"
$qrlib = Get-Content -Raw -Encoding UTF8 "$root\stores\vendor\qrcode.js"
$site = Get-Content -Raw -Encoding UTF8 "$root\stores\_site.json" | ConvertFrom-Json
$built = @(); $problems = @(); $storePages = @{}
foreach ($f in Get-ChildItem "$root\stores\*.json" | Where-Object { $_.Name -notlike '_*' }) {
  try { $s = Get-Content -Raw -Encoding UTF8 $f.FullName | ConvertFrom-Json }
  catch { $problems += "$($f.Name): not valid settings (check the commas, quote marks and brackets against demo.json)"; continue }
  if ($s.draft) { Write-Host "Skipped draft: $($f.Name)"; continue }
  $p = @()
  if ($s.slug -ne $f.BaseName) { $p += "slug must be '$($f.BaseName)' (the file name)" }
  if ($s.slug -notmatch '^[a-z0-9]{3,30}$') { $p += "slug: 3 to 30 lowercase letters or numbers" }
  foreach ($k in 'name', 'city', 'delivery', 'refund') { if (-not $s.$k) { $p += "missing '$k'" } }
  if (-not $s.upi.id -or -not $s.upi.payee) { $p += "missing upi id or payee name" }
  if (-not $s.products -or @($s.products).Count -eq 0) { $p += "no products" }
  foreach ($x in @($s.products)) { if (-not $x.title -or -not ($x.price -is [int] -or $x.price -is [long]) -or $x.price -lt 1) { $p += "product '$($x.title)' needs a title and a whole-rupee price" } }
  if (-not $s.demo) {
    if ($s.upi.id -notmatch '^[A-Za-z0-9._-]{2,}@[A-Za-z0-9]{2,}$') { $p += "upi id '$($s.upi.id)' doesn't look like a UPI ID" }
    if ($s.paidVia -eq 'email') { if ($s.email -notmatch '^[^\s@]+@[^\s@]+\.[^\s@]+$') { $p += "email needed when paidVia is email" } }
    elseif ($s.whatsapp -notmatch '^91[6-9][0-9]{9}$') { $p += "whatsapp must be 91 followed by the 10-digit number, digits only" }
  }
  $raw = Get-Content -Raw -Encoding UTF8 $f.FullName
  if ($raw -match '\[PLACEHOLDER') { $p += "still has [PLACEHOLDER] text" }
  if ($p.Count) { $problems += "$($f.Name): " + ($p -join '; '); continue }

  $json = $s | ConvertTo-Json -Depth 10 -Compress   # escapes < > & ' so it is safe inside <script>
  $esc = { param($t) [Net.WebUtility]::HtmlEncode([string]$t) }
  $page = $tpl.Replace('{{LANG}}', $(if ($s.lang -eq 'hi') { 'hi' } else { 'en' })).
    Replace('{{TITLE}}', (& $esc "$($s.name) on Thela")).Replace('{{DESC}}', (& $esc $s.bio)).
    Replace('{{ROBOTS}}', $(if ($s.demo -or $s.test) { '<meta name="robots" content="noindex">' } else { '' })).
    Replace('{{QRLIB}}', $qrlib).Replace('{{SITE}}', ($site | ConvertTo-Json -Compress)).Replace('{{DATA}}', $json)
  $storePages[$s.slug] = $page
  $built += $s.slug
}
# Any mistake stops the whole build before site/ is touched, so a deploy can never drop a live store.
if ($problems.Count) {
  Write-Host "NOTHING was built and site/ is unchanged. Fix these first:" -ForegroundColor Red
  $problems | ForEach-Object { Write-Host "  $_" -ForegroundColor Red }
  throw "Build stopped: $($problems.Count) store file(s) need fixing."
}

[IO.File]::WriteAllText("$root\site\index.html", $html, $utf8)
if (Test-Path "$root\site\s") { Remove-Item "$root\site\s" -Recurse -Force }
foreach ($slug in $storePages.Keys) {
  New-Item -ItemType Directory -Force "$root\site\s\$slug" | Out-Null
  [IO.File]::WriteAllText("$root\site\s\$slug\index.html", $storePages[$slug], $utf8)
}
Write-Host "Stores built: $($built -join ', ')"

$pages = @()
Get-ChildItem "$root\pages\*.html" | ForEach-Object {
  Copy-Item $_.FullName "$root\site\$($_.Name)" -Force
  $pages += "$root\site\$($_.Name)"
}

Remove-Item "$root\thela-netlify.zip", "$root\site\thela.zip" -ErrorAction SilentlyContinue
$zipItems = @("$root\site\index.html", "$root\site\images") + $pages
if (Test-Path "$root\site\s") { $zipItems += "$root\site\s" }
Compress-Archive -Path $zipItems -DestinationPath "$root\thela-netlify.zip"
Copy-Item "$root\thela-netlify.zip" "$root\site\thela.zip"
Write-Host "Built site/index.html, $($pages.Count) extra page(s) and thela-netlify.zip"
