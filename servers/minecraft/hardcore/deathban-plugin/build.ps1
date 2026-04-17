$ErrorActionPreference = "Stop"

$ProjectRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$SourceRoot = Join-Path $ProjectRoot "src\main\java"
$ResourceRoot = Join-Path $ProjectRoot "src\main\resources"
$BuildRoot = Join-Path $ProjectRoot "build"
$ClassesRoot = Join-Path $BuildRoot "classes"
$LibsRoot = Join-Path $BuildRoot "libs"
$OutputJar = Join-Path $LibsRoot "hardcore-deathban-1.0.0.jar"

$LibraryRoot = "D:\Servers\Minecraft\Hardcore\libraries"
$JavaBin = "C:\Program Files (x86)\Minecraft Launcher\runtime\java-runtime-epsilon\windows-x64\java-runtime-epsilon\bin"
$JavacExe = Join-Path $JavaBin "javac.exe"
$JarExe = Join-Path $JavaBin "jar.exe"

if (-not (Test-Path -LiteralPath $LibraryRoot)) {
    throw "Library root not found: $LibraryRoot"
}

if (-not (Test-Path -LiteralPath $JavacExe)) {
    throw "javac not found: $JavacExe"
}

if (-not (Test-Path -LiteralPath $JarExe)) {
    throw "jar tool not found: $JarExe"
}

if (Test-Path -LiteralPath $BuildRoot) {
    $resolvedBuildRoot = (Resolve-Path -LiteralPath $BuildRoot).Path
    if (-not $resolvedBuildRoot.StartsWith($ProjectRoot)) {
        throw "Refusing to delete build directory outside project root: $resolvedBuildRoot"
    }

    Remove-Item -LiteralPath $BuildRoot -Recurse -Force
}

New-Item -ItemType Directory -Path $ClassesRoot -Force | Out-Null
New-Item -ItemType Directory -Path $LibsRoot -Force | Out-Null

$SourceFiles = Get-ChildItem -Path $SourceRoot -Recurse -Filter *.java | Select-Object -ExpandProperty FullName
if (-not $SourceFiles) {
    throw "No Java source files found under $SourceRoot"
}

$ClasspathEntries = Get-ChildItem -Path $LibraryRoot -Recurse -Filter *.jar | Select-Object -ExpandProperty FullName
if (-not $ClasspathEntries) {
    throw "No library jars found under $LibraryRoot"
}

$CompileClasspath = [string]::Join(";", $ClasspathEntries)

& $JavacExe `
    -encoding UTF-8 `
    --release 21 `
    -cp $CompileClasspath `
    -d $ClassesRoot `
    $SourceFiles

if ($LASTEXITCODE -ne 0) {
    throw "javac failed with exit code $LASTEXITCODE"
}

Copy-Item -Path (Join-Path $ResourceRoot "*") -Destination $ClassesRoot -Recurse -Force

Push-Location $ClassesRoot
try {
    & $JarExe --create --file $OutputJar .
    if ($LASTEXITCODE -ne 0) {
        throw "jar failed with exit code $LASTEXITCODE"
    }
}
finally {
    Pop-Location
}

Write-Host "Built jar: $OutputJar"
