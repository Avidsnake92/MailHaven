# MailHaven Emergency Restore Tool
# Uso: .\MailHavenRestore.ps1 -BackupFile "mailhaven-2026-01-01.mhbak" -EncryptionKey "tuachiave" -OutputFolder "C:\restore"

param(
    [Parameter(Mandatory=$true)]
    [string]$BackupFile,
    
    [Parameter(Mandatory=$true)]
    [string]$EncryptionKey,
    
    [string]$OutputFolder = ".\MailHavenRestore_$(Get-Date -Format 'yyyyMMdd_HHmmss')"
)

Write-Host "╔══════════════════════════════════════╗" -ForegroundColor Cyan
Write-Host "║   MailHaven Emergency Restore Tool   ║" -ForegroundColor Cyan
Write-Host "║         by K2Tech - k2tech.it        ║" -ForegroundColor Cyan
Write-Host "╚══════════════════════════════════════╝" -ForegroundColor Cyan
Write-Host ""

# Verifica file
if (-not (Test-Path $BackupFile)) {
    Write-Host "ERRORE: File non trovato: $BackupFile" -ForegroundColor Red
    exit 1
}

Write-Host "File backup: $BackupFile" -ForegroundColor Yellow
Write-Host "Cartella output: $OutputFolder" -ForegroundColor Yellow
Write-Host ""

# Leggi file
Write-Host "Lettura file backup..." -ForegroundColor White
$fileBytes = [System.IO.File]::ReadAllBytes($BackupFile)

# Verifica magic number "MHBK"
$magic = [System.Text.Encoding]::ASCII.GetString($fileBytes[0..3])
if ($magic -ne "MHBK") {
    Write-Host "ERRORE: File non valido — non è un backup MailHaven" -ForegroundColor Red
    exit 1
}

Write-Host "✓ Formato .mhbak verificato" -ForegroundColor Green

# Leggi header
$offset = 4
$version = [BitConverter]::ToUInt16([byte[]]@($fileBytes[$offset+1], $fileBytes[$offset]), 0)
$offset += 2

$ivLen = [BitConverter]::ToUInt32([byte[]]@($fileBytes[$offset+3], $fileBytes[$offset+2], $fileBytes[$offset+1], $fileBytes[$offset]), 0)
$offset += 4
$iv = $fileBytes[$offset..($offset+$ivLen-1)]
$offset += $ivLen

$saltLen = [BitConverter]::ToUInt32([byte[]]@($fileBytes[$offset+3], $fileBytes[$offset+2], $fileBytes[$offset+1], $fileBytes[$offset]), 0)
$offset += 4
$salt = $fileBytes[$offset..($offset+$saltLen-1)]
$offset += $saltLen

# Salta timestamp (8 byte)
$offset += 8

$metaLen = [BitConverter]::ToUInt32([byte[]]@($fileBytes[$offset+3], $fileBytes[$offset+2], $fileBytes[$offset+1], $fileBytes[$offset]), 0)
$offset += 4
$encryptedMeta = $fileBytes[$offset..($offset+$metaLen-1)]
$offset += $metaLen

Write-Host "✓ Header letto (versione: $version)" -ForegroundColor Green

# Deriva chiave con PBKDF2
Write-Host "Derivazione chiave crittografica..." -ForegroundColor White
Add-Type -AssemblyName System.Security
$keyBytes = [System.Text.Encoding]::UTF8.GetBytes($EncryptionKey)
$pbkdf2 = New-Object System.Security.Cryptography.Rfc2898DeriveBytes($keyBytes, $salt, 100000, [System.Security.Cryptography.HashAlgorithmName]::SHA256)
$key = $pbkdf2.GetBytes(32)
Write-Host "✓ Chiave derivata" -ForegroundColor Green

# Funzione decifratura AES-256-CBC
function Decrypt-AES {
    param([byte[]]$data, [byte[]]$key, [byte[]]$iv)
    $aes = [System.Security.Cryptography.Aes]::Create()
    $aes.KeySize = 256
    $aes.BlockSize = 128
    $aes.Mode = [System.Security.Cryptography.CipherMode]::CBC
    $aes.Padding = [System.Security.Cryptography.PaddingMode]::PKCS7
    $aes.Key = $key
    $aes.IV = $iv
    $decryptor = $aes.CreateDecryptor()
    $ms = New-Object System.IO.MemoryStream
    $cs = New-Object System.Security.Cryptography.CryptoStream($ms, $decryptor, [System.Security.Cryptography.CryptoStreamMode]::Write)
    $cs.Write($data, 0, $data.Length)
    $cs.FlushFinalBlock()
    return $ms.ToArray()
}

# Decifra metadata
try {
    $metaBytes = Decrypt-AES -data $encryptedMeta -key $key -iv $iv
    $metadata = [System.Text.Encoding]::UTF8.GetString($metaBytes) | ConvertFrom-Json
    Write-Host "✓ Metadata decifrato" -ForegroundColor Green
    Write-Host "  Creato il: $($metadata.created_at)" -ForegroundColor Gray
    Write-Host "  Email totali: $($metadata.email_count)" -ForegroundColor Gray
} catch {
    Write-Host "ERRORE: Chiave di cifratura non corretta!" -ForegroundColor Red
    exit 1
}

# Decifra contenuto ZIP
Write-Host ""
Write-Host "Decifratura backup..." -ForegroundColor White
$encryptedZip = $fileBytes[$offset..($fileBytes.Length-1)]
try {
    $zipBytes = Decrypt-AES -data $encryptedZip -key $key -iv $iv
    Write-Host "✓ Backup decifrato ($([math]::Round($zipBytes.Length/1MB, 1)) MB)" -ForegroundColor Green
} catch {
    Write-Host "ERRORE: Impossibile decifrare il backup" -ForegroundColor Red
    exit 1
}

# Estrai ZIP
Write-Host ""
Write-Host "Estrazione email..." -ForegroundColor White
if (-not (Test-Path $OutputFolder)) {
    New-Item -ItemType Directory -Path $OutputFolder | Out-Null
}

Add-Type -AssemblyName System.IO.Compression.FileSystem
$ms = New-Object System.IO.MemoryStream($zipBytes, 0, $zipBytes.Length)
$zip = [System.IO.Compression.ZipArchive]::new($ms, [System.IO.Compression.ZipArchiveMode]::Read)

$count = 0
foreach ($entry in $zip.Entries) {
    if ($entry.FullName -eq '') { continue }
    $outPath = Join-Path $OutputFolder $entry.FullName
    $outDir = Split-Path $outPath -Parent
    if (-not (Test-Path $outDir)) { New-Item -ItemType Directory -Path $outDir -Force | Out-Null }
    if ($entry.Name -ne '') {
        $entryStream = $entry.Open()
        $outStream = [System.IO.File]::Create($outPath)
        $entryStream.CopyTo($outStream)
        $outStream.Close()
        $entryStream.Close()
        $count++
    }
}
$zip.Dispose()

Write-Host ""
Write-Host "═══════════════════════════════════════" -ForegroundColor Cyan
Write-Host "✓ Restore completato!" -ForegroundColor Green
Write-Host "  Email estratte: $count" -ForegroundColor White
Write-Host "  Cartella: $OutputFolder" -ForegroundColor White
Write-Host "═══════════════════════════════════════" -ForegroundColor Cyan
Write-Host ""
Write-Host "Apertura cartella..." -ForegroundColor Gray
Start-Process explorer.exe $OutputFolder
