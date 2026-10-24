; ModHub NSIS uninstall cleanup.
; electron-builder removes the installed application directory itself.
; Remove only updater download caches left behind by this app and its legacy name.
!macro customUnInstall
  RMDir /r "$LOCALAPPDATA\modhub-updater"
  RMDir /r "$LOCALAPPDATA\ModHub-updater"
  RMDir /r "$LOCALAPPDATA\monkey-mod-manager-updater"
  RMDir /r "$LOCALAPPDATA\Monkey Mod Manager-updater"
  RMDir /r "$LOCALAPPDATA\Monkey-Mod-Manager-updater"
!macroend
