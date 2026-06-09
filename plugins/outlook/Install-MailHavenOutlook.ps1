#Requires -Version 5.0
<#
.SYNOPSIS
    Installa il plugin MailHaven per Microsoft Outlook (Classic Desktop)

.DESCRIPTION
    Registra il manifest dell'add-in MailHaven nel registro di Windows per
    Outlook 2016 / 2019 / 2021 / Microsoft 365 Classic Desktop.
    Non richiede privilegi di amministratore (usa HKCU).

.PARAMETER ManifestUrl
    URL del manifest XML. Default: https://mailhaven.k2tech.it/api/plugin/manifest/outlook

.PARAMETER Remove
    Se specificato, rimuove il plugin invece di installarlo.

.EXAMPLE
    .\Install-MailHavenOutlook.ps1
    .\Install-MailHavenOutlook.ps1 -ManifestUrl "https://mailhaven.miazienda.it/api/plugin/manifest/outlook"
    .\Install-MailHavenOutlook.ps1 -Remove
#>

param(
    [string]$ManifestUrl = "https://mailhaven.k2tech.it/api/plugin/manifest/outlook",
    [switch]$Remove
)

$ErrorActionPreference = "Stop"

# ============================================================
# Config
# ============================================================
$AddInName    = "MailHaven"
$AddInGuid    = "{4D6B8A1C-2E3F-4A5B-9C7D-8E1F2A3B4C5D}"   # GUID fisso per questo add-in
$RegBaseKey   = "HKCU:\Software\Microsoft\Office\16.0\WEF\Developer"

# ============================================================
# Banner
# ============================================================
Write-Host ""
Write-Host "  ╔══════════════════════════════════════════╗" -ForegroundColor Cyan
Write-Host "  ║   MailHaven — Outlook Add-in Installer   ║" -ForegroundColor Cyan
Write-Host "  ╚══════════════════════════════════════════╝" -ForegroundColor Cyan
Write-Host ""

# ============================================================
# Verifica Outlook installato
# ============================================================
$outlookPath = $null
$registryPaths = @(
    "HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\App Paths\OUTLOOK.EXE",
    "HKCU:\SOFTWARE\Microsoft\Windows\CurrentVersion\App Paths\OUTLOOK.EXE"
)
foreach ($p in $registryPaths) {
    if (Test-Path $p) {
        $outlookPath = (Get-ItemProperty $p)."(default)"
        break
    }
}

if (-not $outlookPath) {
    # Prova a trovare outlook.exe nei percorsi comuni
    $commonPaths = @(
        "${env:ProgramFiles}\Microsoft Office\root\Office16\OUTLOOK.EXE",
        "${env:ProgramFiles(x86)}\Microsoft Office\root\Office16\OUTLOOK.EXE",
        "${env:ProgramFiles}\Microsoft Office\Office16\OUTLOOK.EXE",
        "${env:ProgramFiles(x86)}\Microsoft Office\Office16\OUTLOOK.EXE",
        "${env:LOCALAPPDATA}\Microsoft\WindowsApps\OUTLOOK.EXE"
    )
    foreach ($p in $commonPaths) {
        if (Test-Path $p) { $outlookPath = $p; break }
    }
}

if ($outlookPath) {
    Write-Host "  [OK] Microsoft Outlook trovato:" -ForegroundColor Green
    Write-Host "       $outlookPath" -ForegroundColor Gray
} else {
    Write-Host "  [AVVISO] Microsoft Outlook non trovato sul sistema." -ForegroundColor Yellow
    Write-Host "           L'installer continuerà ma il plugin potrebbe non funzionare" -ForegroundColor Yellow
    Write-Host "           se Outlook non è installato o è la versione web." -ForegroundColor Yellow
}
Write-Host ""

# ============================================================
# Remove mode
# ============================================================
if ($Remove) {
    Write-Host "  Modalità: RIMOZIONE plugin" -ForegroundColor Yellow
    Write-Host ""
    $fullKey = Join-Path $RegBaseKey $AddInGuid
    if (Test-Path $fullKey) {
        Remove-Item -Path $fullKey -Recurse -Force
        Write-Host "  [OK] Plugin rimosso dal registro." -ForegroundColor Green
        Write-Host "       Riavvia Outlook per completare la rimozione." -ForegroundColor Gray
    } else {
        Write-Host "  [INFO] Plugin non trovato nel registro. Niente da rimuovere." -ForegroundColor Gray
    }
    Write-Host ""
    exit 0
}

# ============================================================
# Install mode
# ============================================================
Write-Host "  Manifest URL: $ManifestUrl" -ForegroundColor White
Write-Host ""

# Verifica raggiungibilità manifest (opzionale, non blocca)
Write-Host "  Verifica connessione al server MailHaven..." -ForegroundColor Gray
try {
    $response = Invoke-WebRequest -Uri $ManifestUrl -UseBasicParsing -TimeoutSec 10 -Method Head
    Write-Host "  [OK] Server raggiungibile (HTTP $($response.StatusCode))" -ForegroundColor Green
} catch {
    Write-Host "  [AVVISO] Impossibile raggiungere il server: $($_.Exception.Message)" -ForegroundColor Yellow
    Write-Host "           Assicurati di essere connesso alla rete aziendale." -ForegroundColor Yellow
}
Write-Host ""

# Crea chiave registro
Write-Host "  Registrazione add-in nel registro di sistema..." -ForegroundColor Gray

if (-not (Test-Path $RegBaseKey)) {
    New-Item -Path $RegBaseKey -Force | Out-Null
}

$fullKey = Join-Path $RegBaseKey $AddInGuid
if (-not (Test-Path $fullKey)) {
    New-Item -Path $fullKey -Force | Out-Null
}

Set-ItemProperty -Path $fullKey -Name "ManifestPath"  -Value $ManifestUrl -Type String
Set-ItemProperty -Path $fullKey -Name "ManifestType"  -Value 1            -Type DWord     # 1 = URL
Set-ItemProperty -Path $fullKey -Name "FriendlyName"  -Value $AddInName   -Type String

Write-Host "  [OK] Chiave registro creata:" -ForegroundColor Green
Write-Host "       $fullKey" -ForegroundColor Gray
Write-Host "       ManifestPath  = $ManifestUrl" -ForegroundColor Gray
Write-Host "       ManifestType  = 1 (URL)" -ForegroundColor Gray
Write-Host ""

# ============================================================
# Verifica se Outlook è in esecuzione
# ============================================================
$outlookProc = Get-Process -Name "OUTLOOK" -ErrorAction SilentlyContinue
if ($outlookProc) {
    Write-Host "  [AVVISO] Outlook è in esecuzione." -ForegroundColor Yellow
    Write-Host "           Chiudi e riapri Outlook per attivare il plugin." -ForegroundColor Yellow
    Write-Host ""
    $restart = Read-Host "  Vuoi chiudere Outlook adesso? (s/N)"
    if ($restart -eq "s" -or $restart -eq "S") {
        Write-Host "  Chiusura Outlook in corso..." -ForegroundColor Gray
        $outlookProc | Stop-Process -Force
        Start-Sleep -Seconds 2
        Write-Host "  [OK] Outlook chiuso." -ForegroundColor Green
        Write-Host ""
        $reopen = Read-Host "  Vuoi riaprire Outlook adesso? (s/N)"
        if ($reopen -eq "s" -or $reopen -eq "S") {
            if ($outlookPath -and (Test-Path $outlookPath)) {
                Start-Process $outlookPath
                Write-Host "  [OK] Outlook avviato." -ForegroundColor Green
            } else {
                Start-Process "outlook"
            }
        }
    }
} else {
    Write-Host "  [INFO] Outlook non è in esecuzione." -ForegroundColor Gray
    Write-Host "         Apri Outlook per attivare il plugin." -ForegroundColor Gray
}

# ============================================================
# Istruzioni finali
# ============================================================
Write-Host ""
Write-Host "  ════════════════════════════════════════════" -ForegroundColor Cyan
Write-Host "  Installazione completata!" -ForegroundColor Green
Write-Host "  ════════════════════════════════════════════" -ForegroundColor Cyan
Write-Host ""
Write-Host "  Come attivare il plugin in Outlook:" -ForegroundColor White
Write-Host "  1. Apri Outlook" -ForegroundColor Gray
Write-Host "  2. Vai su File → Gestisci componenti aggiuntivi" -ForegroundColor Gray
Write-Host "     oppure: Home → Componenti aggiuntivi → Ottieni componenti aggiuntivi" -ForegroundColor Gray
Write-Host "  3. Cerca 'MailHaven' e attivalo se non è già attivo" -ForegroundColor Gray
Write-Host "  4. Il pulsante MailHaven apparirà nella ribbon delle email" -ForegroundColor Gray
Write-Host ""
Write-Host "  Per rimuovere il plugin in futuro:" -ForegroundColor White
Write-Host "  .\Install-MailHavenOutlook.ps1 -Remove" -ForegroundColor Gray
Write-Host ""
