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
<meta name="description" content="Stop chasing screenshots. One link for creators who sell by DM: buyers pay your own UPI, and Thela takes nothing from your sales. First month free, then â‚¹299 a month.">
<meta property="og:type" content="website">
<meta property="og:site_name" content="Thela">
<meta property="og:title" content="Thela: stop chasing screenshots">
<meta property="og:description" content="One link for creators who sell by DM: buyers pay your own UPI, and Thela takes nothing from your sales. First month free, then â‚¹299 a month.">
<meta property="og:url" content="https://thela.site/">
'@
$split = $src.IndexOf('<svg width="0"')
if ($split -lt 0) { throw "Could not find the icon sprite in thela.html; the build splits head/body there." }
$html = $head + $src.Substring(0, $split) + "</head>`n<body>`n" + $src.Substring($split) + "`n</body>`n</html>`n"

# Microsoft Clarity (visitor analytics for the course tracking on shipped.money).
# Added before </head> on every public page; owner.html is left out.
$clarityId = 'zattyb8ew1'
$clarity = "<script>(function(c,l,a,r,i,t,y){c[a]=c[a]||function(){(c[a].q=c[a].q||[]).push(arguments)};t=l.createElement(r);t.async=1;t.src='https://www.clarity.ms/tag/'+i;y=l.getElementsByTagName(r)[0];y.parentNode.insertBefore(t,y);})(window,document,'clarity','script','$clarityId');</script>`n"
$addClarity = { param($t) $i = $t.IndexOf('</head>'); if ($i -lt 0) { $t } else { $t.Insert($i, $clarity) } }
$html = & $addClarity $html

# Creator stores: stores/<name>.json + stores/_template.html -> site/s/<name>/index.html
# Files starting with "_" are not stores. "draft": true skips a store.
$tpl = Get-Content -Raw -Encoding UTF8 "$root\stores\_template.html"
$qrlib = Get-Content -Raw -Encoding UTF8 "$root\stores\vendor\qrcode.js"
$site = Get-Content -Raw -Encoding UTF8 "$root\stores\_site.json" | ConvertFrom-Json
$built = @(); $problems = @(); $storePages = @{}; $storeData = @{}
foreach ($f in Get-ChildItem "$root\stores\*.json" | Where-Object { $_.Name -notlike '_*' }) {
  try { $s = Get-Content -Raw -Encoding UTF8 $f.FullName | ConvertFrom-Json }
  catch { $problems += "$($f.Name): not valid settings (check the commas, quote marks and brackets against demo.json)"; continue }
  if ($s.draft) { Write-Host "Skipped draft: $($f.Name)"; continue }
  $p = @()
  if ($s.slug -ne $f.BaseName) { $p += "slug must be '$($f.BaseName)' (the file name)" }
  if ($s.slug -notmatch '^[a-z0-9]{3,30}$') { $p += "slug: 3 to 30 lowercase letters or numbers" }
  foreach ($k in 'name', 'city', 'delivery', 'refund') { if (-not $s.$k) { $p += "missing '$k'" } }
  $checkout = $s.checkout -eq 'cashfree'
  if ($s.checkout -and -not $checkout) { $p += "checkout must be 'cashfree' or left out" }
  if ($checkout -and $s.vendorId -notmatch '^[A-Za-z0-9_-]{1,50}$') { $p += "vendorId needed for checkout (the coach's Cashfree vendor id)" }
  foreach ($x in @($s.products)) { if ($x.type -and $x.type -notin 'file', 'course', 'call', 'plan') { $p += "product '$($x.title)' type must be file, course, call or plan" } }
  if (-not $checkout -and (-not $s.upi.id -or -not $s.upi.payee)) { $p += "missing upi id or payee name" }
  if (-not $s.products -or @($s.products).Count -eq 0) { $p += "no products" }
  foreach ($x in @($s.products)) { if (-not $x.title -or -not ($x.price -is [int] -or $x.price -is [long]) -or $x.price -lt 1) { $p += "product '$($x.title)' needs a title and a whole-rupee price" } }
  if (-not $s.demo) {
    if (-not $checkout -and $s.upi.id -notmatch '^[A-Za-z0-9._-]{2,}@[A-Za-z0-9]{2,}$') { $p += "upi id '$($s.upi.id)' doesn't look like a UPI ID" }
    if ($s.upi.mc -and $s.upi.mc -notmatch '^[0-9]{4}$') { $p += "upi mc (merchant code) must be 4 digits, from the business QR" }
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
  $storePages[$s.slug] = & $addClarity $page
  # Checkout stores also get store.json: the prices and vendor id the checkout functions trust.
  # Public settings only; delivery links never go here (they live in Netlify Blobs).
  if ($checkout) {
    $storeData[$s.slug] = [ordered]@{
      slug = $s.slug; name = $s.name; lang = $(if ($s.lang -eq 'hi') { 'hi' } else { 'en' }); checkout = 'cashfree'; vendorId = $s.vendorId; easySplit = ($s.easySplit -ne $false)
      products = @($s.products | ForEach-Object { [ordered]@{ title = $_.title; price = $_.price; monthly = [bool]$_.monthly; type = $(if ($_.type) { $_.type } elseif ($_.monthly) { 'plan' } else { 'file' }) } })
    } | ConvertTo-Json -Depth 5
  }
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
  if ($storeData[$slug]) { [IO.File]::WriteAllText("$root\site\s\$slug\store.json", $storeData[$slug], $utf8) }
}
Write-Host "Stores built: $($built -join ', ')"

$pages = @()
Get-ChildItem "$root\pages\*.html" | ForEach-Object {
  $text = Get-Content -Raw -Encoding UTF8 $_.FullName
  if ($_.Name -ne 'owner.html') { $text = & $addClarity $text }
  [IO.File]::WriteAllText("$root\site\$($_.Name)", $text, $utf8)
  $pages += "$root\site\$($_.Name)"
}

Remove-Item "$root\thela-netlify.zip", "$root\site\thela.zip" -ErrorAction SilentlyContinue
$zipItems = @("$root\site\index.html", "$root\site\images") + $pages
if (Test-Path "$root\site\s") { $zipItems += "$root\site\s" }
Compress-Archive -Path $zipItems -DestinationPath "$root\thela-netlify.zip"
Copy-Item "$root\thela-netlify.zip" "$root\site\thela.zip"
Write-Host "Built site/index.html, $($pages.Count) extra page(s) and thela-netlify.zip"
