; ModHub NSIS uninstall cleanup.
; electron-builder removes the installed application directory after this hook.
; Remove updater caches only; preserve user settings and Gorilla Tag files.
!macro customUnInstall
  ; electron-updater cache directories in LocalAppData.
  RMDir /r "$LOCALAPPDATA\modhub-updater"
  RMDir /r "$LOCALAPPDATA\ModHub-updater"
  RMDir /r "$LOCALAPPDATA\ModHub Update"
  RMDir /r "$LOCALAPPDATA\ModHub Updates"
  RMDir /r "$LOCALAPPDATA\modhub-updates"
  RMDir /r "$LOCALAPPDATA\monkey-mod-manager-updater"
  RMDir /r "$LOCALAPPDATA\Monkey Mod Manager-updater"
  RMDir /r "$LOCALAPPDATA\Monkey-Mod-Manager-updater"
  RMDir /r "$LOCALAPPDATA\Monkey Mod Manager Update"
  RMDir /r "$LOCALAPPDATA\Monkey Mod Manager Updates"
  RMDir /r "$LOCALAPPDATA\Monkey-Mod-Manager-Updates"

  ; Remove pending downloaded updates from app data without deleting settings.
  RMDir /r "$APPDATA\ModHub\pending"
  RMDir /r "$APPDATA\modhub\pending"
  RMDir /r "$APPDATA\Monkey Mod Manager\pending"
  RMDir /r "$APPDATA\Monkey-Mod-Manager\pending"
  RMDir /r "$APPDATA\Monkey Mod Manager v2\pending"
!macroend
