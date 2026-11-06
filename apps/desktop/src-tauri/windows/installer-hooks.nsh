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
  RMDir /r "$LOCALAPPDATA\KASTRA\server"
!macroend
