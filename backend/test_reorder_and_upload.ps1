Write-Output "== Starting Kanban reorder & media upload tests =="

# Fetch kanban
Write-Output "Fetching /api/kanban..."
$kanban = Invoke-RestMethod -Method Get -Uri http://localhost:3000/api/kanban -ErrorAction SilentlyContinue
Write-Output "Kanban (raw):"
$kanban | ConvertTo-Json -Depth 4

if ($null -eq $kanban -or $kanban.Count -eq 0) {
  Write-Output "No kanban columns returned. Exiting reorder test."
} else {
  $col = $kanban[0]
  Write-Output "Using column id: $($col.id) title: $($col.title)"
  if (-not $col.items -or $col.items.Count -lt 2) {
    Write-Output "Not enough items in column — creating 3 leads..."
    for ($i=1; $i -le 3; $i++) {
      $b = @{ name = "Lead $i"; phone = "000$i" } | ConvertTo-Json
      Invoke-RestMethod -Method Post -Uri http://localhost:3000/api/leads -Body $b -ContentType 'application/json'
    }
    Start-Sleep -Milliseconds 300
    $kanban = Invoke-RestMethod -Method Get -Uri http://localhost:3000/api/kanban
    $col = $kanban[0]
  }
  $orig = $col.items | ForEach-Object { $_.id }
  $rev = @($orig); [array]::Reverse($rev)
  Write-Output "Original IDs: $($orig -join ',')"
  Write-Output "Reversed IDs: $($rev -join ',')"
  $payload = @{ orderedIds = $rev } | ConvertTo-Json
  Write-Output "Posting reorder to /api/kanban/column/$($col.id)/reorder"
  $resp = Invoke-RestMethod -Method Post -Uri "http://localhost:3000/api/kanban/column/$($col.id)/reorder" -Body $payload -ContentType 'application/json'
  Write-Output "Reorder response:"; $resp | ConvertTo-Json -Depth 4
  $kanban2 = Invoke-RestMethod -Method Get -Uri http://localhost:3000/api/kanban
  Write-Output "Kanban final:"; $kanban2 | ConvertTo-Json -Depth 4
}

# Upload images
Write-Output "\n== Uploading images =="
$base = "C:\Users\Dell\Downloads\ZAPVOICE\Zapflow"
$files = @("zapflow.png","zapflow_old.png")
foreach ($f in $files) {
  $p = Join-Path $base $f
  if (Test-Path $p) {
    Write-Output "Uploading $p"
    $curlCmd = "curl.exe -sS -X POST -F `"file=@$p`" http://localhost:3000/api/midias"
    Write-Output ("Running: " + $curlCmd)
    $out = Invoke-Expression $curlCmd
    Write-Output "Upload result for $f:"; $out
  } else { Write-Output "File not found: $p" }
}

Write-Output "\nListing /api/midias"
$midias = Invoke-RestMethod -Method Get -Uri http://localhost:3000/api/midias -ErrorAction SilentlyContinue
$midias | ConvertTo-Json -Depth 4

Write-Output "== Tests complete =="