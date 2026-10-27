; ModHub custom Windows uninstall cleanup.
; Do not run while an update is replacing the installed app.
!macro customUnInstall
  ${ifNot} ${isUpdated}
    ; electron-updater cache folders for current and legacy product names.
    RMDir /r "$LOCALAPPDATA\\modhub-updater"
    RMDir /r "$LOCALAPPDATA\\ModHub-updater"
    RMDir /r "$LOCALAPPDATA\\monkey-mod-manager-updater"
    RMDir /r "$LOCALAPPDATA\\Monkey-Mod-Manager-updater"
    RMDir /r "$LOCALAPPDATA\\Monkey Mod Manager-updater"
    RMDir /r "$APPDATA\\modhub-updater"
    RMDir /r "$APPDATA\\ModHub-updater"
    RMDir /r "$APPDATA\\monkey-mod-manager-updater"
    RMDir /r "$APPDATA\\Monkey-Mod-Manager-updater"
    RMDir /r "$APPDATA\\Monkey Mod Manager-updater"

    ; App data/settings left behind by current and earlier branded versions.
    RMDir /r "$APPDATA\\ModHub"
    RMDir /r "$APPDATA\\modhub"
    RMDir /r "$APPDATA\\monkey-mod-manager"
    RMDir /r "$APPDATA\\Monkey-Mod-Manager"
    RMDir /r "$APPDATA\\Monkey Mod Manager"
    RMDir /r "$APPDATA\\Monkey-Mod-Manager-v2"
  ${endIf}
!macroend
