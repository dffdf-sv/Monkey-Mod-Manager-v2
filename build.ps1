$projectPath = "."
$outputDir = "./publish"
Remove-Item -Recurse -Force "$outputDir" -ErrorAction Ignore
dotnet publish $projectPath -c Release -r linux-x64 --self-contained true /p:PublishSingleFile=true /p:IncludeNativeLibrariesForSelfExtract=true -o "$outputDir/linux"
dotnet publish $projectPath -c Release -r win-x64 --self-contained true /p:PublishSingleFile=true /p:IncludeNativeLibrariesForSelfExtract=true -o "$outputDir/windows"
Write-Host "Publish complete!"
Write-Host "Linux build: $outputDir/linux"
Write-Host "Windows build: $outputDir/windows"
