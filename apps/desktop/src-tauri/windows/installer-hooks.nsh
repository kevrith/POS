; Extra steps for the Windows installer (NSIS), run by Tauri's own installer script.
;
; The offline server runs on this computer. When the owner sets it up as a server for other computers, tills on the shop
; network must be able to reach it:
;   TCP 3010   the KASTRA API
;   UDP 47474  "who is the KASTRA server?" (so tills can find it by themselves)
; Allowed on Private and Domain networks only, never on public Wi-Fi. The rules are harmless on a single-computer setup:
; the server listens on this computer only unless the owner switches network access on.
;
; Uninstalling removes these rules and the unpacked server program. It NEVER touches the database (C:\ProgramData\KASTRA)
; or the backups (Documents\KASTRA Backups): a customer's data must survive an uninstall.

; A FRESH install must open on the setup wizard. The wizard is shown when this computer has no setup file
; (%APPDATA%\kastra-pos\mode.json), and that file outlives an uninstall and any earlier test build, so a computer that was once
; set up used to open straight on the login screen after a new install. If KASTRA is not installed yet, forget the old setup file.
; An update over an existing installation keeps it. The database and backups are never touched either way: choosing the same
; folders in the wizard picks the data up where it was.
; ($%APPDATA% is read from the environment, so it is the installing user's folder whatever the installer's shell context.)
!macro NSIS_HOOK_PREINSTALL
  Push $0
  ReadRegStr $0 SHCTX "${UNINSTKEY}" "DisplayName"
  ${If} $0 == ""
    Delete "$%APPDATA%\kastra-pos\mode.json"
  ${EndIf}
  Pop $0
!macroend

!macro NSIS_HOOK_POSTINSTALL
  nsExec::ExecToLog 'netsh advfirewall firewall delete rule name="KASTRA POS server (API)"'
  nsExec::ExecToLog 'netsh advfirewall firewall add rule name="KASTRA POS server (API)" dir=in action=allow protocol=TCP localport=3010 profile=private,domain'
  nsExec::ExecToLog 'netsh advfirewall firewall delete rule name="KASTRA POS server (discovery)"'
  nsExec::ExecToLog 'netsh advfirewall firewall add rule name="KASTRA POS server (discovery)" dir=in action=allow protocol=UDP localport=47474 profile=private,domain'
!macroend

!macro NSIS_HOOK_POSTUNINSTALL
  nsExec::ExecToLog 'netsh advfirewall firewall delete rule name="KASTRA POS server (API)"'
  nsExec::ExecToLog 'netsh advfirewall firewall delete rule name="KASTRA POS server (discovery)"'
  ; The unpacked copy of the server program (code only, rebuilt on the next start). Not the data.
  RMDir /r "$%LOCALAPPDATA%\KASTRA\server"
!macroend
