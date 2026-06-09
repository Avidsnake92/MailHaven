; ============================================================
;  MailHaven — Outlook Add-in Installer
;  Inno Setup 6  |  generato automaticamente
; ============================================================

#define AppName      "MailHaven Outlook Add-in"
#define AppVersion   "1.0.0"
#define AppPublisher "K2 Tech"
#define AppURL       "https://mailhaven.k2tech.it"
#define AddInGuid    "{4D6B8A1C-2E3F-4A5B-9C7D-8E1F2A3B4C5D}"
#define DefaultUrl   "https://mailhaven.k2tech.it/api/plugin/manifest/outlook"

[Setup]
AppId={{4D6B8A1C-2E3F-4A5B-9C7D-8E1F2A3B4C5D}
AppName={#AppName}
AppVersion={#AppVersion}
AppPublisher={#AppPublisher}
AppPublisherURL={#AppURL}
AppSupportURL={#AppURL}
AppUpdatesURL={#AppURL}
DefaultDirName={userappdata}\MailHaven
DefaultGroupName=MailHaven
DisableProgramGroupPage=yes
DisableDirPage=yes
PrivilegesRequired=lowest
OutputDir=.\output
OutputBaseFilename=MailHaven-Outlook-Setup
SetupIconFile=icon.ico
WizardStyle=modern
WizardResizable=no
WizardImageFile=wizard_banner.bmp
WizardSmallImageFile=wizard_icon.bmp
UninstallDisplayIcon={userappdata}\MailHaven\unins000.exe
UninstallDisplayName={#AppName}
Compression=lzma
SolidCompression=yes
ShowLanguageDialog=no

[Languages]
Name: "italian"; MessagesFile: "compiler:Languages\Italian.isl"

[Messages]
SetupWindowTitle=Installazione %1
WelcomeLabel1=Benvenuto nel programma di installazione di [name]
WelcomeLabel2=Questo programma installerà il componente aggiuntivo MailHaven per Microsoft Outlook.%n%nIl componente aggiuntivo ti permette di archiviare le email direttamente da Outlook con un solo click.%n%nFai click su Avanti per continuare.
FinishedLabel=L'installazione di [name] è stata completata con successo.%n%nApri Microsoft Outlook per iniziare a usare MailHaven.
ClickFinish=Fai click su Fine per concludere l'installazione.

[CustomMessages]
italian.ManifestUrlLabel=URL Server MailHaven:
italian.ManifestUrlHint=(lascia invariato se usi mailhaven.k2tech.it)
italian.RestartOutlook=Riavvia Outlook automaticamente
italian.InstallSuccess=Componente aggiuntivo registrato correttamente.
italian.OutlookNotFound=Microsoft Outlook non rilevato su questo computer.%nIl componente aggiuntivo è stato installato ma potrebbe non funzionare senza Outlook.
italian.AlreadyInstalled=Il componente aggiuntivo MailHaven è già installato.%nVuoi aggiornarlo con le nuove impostazioni?

[Files]
; Nessun file da copiare — installazione solo registro

[Registry]
; Rimosso da qui, gestito via Code (per URL dinamico)

[Icons]
; Nessuna icona nel menu Start

[Code]

var
  ManifestUrlPage: TInputQueryWizardPage;
  ManifestUrl: String;
  RestartChk: TNewCheckBox;

// ── Pagina personalizzata: URL server ─────────────────────
procedure InitializeWizard();
var
  lbl: TLabel;
begin
  ManifestUrlPage := CreateInputQueryPage(
    wpWelcome,
    'Configurazione server',
    'Inserisci l''indirizzo del server MailHaven',
    'Verifica che l''URL corrisponda al server MailHaven della tua azienda.'
  );
  ManifestUrlPage.Add('URL manifest (non modificare se usi mailhaven.k2tech.it):', False);
  ManifestUrlPage.Values[0] := '{#DefaultUrl}';

  // Check per riavvio Outlook
  RestartChk := TNewCheckBox.Create(WizardForm);
  RestartChk.Parent := WizardForm.SelectDirPage;
  // Lo aggiungiamo alla pagina finale invece
end;

// ── Validazione URL ────────────────────────────────────────
function NextButtonClick(CurPageID: Integer): Boolean;
begin
  Result := True;
  if CurPageID = ManifestUrlPage.ID then begin
    ManifestUrl := Trim(ManifestUrlPage.Values[0]);
    if ManifestUrl = '' then begin
      MsgBox('Inserisci un URL valido per il server MailHaven.', mbError, MB_OK);
      Result := False;
      Exit;
    end;
    if (Pos('http://', LowerCase(ManifestUrl)) = 0) and
       (Pos('https://', LowerCase(ManifestUrl)) = 0) then begin
      MsgBox('L''URL deve iniziare con https:// oppure http://', mbError, MB_OK);
      Result := False;
      Exit;
    end;
  end;
end;

// ── Scrittura registro ──────────────────────────────────────
procedure RegisterAddIn(const Url: String);
var
  RegKey: String;
begin
  RegKey := 'Software\Microsoft\Office\16.0\WEF\Developer\{#AddInGuid}';
  RegWriteStringValue(HKCU, RegKey, 'ManifestPath', Url);
  RegWriteDWordValue(HKCU, RegKey, 'ManifestType', 1);
  RegWriteStringValue(HKCU, RegKey, 'FriendlyName', 'MailHaven');
end;

procedure UnregisterAddIn();
var
  RegKey: String;
begin
  RegKey := 'Software\Microsoft\Office\16.0\WEF\Developer\{#AddInGuid}';
  RegDeleteKeyIncludingSubkeys(HKCU, RegKey);
end;

// ── Riavvio Outlook se in esecuzione ───────────────────────
procedure TryRestartOutlook();
var
  ResultCode: Integer;
begin
  // Chiudi Outlook se aperto
  if Exec('taskkill.exe', '/F /IM OUTLOOK.EXE', '', SW_HIDE, ewWaitUntilTerminated, ResultCode) then begin
    Sleep(1500);
    // Riapri
    ShellExec('open', 'outlook.exe', '', '', SW_SHOW, ewNoWait, ResultCode);
  end;
end;

// ── Fine installazione ──────────────────────────────────────
procedure CurStepChanged(CurStep: TSetupStep);
var
  OutlookRunning: Boolean;
  Res: Integer;
begin
  if CurStep = ssPostInstall then begin
    ManifestUrl := Trim(ManifestUrlPage.Values[0]);
    if ManifestUrl = '' then
      ManifestUrl := '{#DefaultUrl}';

    RegisterAddIn(ManifestUrl);

    // Controlla se Outlook è in esecuzione
    OutlookRunning := False;
    if Exec('tasklist.exe', '/FI "IMAGENAME eq OUTLOOK.EXE" /NH', '', SW_HIDE, ewWaitUntilTerminated, Res) then
      OutlookRunning := True;  // approssimativo, ok per UX

    // Chiedi se riavviare
    if MsgBox(
      'Installazione completata!' + #13#10 + #13#10 +
      'Server: ' + ManifestUrl + #13#10 + #13#10 +
      'Vuoi riavviare Outlook adesso per attivare il componente aggiuntivo?',
      mbConfirmation, MB_YESNO
    ) = IDYES then
      TryRestartOutlook();
  end;
end;

// ── Disinstallazione ────────────────────────────────────────
procedure CurUninstallStepChanged(CurUninstallStep: TUninstallStep);
begin
  if CurUninstallStep = usPostUninstall then begin
    UnregisterAddIn();
    MsgBox('Componente aggiuntivo MailHaven rimosso.' + #13#10 + 'Riavvia Outlook per completare la rimozione.', mbInformation, MB_OK);
  end;
end;
