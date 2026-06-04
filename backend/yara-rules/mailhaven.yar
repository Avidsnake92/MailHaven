
/*
    MailHaven YARA Rules
    Rileva minacce comuni negli allegati email
*/

// ?? Eseguibili Windows ??????????????????????????????????????????????????????
rule PE_Executable {
    meta:
        description = "File eseguibile Windows (PE)"
        severity = "high"
        category = "executable"
    strings:
         = { 4D 5A }
    condition:
         at 0 and filesize < 50MB
}

rule ELF_Executable {
    meta:
        description = "File eseguibile Linux (ELF)"
        severity = "high"
        category = "executable"
    strings:
         = { 7F 45 4C 46 }
    condition:
         at 0
}

// ?? Macro Office sospette ???????????????????????????????????????????????????
rule Office_Macro_AutoOpen {
    meta:
        description = "Documento Office con macro AutoOpen/AutoExec"
        severity = "medium"
        category = "macro"
    strings:
         = "AutoOpen" nocase
         = "AutoExec" nocase
         = "Document_Open" nocase
         = "Workbook_Open" nocase
         = "VBA" nocase
    condition:
         and any of (, , , )
}

rule Office_Macro_Shell {
    meta:
        description = "Macro Office con chiamate Shell sospette"
        severity = "high"
        category = "macro"
    strings:
         = "Shell(" nocase
         = "WScript.Shell" nocase
         = "CreateObject" nocase
         = "PowerShell" nocase
         = "cmd.exe" nocase
         = "mshta" nocase
         = "VBA" nocase
    condition:
         and 2 of (, , , , , )
}

// ?? Script sospetti ?????????????????????????????????????????????????????????
rule PowerShell_Encoded {
    meta:
        description = "Script PowerShell con payload Base64 codificato"
        severity = "high"
        category = "script"
    strings:
         = "powershell" nocase
         = "-encodedcommand" nocase
         = "-enc " nocase
         = "FromBase64String" nocase
         = "IEX" nocase
         = "Invoke-Expression" nocase
    condition:
         and any of (, , ) and any of (, )
}

rule VBScript_Suspicious {
    meta:
        description = "VBScript con pattern sospetti"
        severity = "medium"
        category = "script"
    strings:
         = "CreateObject" nocase
         = "WScript.Shell" nocase
         = "Shell(" nocase
         = "Execute" nocase
         = "Eval(" nocase
         = ".vbs" nocase
    condition:
        ( or uint16(0) == 0x4D5A) and 2 of (, , , , )
}

// ?? Phishing e HTML sospetto ?????????????????????????????????????????????????
rule HTML_Credential_Harvest {
    meta:
        description = "Pagina HTML con form di cattura credenziali"
        severity = "medium"
        category = "phishing"
    strings:
         = "<form" nocase
         = "password" nocase
         = "login" nocase
         = "signin" nocase
         = "<input" nocase
         = "submit" nocase
         = "<html" nocase
    condition:
         and  and  and  and ( or ) and 
}

rule HTML_Obfuscated_JS {
    meta:
        description = "HTML con JavaScript offuscato"
        severity = "medium"
        category = "phishing"
    strings:
         = "eval(" nocase
         = "unescape(" nocase
         = "String.fromCharCode" nocase
         = "atob(" nocase
         = "<script" nocase
    condition:
         and 2 of (, , , )
}

// ?? Archive sospetti ?????????????????????????????????????????????????????????
rule ZIP_With_Executable {
    meta:
        description = "Archivio ZIP contenente eseguibile"
        severity = "medium"
        category = "archive"
    strings:
         = { 50 4B 03 04 }
         = ".exe" nocase
         = ".dll" nocase
         = ".scr" nocase
    condition:
         at 0 and any of (, , )
}

// ?? PDF sospetti ?????????????????????????????????????????????????????????????
rule PDF_Embedded_Script {
    meta:
        description = "PDF con JavaScript incorporato"
        severity = "medium"
        category = "pdf"
    strings:
         = "%PDF"
         = "/JavaScript" nocase
         = "/JS " nocase
         = "/OpenAction" nocase
         = "/Launch" nocase
    condition:
         at 0 and any of (, ) and any of (, )
}

rule PDF_Suspicious_URI {
    meta:
        description = "PDF con URI di reindirizzamento sospetto"
        severity = "low"
        category = "pdf"
    strings:
         = "%PDF"
         = "/URI" nocase
         = "http://" nocase
    condition:
         at 0 and  and 
}
