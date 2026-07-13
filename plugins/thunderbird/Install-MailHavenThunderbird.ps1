# MailHaven — Thunderbird Add-on Installer (GUI)
# Installa l'estensione MailHaven Archive (mailhaven@k2tech.it) in tutti i
# profili Thunderbird dell'utente. Nessun privilegio amministratore richiesto.
# Uso da riga di comando:  -Silent  installa senza GUI  |  -Remove  disinstalla
param(
  [string]$ServerUrl = 'https://mailhaven.k2tech.it',
  [string]$ProfilesDir = "$env:APPDATA\Thunderbird",
  [switch]$Silent,
  [switch]$Remove
)

$AddonId  = 'mailhaven@k2tech.it'
$XpiName  = "$AddonId.xpi"

# Cartella dell'exe (ps2exe) o dello script
$AppDir = $PSScriptRoot
if ([string]::IsNullOrEmpty($AppDir)) { $AppDir = Split-Path -Parent ([System.Diagnostics.Process]::GetCurrentProcess().MainModule.FileName) }

function Get-TbProfiles {
  $ini = Join-Path $ProfilesDir 'profiles.ini'
  if (-not (Test-Path $ini)) { return @() }
  $profiles = @()
  $section = @{}
  foreach ($line in (Get-Content $ini) + '[end]') {
    if ($line -match '^\[') {
      if ($section['Path']) {
        $p = $section['Path']
        if ($section['IsRelative'] -eq '1' -or -not ($p -match '^[A-Za-z]:')) { $p = Join-Path $ProfilesDir ($p -replace '/', '\') }
        if (Test-Path $p) { $profiles += $p }
      }
      $section = @{}
    } elseif ($line -match '^(\w+)=(.*)$') { $section[$Matches[1]] = $Matches[2] }
  }
  return $profiles | Select-Object -Unique
}

function Get-Xpi {
  # 1) file accanto all'exe (pacchetto offline)
  $local = Join-Path $AppDir 'mailhaven.xpi'
  if (Test-Path $local) { return [System.IO.File]::ReadAllBytes($local) }
  # 2) download dal server MailHaven
  $url = $ServerUrl.TrimEnd('/') + '/api/plugin/download/thunderbird'
  try {
    [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
    return (Invoke-WebRequest -Uri $url -UseBasicParsing -TimeoutSec 20).Content
  } catch { throw "Impossibile scaricare l'estensione da $url — $($_.Exception.Message)" }
}

function Install-Xpi([byte[]]$bytes, [string[]]$profiles) {
  $done = 0
  foreach ($p in $profiles) {
    $extDir = Join-Path $p 'extensions'
    if (-not (Test-Path $extDir)) { New-Item -ItemType Directory -Force $extDir | Out-Null }
    [System.IO.File]::WriteAllBytes((Join-Path $extDir $XpiName), $bytes)
    $done++
  }
  return $done
}

function Remove-Xpi([string[]]$profiles) {
  $done = 0
  foreach ($p in $profiles) {
    $f = Join-Path $p "extensions\$XpiName"
    if (Test-Path $f) { Remove-Item -Force $f; $done++ }
  }
  return $done
}

# ── Modalità senza GUI ───────────────────────────────────────────────────────
if ($Silent -or $Remove) {
  $profiles = Get-TbProfiles
  if (-not $profiles.Count) { Write-Host 'Nessun profilo Thunderbird trovato.'; exit 1 }
  if ($Remove) { $n = Remove-Xpi $profiles; Write-Host "Estensione rimossa da $n profili."; exit 0 }
  $n = Install-Xpi (Get-Xpi) $profiles
  Write-Host "Estensione installata in $n profili. Riavvia Thunderbird e conferma l'attivazione."
  exit 0
}

# ── GUI ──────────────────────────────────────────────────────────────────────
Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing

$form = New-Object System.Windows.Forms.Form
$form.Text = 'MailHaven - Installazione plugin Thunderbird'
$form.Size = New-Object System.Drawing.Size(520, 380)
$form.StartPosition = 'CenterScreen'
$form.FormBorderStyle = 'FixedDialog'
$form.MaximizeBox = $false
$form.BackColor = [System.Drawing.Color]::White
$form.Font = New-Object System.Drawing.Font('Segoe UI', 9)

$title = New-Object System.Windows.Forms.Label
$title.Text = 'Plugin MailHaven per Thunderbird'
$title.Font = New-Object System.Drawing.Font('Segoe UI', 13, [System.Drawing.FontStyle]::Bold)
$title.Location = New-Object System.Drawing.Point(20, 16); $title.Size = New-Object System.Drawing.Size(470, 28)
$form.Controls.Add($title)

$lblUrl = New-Object System.Windows.Forms.Label
$lblUrl.Text = 'URL server MailHaven (lascia invariato se usi mailhaven.k2tech.it):'
$lblUrl.Location = New-Object System.Drawing.Point(22, 54); $lblUrl.Size = New-Object System.Drawing.Size(470, 18)
$form.Controls.Add($lblUrl)

$txtUrl = New-Object System.Windows.Forms.TextBox
$txtUrl.Location = New-Object System.Drawing.Point(22, 74); $txtUrl.Size = New-Object System.Drawing.Size(456, 24)
$txtUrl.Text = $ServerUrl
$form.Controls.Add($txtUrl)

$lblProf = New-Object System.Windows.Forms.Label
$lblProf.Location = New-Object System.Drawing.Point(22, 108); $lblProf.Size = New-Object System.Drawing.Size(470, 18)
$form.Controls.Add($lblProf)

$lst = New-Object System.Windows.Forms.ListBox
$lst.Location = New-Object System.Drawing.Point(22, 128); $lst.Size = New-Object System.Drawing.Size(456, 110)
$form.Controls.Add($lst)

$profiles = @(Get-TbProfiles)
if ($profiles.Count) {
  $lblProf.Text = "Profili Thunderbird trovati ($($profiles.Count)) — l'estensione sarà installata in tutti:"
  $profiles | ForEach-Object { [void]$lst.Items.Add($_) }
} else {
  $lblProf.Text = 'ATTENZIONE: nessun profilo Thunderbird trovato su questo PC.'
  $lblProf.ForeColor = [System.Drawing.Color]::Firebrick
}

$status = New-Object System.Windows.Forms.Label
$status.Location = New-Object System.Drawing.Point(22, 248); $status.Size = New-Object System.Drawing.Size(456, 36)
$status.ForeColor = [System.Drawing.Color]::FromArgb(70,70,80)
$status.Text = "Dopo l'installazione riavvia Thunderbird: ti chiederà di confermare l'attivazione dell'estensione."
$form.Controls.Add($status)

$btnInstall = New-Object System.Windows.Forms.Button
$btnInstall.Text = 'Installa'
$btnInstall.Location = New-Object System.Drawing.Point(22, 295); $btnInstall.Size = New-Object System.Drawing.Size(140, 34)
$btnInstall.BackColor = [System.Drawing.Color]::FromArgb(37,99,235); $btnInstall.ForeColor = [System.Drawing.Color]::White
$btnInstall.FlatStyle = 'Flat'; $btnInstall.FlatAppearance.BorderSize = 0
$btnInstall.Enabled = [bool]$profiles.Count
$form.Controls.Add($btnInstall)

$btnRemove = New-Object System.Windows.Forms.Button
$btnRemove.Text = 'Disinstalla'
$btnRemove.Location = New-Object System.Drawing.Point(172, 295); $btnRemove.Size = New-Object System.Drawing.Size(110, 34)
$btnRemove.Enabled = [bool]$profiles.Count
$form.Controls.Add($btnRemove)

$btnClose = New-Object System.Windows.Forms.Button
$btnClose.Text = 'Chiudi'
$btnClose.Location = New-Object System.Drawing.Point(388, 295); $btnClose.Size = New-Object System.Drawing.Size(90, 34)
$btnClose.Add_Click({ $form.Close() })
$form.Controls.Add($btnClose)

$btnInstall.Add_Click({
  $status.ForeColor = [System.Drawing.Color]::FromArgb(70,70,80)
  $status.Text = 'Scarico ed installo l''estensione...'
  $form.Refresh()
  try {
    $script:ServerUrl = $txtUrl.Text.Trim()
    $bytes = Get-Xpi
    $n = Install-Xpi $bytes $profiles
    $status.ForeColor = [System.Drawing.Color]::SeaGreen
    $status.Text = "Fatto! Estensione installata in $n profili.`nRiavvia Thunderbird e conferma l'attivazione quando richiesto."
  } catch {
    $status.ForeColor = [System.Drawing.Color]::Firebrick
    $status.Text = "Errore: $($_.Exception.Message)"
  }
})

$btnRemove.Add_Click({
  $n = Remove-Xpi $profiles
  $status.ForeColor = [System.Drawing.Color]::FromArgb(70,70,80)
  $status.Text = "Estensione rimossa da $n profili. Riavvia Thunderbird."
})

[void]$form.ShowDialog()
