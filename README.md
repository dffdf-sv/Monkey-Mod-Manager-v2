# Monke Mod Manager
A simple, fast, and cross-platform mod manager for "Gorilla Tag" mods.
Easily download, install, update, and manage your favorite mods with one click.
Built with [AvaloniaUI](https://avaloniaui.net/)!

## Features
- Mod Installing (obviously)
- Mod Installing from disk
- Mod Uninstalling
- Launching the game from the manager (limited to Steam only)
- Config Editor (configure mods right within the manager)
- Disable/Enable mods (go back to vanilla while keeping your mods)
- Pulls mods from [GORILA-TAG-MODBASE](https://github.com/dffdf-sv/GORILA-TAG-MODBASE) - always up to date!
- Modern, clean UI with multiple themes
- Download progress indicator
- Security-focused - only downloads from trusted GitHub sources

## What's New
- **Modernized UI**: Cleaner card design with shadows, better spacing, and visual hierarchy
- **Improved badges**: Version, status, author, and group badges for quick identification
- **Security enhancements**: Only allows downloads from trusted GitHub domains
- **First-run security info**: Explains antivirus false positives on first launch
- **Better progress feedback**: Download progress bar during installations
- **5 themes**: Light, Dark, Dark High Contrast, Sunrise, and Frost

## Download
| Platform | Link                                                                                            |
| -------- | ----------------------------------------------------------------------------------------------- |
| Windows  | https://github.com/arielthemonke/MonkeModManager/releases/latest/download/MonkeModManager.exe   |
| Linux    | https://github.com/arielthemonke/MonkeModManager/releases/latest/download/MonkeModManager.Linux |

## Building from Source
Requirements:
- .NET 9 SDK
- Windows or Linux

```bash
# Run the build script
./build.ps1

# Or manually:
dotnet publish -c Release -r win-x64 --self-contained true /p:PublishSingleFile=true
dotnet publish -c Release -r linux-x64 --self-contained true /p:PublishSingleFile=true
```

## Appearance
### Light Mode:
![light mode](https://github.com/arielthemonke/MonkeModManager/blob/main/Assets/light-showcase.png?raw=true)
### Dark Mode:
![dark mode](https://github.com/arielthemonke/MonkeModManager/blob/main/Assets/dark-showcase.png?raw=true)

Plus 3 additional themes: Dark High Contrast, Sunrise, and Frost!

## Antivirus Notice
Some antivirus software may flag this application as suspicious because it downloads and installs mod files. This is a **false positive**. The app:
- Only downloads from trusted GitHub repositories
- Is open source and fully auditable
- Does not collect or transmit any user data

If your antivirus flags it, add an exception for the application.

## Contribution
Pull requests are welcome!

## Credits
Ariel The Monke - Main Development
Toast Concern - Ideas + [#2](https://github.com/arielthemonke/MonkeModManager/pull/2)
Kurplunk - [#3](https://github.com/arielthemonke/MonkeModManager/pull/3)
Google Fonts - Icons (licensed under [Apache 2.0](https://www.apache.org/licenses/LICENSE-2.0.txt))

## Legal

### License
This project is licensed under the MIT License – see the [LICENSE](LICENSE) file for details.

### Notice
> This product is not affiliated with Another Axiom Inc. or its videogames Gorilla Tag and Orion Drift and is not endorsed or otherwise sponsored by Another Axiom. Portions of the materials contained herein are property of Another Axiom. ©2021 Another Axiom Inc.
