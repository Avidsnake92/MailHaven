<#
.SYNOPSIS
    MailHaven Restore: apre un backup .mhbak senza MailHaven ed estrae le email in file .eml.

.DESCRIPTION
    Legge un backup cifrato .mhbak (backup S3 o NAS/SFTP di MailHaven), lo decifra con la
    chiave di cifratura dell'installazione (ENCRYPTION_KEY, in /root/mailhaven/.env) e salva
    ogni email come file .eml, in una cartella per casella e sottocartelle come sul server.
    I file .eml si aprono con Outlook, Thunderbird o qualunque client di posta.

    Non serve MailHaven funzionante ne' una connessione a internet: basta il file e la chiave.
    Il backup viene letto a blocchi, quindi funziona anche con file di molti GB.
    Spazio necessario sul disco di destinazione: circa due volte la dimensione del backup
    (lo zip decifrato temporaneo piu' le email estratte).

.PARAMETER BackupFile
    Il file .mhbak da aprire.

.PARAMETER EncryptionKey
    La chiave di cifratura (64 caratteri esadecimali). Se la ometti viene chiesta a video
    senza mostrarla e senza lasciarla nella cronologia dei comandi.

.PARAMETER OutputFolder
    Dove salvare le email. Predefinita: MailHavenRestore_<data>_<ora> nella cartella corrente.

.PARAMETER NoOpen
    Non aprire la cartella in Esplora file alla fine.

.EXAMPLE
    .\MailHavenRestore.ps1 -BackupFile .\mailhaven-2026-09-29T02-00-00.mhbak

.EXAMPLE
    .\MailHavenRestore.ps1 -BackupFile D:\backup\mailhaven.mhbak -OutputFolder D:\ripristino
#>
[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)]
    [string]$BackupFile,

    [string]$EncryptionKey,

    [string]$OutputFolder,

    [switch]$NoOpen
)

$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.IO.Compression
Add-Type -AssemblyName System.IO.Compression.FileSystem

function Stop-WithError([string]$Message) {
    Write-Host ""
    Write-Host "ERRORE: $Message" -ForegroundColor Red
    exit 1
}

# Intero a 32 o 64 bit big-endian (il formato .mhbak e' scritto cosi' da Node.js)
function Read-BigEndian([System.IO.BinaryReader]$Reader, [int]$Size) {
    $b = $Reader.ReadBytes($Size)
    if ($b.Length -ne $Size) { throw "file troncato" }
    [Array]::Reverse($b)
    if ($Size -eq 2) { return [BitConverter]::ToUInt16($b, 0) }
    if ($Size -eq 4) { return [BitConverter]::ToUInt32($b, 0) }
    return [BitConverter]::ToInt64($b, 0)
}

function New-AesDecryptor([byte[]]$Key, [byte[]]$IV) {
    $aes = [System.Security.Cryptography.Aes]::Create()
    $aes.Mode = [System.Security.Cryptography.CipherMode]::CBC
    $aes.Padding = [System.Security.Cryptography.PaddingMode]::PKCS7
    $aes.Key = $Key
    $aes.IV = $IV
    return $aes.CreateDecryptor()
}

# Nome valido su Windows: niente caratteri riservati, punti o spazi finali, nomi di dispositivo
function Get-SafeName([string]$Name) {
    $n = ($Name -replace '[<>:"/\\|?*\x00-\x1f]', '_').TrimEnd('. ')
    if ($n -match '^(CON|PRN|AUX|NUL|COM\d|LPT\d)(\..*)?$') { $n = "_$n" }
    if ($n.Length -gt 120) { $n = $n.Substring(0, 120) }
    if (-not $n) { $n = '_' }
    return $n
}

Write-Host ""
Write-Host "MailHaven Restore - apre un backup .mhbak ed estrae le email" -ForegroundColor Cyan
Write-Host "K2Tech - mailhaven.it" -ForegroundColor DarkGray
Write-Host ""

# --- File e cartella di destinazione ---------------------------------------------------
$resolve = { param($p) $ExecutionContext.SessionState.Path.GetUnresolvedProviderPathFromPSPath($p) }
$BackupFile = & $resolve $BackupFile
if (-not (Test-Path -LiteralPath $BackupFile -PathType Leaf)) { Stop-WithError "file non trovato: $BackupFile" }
if (-not $OutputFolder) { $OutputFolder = "MailHavenRestore_$(Get-Date -Format 'yyyyMMdd_HHmmss')" }
$OutputFolder = & $resolve $OutputFolder

if (-not $EncryptionKey) {
    $secure = Read-Host "Chiave di cifratura (ENCRYPTION_KEY)" -AsSecureString
    $EncryptionKey = (New-Object System.Net.NetworkCredential('', $secure)).Password
}
$EncryptionKey = $EncryptionKey.Trim()
if (-not $EncryptionKey) { Stop-WithError "chiave di cifratura vuota" }
if ($EncryptionKey -notmatch '^[0-9a-fA-F]{64}$') {
    Write-Host "Attenzione: la chiave di MailHaven e' di 64 caratteri esadecimali; questa non lo e'. Provo comunque." -ForegroundColor Yellow
}

$size = (Get-Item -LiteralPath $BackupFile).Length
Write-Host ("Backup:      {0} ({1:N1} MB)" -f $BackupFile, ($size / 1MB))
Write-Host "Destinazione: $OutputFolder"
Write-Host ""

# --- Intestazione -----------------------------------------------------------------------
$fs = [System.IO.File]::OpenRead($BackupFile)
try {
    $br = [System.IO.BinaryReader]::new($fs)
    try {
        $magic = [System.Text.Encoding]::ASCII.GetString($br.ReadBytes(4))
        if ($magic -ne 'MHBK') { throw "non e' un backup MailHaven (.mhbak)" }
        $version = Read-BigEndian $br 2
        if ($version -ne 1) { throw "versione del formato non supportata: $version (aggiorna questo tool)" }
        $ivLen = Read-BigEndian $br 4
        if ($ivLen -ne 16) { throw "intestazione non valida (IV di $ivLen byte)" }
        $iv = $br.ReadBytes($ivLen)
        $saltLen = Read-BigEndian $br 4
        if ($saltLen -lt 8 -or $saltLen -gt 1024) { throw "intestazione non valida (salt di $saltLen byte)" }
        $salt = $br.ReadBytes($saltLen)
        $createdMs = Read-BigEndian $br 8
        $metaLen = Read-BigEndian $br 4
        if ($metaLen -le 0 -or $metaLen -gt 16MB) { throw "intestazione non valida (metadati di $metaLen byte)" }
        $encMeta = $br.ReadBytes([int]$metaLen)
        if ($encMeta.Length -ne $metaLen) { throw "file troncato" }
        $dataStart = $fs.Position
    } catch {
        Stop-WithError "$($_.Exception.Message)"
    }
    Write-Host "Formato .mhbak versione $version, creato il $([DateTimeOffset]::FromUnixTimeMilliseconds($createdMs).LocalDateTime.ToString('dd/MM/yyyy HH:mm'))" -ForegroundColor Green

    # --- Chiave (PBKDF2-SHA256, 100.000 iterazioni) e metadati --------------------------
    Write-Host "Verifica della chiave..."
    $kdf = [System.Security.Cryptography.Rfc2898DeriveBytes]::new(
        [System.Text.Encoding]::UTF8.GetBytes($EncryptionKey), [byte[]]$salt, 100000,
        [System.Security.Cryptography.HashAlgorithmName]::SHA256)
    $key = $kdf.GetBytes(32)
    try {
        $metaBytes = (New-AesDecryptor $key $iv).TransformFinalBlock($encMeta, 0, $encMeta.Length)
        $meta = [System.Text.Encoding]::UTF8.GetString($metaBytes) | ConvertFrom-Json
    } catch {
        Stop-WithError "chiave di cifratura non corretta per questo backup."
    }
    Write-Host "Chiave corretta. Email nel backup: $($meta.email_count)" -ForegroundColor Green

    # --- Decifratura a blocchi in uno zip temporaneo ------------------------------------
    New-Item -ItemType Directory -Path $OutputFolder -Force | Out-Null
    $tmpZip = Join-Path $OutputFolder '.mailhaven-restore.tmp.zip'
    $fs.Position = $dataStart
    $crypto = [System.Security.Cryptography.CryptoStream]::new($fs, (New-AesDecryptor $key $iv),
        [System.Security.Cryptography.CryptoStreamMode]::Read)
    $out = [System.IO.File]::Create($tmpZip)
    try {
        $buf = New-Object byte[] (4MB)
        $total = $size - $dataStart
        $step = 0
        while (($n = $crypto.Read($buf, 0, $buf.Length)) -gt 0) {
            $out.Write($buf, 0, $n)
            if ((++$step % 8) -eq 0 -and $total -gt 0) {
                $pct = [Math]::Min(100, [int](100 * ($fs.Position - $dataStart) / $total))
                Write-Progress -Activity "Decifratura del backup" -Status "$pct%" -PercentComplete $pct
            }
        }
    } catch {
        $out.Dispose()
        Remove-Item -LiteralPath $tmpZip -Force -ErrorAction SilentlyContinue
        Stop-WithError "il backup non si decifra fino in fondo: file danneggiato o incompleto."
    } finally {
        $out.Dispose()
        Write-Progress -Activity "Decifratura del backup" -Completed
    }
} finally {
    $fs.Dispose()
}
Write-Host "Backup decifrato." -ForegroundColor Green

# --- Estrazione -------------------------------------------------------------------------
$root = [System.IO.Path]::GetFullPath($OutputFolder).TrimEnd('\', '/') + [System.IO.Path]::DirectorySeparatorChar
$emails = 0; $others = 0; $skipped = 0
try {
    $zip = [System.IO.Compression.ZipFile]::OpenRead($tmpZip)
} catch {
    Remove-Item -LiteralPath $tmpZip -Force -ErrorAction SilentlyContinue
    Stop-WithError "il contenuto decifrato non e' uno zip valido: backup danneggiato."
}
try {
    $count = $zip.Entries.Count
    $i = 0
    foreach ($entry in $zip.Entries) {
        $i++
        if (($i % 200) -eq 0) {
            Write-Progress -Activity "Estrazione delle email" -Status "$i di $count" -PercentComplete ([int](100 * $i / $count))
        }
        if (-not $entry.Name) { continue }  # cartella
        $parts = @($entry.FullName -split '[\\/]' | Where-Object { $_ -and $_ -ne '.' -and $_ -ne '..' } | ForEach-Object { Get-SafeName $_ })
        if (-not $parts.Count) { $skipped++; continue }
        $target = [System.IO.Path]::GetFullPath([System.IO.Path]::Combine([string[]](@($root) + $parts)))
        if (-not $target.StartsWith($root, [StringComparison]::OrdinalIgnoreCase)) { $skipped++; continue }
        if (Test-Path -LiteralPath $target) {
            $base = [System.IO.Path]::Combine([System.IO.Path]::GetDirectoryName($target), [System.IO.Path]::GetFileNameWithoutExtension($target))
            $ext = [System.IO.Path]::GetExtension($target)
            $k = 2
            while (Test-Path -LiteralPath "$base($k)$ext") { $k++ }
            $target = "$base($k)$ext"
        }
        [System.IO.Directory]::CreateDirectory([System.IO.Path]::GetDirectoryName($target)) | Out-Null
        try {
            [System.IO.Compression.ZipFileExtensions]::ExtractToFile($entry, $target)
            if ($target.EndsWith('.eml', [StringComparison]::OrdinalIgnoreCase)) { $emails++ } else { $others++ }
        } catch {
            $skipped++
            Write-Host "  non estratta: $($entry.FullName) ($($_.Exception.Message))" -ForegroundColor Yellow
        }
    }
} finally {
    $zip.Dispose()
    Write-Progress -Activity "Estrazione delle email" -Completed
    Remove-Item -LiteralPath $tmpZip -Force -ErrorAction SilentlyContinue
}

Write-Host ""
if ($emails -eq 0) { Stop-WithError "nessuna email estratta dal backup." }
Write-Host "Ripristino completato: $emails email estratte in $OutputFolder" -ForegroundColor Green
if ($meta.email_count -and $emails -ne [int]$meta.email_count) {
    Write-Host "Attenzione: il backup dichiara $($meta.email_count) email, ne sono state estratte $emails." -ForegroundColor Yellow
}
if ($skipped) { Write-Host "Voci non estratte: $skipped" -ForegroundColor Yellow }

if (-not $NoOpen -and $env:OS -eq 'Windows_NT') { Start-Process explorer.exe -ArgumentList "`"$OutputFolder`"" }
