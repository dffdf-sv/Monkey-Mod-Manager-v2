; ModHub NSIS uninstall cleanup.
; electron-builder removes the installed application directory after this hook.
; Only updater caches/pending updates are removed here; settings and Gorilla Tag files are preserved.
; Remove updater caches only; preserve user settings and Gorilla Tag files.
!macro customUnInstall
  ; electron-updater cache directories in LocalAppData.
  RMDir /r "$LOCALAPPDATA\modhub-updater"
  RMDir /r "$LOCALAPPDATA\ModHub-updater"
  RMDir /r "$LOCALAPPDATA\ModHub Update"
  RMDir /r "$LOCALAPPDATA\ModHub Updates"
  RMDir /r "$LOCALAPPDATA\modhub-updates"
  RMDir /r "$LOCALAPPDATA\ModHub Update Cache"
  RMDir /r "$LOCALAPPDATA\ModHub\updater"
  RMDir /r "$LOCALAPPDATA\modhub\updater"
  RMDir /r "$LOCALAPPDATA\monkey-mod-manager-updater"
  RMDir /r "$LOCALAPPDATA\Monkey Mod Manager-updater"
  RMDir /r "$LOCALAPPDATA\Monkey-Mod-Manager-updater"
  RMDir /r "$LOCALAPPDATA\Monkey Mod Manager Update"
  RMDir /r "$LOCALAPPDATA\Monkey Mod Manager Updates"
  RMDir /r "$LOCALAPPDATA\Monkey-Mod-Manager-Updates"
  RMDir /r "$LOCALAPPDATA\Monkey Mod Manager Update Cache"
  RMDir /r "$LOCALAPPDATA\Monkey Mod Manager\updater"
  RMDir /r "$LOCALAPPDATA\Monkey-Mod-Manager\updater"
  RMDir /r "$LOCALAPPDATA\monkey-mod-manager\updater"

  ; Remove pending downloaded updates from app data without deleting settings.
  RMDir /r "$APPDATA\ModHub\pending"
  RMDir /r "$APPDATA\modhub\pending"
  RMDir /r "$APPDATA\Monkey Mod Manager\pending"
  RMDir /r "$APPDATA\Monkey-Mod-Manager\pending"
  RMDir /r "$APPDATA\Monkey Mod Manager v2\pending"
  RMDir /r "$APPDATA\ModHub\updater"
  RMDir /r "$APPDATA\modhub\updater"
  RMDir /r "$APPDATA\Monkey Mod Manager\updater"
  RMDir /r "$APPDATA\Monkey-Mod-Manager\updater"
  RMDir /r "$APPDATA\Monkey Mod Manager v2\updater"
!macroend
