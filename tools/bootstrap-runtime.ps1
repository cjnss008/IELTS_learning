param(
  [string]$ProjectRoot = (Split-Path -Parent $PSScriptRoot),
  [string]$DataDir = $env:IELTS_DATA_DIR,
  [string]$PackageDir,
  [switch]$IgnoreSystemNode,
  [switch]$NoLaunch
)
$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [Text.UTF8Encoding]::new($false)
Set-StrictMode -Version 2.0
$ProgressPreference = 'SilentlyContinue'

function Assert-NoReparsePath([string]$Base, [string]$Target) {
  $baseFull = [IO.Path]::GetFullPath($Base)
  $current = $baseFull
  $fullTarget = [IO.Path]::GetFullPath($Target)
  $paths = @($current)
  $relative = $fullTarget.Substring($baseFull.TrimEnd('\').Length).TrimStart('\')
  foreach ($part in $relative.Split('\')) { if ($part) { $current = [IO.Path]::Combine($current, $part); $paths += $current } }
  foreach ($item in $paths) {
    try { $attributes = [IO.File]::GetAttributes($item) }
    catch [IO.FileNotFoundException] { break }
    catch [IO.DirectoryNotFoundException] { break }
    if (($attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0) { throw 'Runtime paths cannot contain a symbolic link or directory junction.' }
    if ($item -ne $fullTarget -and ($attributes -band [IO.FileAttributes]::Directory) -eq 0) { throw 'A runtime parent path is not a directory.' }
  }
}
function Assert-ChildPath([string]$Base, [string]$Target) {
  $fullBase = [IO.Path]::GetFullPath($Base).TrimEnd('\') + '\'
  $fullTarget = [IO.Path]::GetFullPath($Target)
  if (-not $fullTarget.StartsWith($fullBase, [StringComparison]::OrdinalIgnoreCase)) { throw 'Runtime path is outside the user data directory.' }
  Assert-NoReparsePath $Base $fullTarget
  return $fullTarget
}
function Get-ArchiveHash([string]$FilePath) {
  $stream = [IO.File]::OpenRead($FilePath)
  $sha = [Security.Cryptography.SHA256]::Create()
  try { return [BitConverter]::ToString($sha.ComputeHash($stream)).Replace('-', '').ToLowerInvariant() } finally { $sha.Dispose(); $stream.Dispose() }
}
function Get-NodeInfo([string]$Executable) {
  if (-not $Executable -or -not (Test-Path -LiteralPath $Executable -PathType Leaf)) { return $null }
  try {
    $result = & $Executable -p 'JSON.stringify({version:process.versions.node,arch:process.arch})' 2>$null
    if ($LASTEXITCODE -ne 0) { return $null }
    $info = ($result -join '') | ConvertFrom-Json
    if ([int]($info.version.Split('.')[0]) -lt 22) { return $null }
    return $info
  } catch { return $null }
}

$lockStream = $null
$stage = $null
try {
  $ProjectRoot = [IO.Path]::GetFullPath($ProjectRoot)
  $developmentName = 'IELTS_learning' + [char]0x5f00 + [char]0x53d1
  if ([IO.Path]::GetFileName($ProjectRoot.TrimEnd('\', '/')) -ieq $developmentName) {
    throw 'This development worktree must use tools/start-development.cjs with an explicitly initialized isolated local data directory. The normal launcher has not read or created user data.'
  }
  if (-not $DataDir) { $DataDir = Join-Path $ProjectRoot '用户数据' }
  if ($DataDir -notmatch '^(?:[A-Za-z]:[\\/]|\\\\[^\\/]+[\\/][^\\/]+(?:[\\/]|$))') { throw 'IELTS_DATA_DIR must be an absolute drive or UNC share path.' }
  $DataDir = [IO.Path]::GetFullPath($DataDir)
  if (-not $PackageDir) { $PackageDir = Join-Path $ProjectRoot 'runtime-packages' }
  $manifest = Get-Content -LiteralPath (Join-Path $PackageDir 'manifest.json') -Raw -Encoding UTF8 | ConvertFrom-Json
  if ($manifest.schemaVersion -ne 1 -or $manifest.minimumMajor -ne 22 -or $manifest.version -notmatch '^22\.\d+\.\d+$') { throw 'Unsupported runtime package manifest.' }
  $osArchitecture = $env:PROCESSOR_ARCHITEW6432
  if (-not $osArchitecture) { $osArchitecture = $env:PROCESSOR_ARCHITECTURE }
  if ($osArchitecture -eq 'ARM64') { $architecture = 'arm64' } elseif ($osArchitecture -eq 'AMD64') { $architecture = 'x64' } else { throw 'This learning package requires 64-bit Windows (x64 or ARM64).' }
  $packages = @($manifest.packages | Where-Object { $_.architecture -eq $architecture })
  if ($packages.Count -ne 1) { throw 'No matching bundled Windows runtime.' }
  $package = $packages[0]
  $expectedFolder = 'node-v' + $manifest.version + '-win-' + $architecture
  if ($package.folder -ne $expectedFolder -or $package.file -ne ($expectedFolder + '.zip') -or $package.sha256 -notmatch '^[a-f0-9]{64}$') { throw 'Invalid runtime package metadata.' }
  $runtimeRoot = Assert-ChildPath $DataDir (Join-Path $DataDir 'runtime')
  $target = Assert-ChildPath $runtimeRoot (Join-Path $runtimeRoot $expectedFolder)
  $nodeExe = Assert-ChildPath $target (Join-Path $target 'node.exe')
  $info = Get-NodeInfo $nodeExe
  if ($info -and ($info.version -ne $manifest.version -or $info.arch -ne $architecture)) { $info = $null }
  if (-not $info -and -not $IgnoreSystemNode) {
    $command = Get-Command node.exe -CommandType Application -ErrorAction SilentlyContinue | Select-Object -First 1
    if ($command) {
      $systemInfo = Get-NodeInfo $command.Source
      if ($systemInfo) { $nodeExe = $command.Source; $info = $systemInfo }
    }
  }
  if (-not $info) {
    Write-Host 'Installing the bundled Node.js runtime into the user data folder...'
    [IO.Directory]::CreateDirectory($runtimeRoot) | Out-Null
    $lockPath = Join-Path $runtimeRoot 'install.lock'
    $deadline = [DateTime]::UtcNow.AddSeconds(60)
    while (-not $lockStream) {
      try { $lockStream = [IO.File]::Open($lockPath, [IO.FileMode]::OpenOrCreate, [IO.FileAccess]::ReadWrite, [IO.FileShare]::None) }
      catch [IO.IOException] { if ([DateTime]::UtcNow -ge $deadline) { throw 'Another runtime installation is still in progress. Please retry shortly.' }; Start-Sleep -Milliseconds 250 }
    }
    $nodeExe = Assert-ChildPath $target (Join-Path $target 'node.exe')
    $info = Get-NodeInfo $nodeExe
    if (-not $info -or $info.version -ne $manifest.version -or $info.arch -ne $architecture) {
      if (Test-Path -LiteralPath $target) { throw ('The existing portable runtime is damaged. Your learning data is unchanged. Rename only this runtime folder and retry: ' + $target) }
      $archive = Join-Path $PackageDir $package.file
      if (-not (Test-Path -LiteralPath $archive -PathType Leaf)) { throw ('Bundled runtime is missing: ' + $archive + '. Download the complete learning package including Git LFS files.') }
      if ((Get-Item -LiteralPath $archive).Length -ne $package.size -or (Get-ArchiveHash $archive) -ne $package.sha256) { throw ('Bundled runtime checksum failed: ' + $package.file + '. The archive may be a Git LFS pointer or incomplete download. Obtain the complete package and retry.') }
      Add-Type -AssemblyName System.IO.Compression.FileSystem
      $stage = Assert-ChildPath $runtimeRoot (Join-Path $runtimeRoot ('install-' + [Guid]::NewGuid().ToString('N')))
      [IO.Directory]::CreateDirectory($stage) | Out-Null
      $zip = [IO.Compression.ZipFile]::OpenRead($archive)
      try {
        # The app has no npm packages. Extract the verified executable and legal notices;
        # the full official archive remains bundled for reproducibility.
        foreach ($entry in $zip.Entries) {
          if ($entry.FullName -match '(^[\\/]|:|(^|[\\/])\.\.([\\/]|$))') { throw 'Unsafe path in bundled runtime archive.' }
          $entryPath = $entry.FullName.Replace('/', '\')
          [void](Assert-ChildPath $stage (Join-Path $stage $entryPath))
          if ($entry.FullName -in @("$expectedFolder/node.exe", "$expectedFolder/LICENSE", "$expectedFolder/README.md", "$expectedFolder/CHANGELOG.md")) {
            if ($entry.Length -gt 256MB) { throw 'A bundled runtime entry exceeds the extraction size limit.' }
            $destination = Assert-ChildPath $stage (Join-Path $stage $entryPath)
            [IO.Directory]::CreateDirectory((Split-Path -Parent $destination)) | Out-Null
            [IO.Compression.ZipFileExtensions]::ExtractToFile($entry, $destination, $false)
          }
        }
      } finally { $zip.Dispose() }
      $stagedFolder = Assert-ChildPath $stage (Join-Path $stage $expectedFolder)
      $info = Get-NodeInfo (Join-Path $stagedFolder 'node.exe')
      if (-not $info -or $info.version -ne $manifest.version -or $info.arch -ne $architecture) { throw 'The bundled Node.js executable failed its version/architecture check.' }
      [void](Assert-ChildPath $runtimeRoot $target)
      Move-Item -LiteralPath $stagedFolder -Destination $target
      Write-Host ('Node.js ' + $info.version + ' installed. No administrator rights or system PATH changes were needed.')
    }
    $lockStream.Dispose(); $lockStream = $null
  }
  if ($NoLaunch) { Write-Output ('RUNTIME_READY ' + $nodeExe); exit 0 }
  $env:IELTS_DATA_DIR = $DataDir
  & $nodeExe (Join-Path $ProjectRoot 'tools\start-learning.cjs')
  if ($LASTEXITCODE -ne 0) { throw 'The learning service did not start successfully. See the error above.' }
  exit 0
} catch {
  [Console]::Error.WriteLine('[IELTS STARTUP ERROR] ' + $_.Exception.Message)
  exit 1
} finally {
  if ($lockStream) { $lockStream.Dispose() }
  if ($stage -and (Test-Path -LiteralPath $stage)) {
    [void](Assert-ChildPath $runtimeRoot $stage)
    Remove-Item -LiteralPath $stage -Recurse -Force
  }
}
