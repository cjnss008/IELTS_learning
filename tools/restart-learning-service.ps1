param(
  [Parameter(Mandatory = $true)][int]$Port,
  [Parameter(Mandatory = $true)][string]$LauncherPath,
  [Parameter(Mandatory = $true)][string]$Version,
  [Parameter(Mandatory = $true)][string]$BuildSignature,
  [Parameter(Mandatory = $true)][string]$ProjectId
)
$ErrorActionPreference = 'Stop'
Set-StrictMode -Version 2.0
[Console]::OutputEncoding = [Text.UTF8Encoding]::new($false)
$ProgressPreference = 'SilentlyContinue'
$mutex = $null
$locked = $false
$owned = $null

function Fail([string]$Code) { throw [InvalidOperationException]::new($Code) }
function Field($Object, [string]$Name) {
  if ($null -eq $Object) { return $null }
  $property = $Object.PSObject.Properties[$Name]
  if ($null -eq $property) { return $null }
  return $property.Value
}
function Reply([string]$State) { @{ state = $State } | ConvertTo-Json -Compress | Write-Output }

function Read-Health {
  $request = [Net.HttpWebRequest]::Create('http://127.0.0.1:' + $Port + '/api/health')
  $request.Proxy = $null
  $request.AllowAutoRedirect = $false
  $request.KeepAlive = $false
  $request.Timeout = 2000
  $request.ReadWriteTimeout = 2000
  $request.Accept = 'application/json'
  $response = $null
  try {
    $response = $request.GetResponse()
    if ([int]$response.StatusCode -ne 200) { Fail 'HEALTH_UNVERIFIED' }
    $stream = $response.GetResponseStream()
    $buffer = New-Object byte[] 16385
    $length = 0
    while ($length -lt $buffer.Length) {
      $count = $stream.Read($buffer, $length, $buffer.Length - $length)
      if ($count -eq 0) { break }
      $length += $count
    }
    if ($length -ge $buffer.Length) { Fail 'HEALTH_UNVERIFIED' }
    return ([Text.Encoding]::UTF8.GetString($buffer, 0, $length) | ConvertFrom-Json)
  } catch {
    $failure = $_.Exception
    while ($failure.InnerException) { $failure = $failure.InnerException }
    if ($failure -is [Net.WebException] -and $failure.Status -eq [Net.WebExceptionStatus]::ConnectFailure) { return $null }
    Fail 'HEALTH_UNVERIFIED'
  } finally { if ($response) { $response.Dispose() } }
}
function Is-Current($Health) {
  return ((Field $Health 'ok') -eq $true -and (Field $Health 'service') -ceq 'ielts-learning-local' -and
    (Field $Health 'home') -ceq '/' -and (Field $Health 'runtimeSchema') -eq 1 -and
    (Field $Health 'version') -ceq $Version -and (Field $Health 'buildSignature') -ceq $BuildSignature -and
    (Field $Health 'projectId') -ceq $ProjectId -and (Field $Health 'instanceId') -match '^[0-9a-fA-F-]{36}$' -and
    (Field $Health 'startedAt') -is [string] -and (Field $Health 'pid') -is [ValueType] -and (Field $Health 'pid') -gt 0)
}
function Assert-AppHealth($Health) {
  if ($null -eq $Health) { return }
  if ((Field $Health 'ok') -ne $true -or (Field $Health 'service') -cne 'ielts-learning-local' -or
      (Field $Health 'home') -cne '/' -or (Field $Health 'version') -isnot [string]) { Fail 'HEALTH_UNVERIFIED' }
  $identity = Field $Health 'projectId'
  if ($identity -and $identity -cne $ProjectId) { Fail 'FOREIGN_PROJECT' }
}

function Get-ListenerOwner {
  try { $listeners = @(Get-NetTCPConnection -State Listen -ErrorAction Stop | Where-Object { $_.LocalPort -eq $Port }) }
  catch { Fail 'OWNER_UNAVAILABLE' }
  if ($listeners.Count -eq 0) { return $null }
  $owners = @($listeners | Select-Object -ExpandProperty OwningProcess -Unique)
  if ($owners.Count -ne 1 -or @($listeners | Where-Object { $_.LocalAddress -ne '127.0.0.1' }).Count -ne 0) { Fail 'OWNER_UNVERIFIED' }
  $ownerId = [int]$owners[0]
  if ($ownerId -le 0 -or $ownerId -eq $PID) { Fail 'OWNER_UNVERIFIED' }
  $cim = Get-CimInstance -ClassName Win32_Process -Filter ('ProcessId = ' + $ownerId)
  if ($null -eq $cim -or $cim.Name -ine 'node.exe' -or -not $cim.ExecutablePath -or -not $cim.CommandLine) { Fail 'OWNER_UNVERIFIED' }
  $sid = Invoke-CimMethod -InputObject $cim -MethodName GetOwnerSid
  if ($sid.ReturnValue -ne 0 -or $sid.Sid -cne [Security.Principal.WindowsIdentity]::GetCurrent().User.Value) { Fail 'OWNER_UNVERIFIED' }
  $arguments = [IELTSStartup.CommandLine]::Split($cim.CommandLine)
  if ($arguments.Length -ne 5 -or $arguments[2] -cne '--serve' -or $arguments[3] -cne '--port' -or $arguments[4] -cne [string]$Port) { Fail 'COMMAND_UNVERIFIED' }
  if (-not [IO.Path]::IsPathRooted($arguments[0]) -or -not [IO.Path]::IsPathRooted($arguments[1])) { Fail 'COMMAND_UNVERIFIED' }
  if (-not [IO.Path]::GetFullPath($arguments[0]).Equals([IO.Path]::GetFullPath($cim.ExecutablePath), [StringComparison]::OrdinalIgnoreCase) -or
      -not [IO.Path]::GetFullPath($arguments[1]).Equals($LauncherPath, [StringComparison]::OrdinalIgnoreCase)) { Fail 'COMMAND_UNVERIFIED' }
  $processObject = [Diagnostics.Process]::GetProcessById($ownerId)
  try {
    # Opening and keeping this handle binds the later stop to this process,
    # rather than whichever process could later be assigned the same numeric PID.
    [void]$processObject.Handle
    $ticks = $processObject.StartTime.ToUniversalTime().Ticks
    if ([Math]::Abs($ticks - $cim.CreationDate.ToUniversalTime().Ticks) -gt 10000) { Fail 'PROCESS_CHANGED' }
    return [pscustomobject]@{ Id = $ownerId; StartTicks = $ticks; Creation = $cim.CreationDate.ToUniversalTime().ToString('O'); Process = $processObject }
  } catch { $processObject.Dispose(); throw }
}
function Same-Owner($Before, $After) {
  return ($null -ne $Before -and $null -ne $After -and $Before.Id -eq $After.Id -and
    $Before.StartTicks -eq $After.StartTicks -and $Before.Creation -ceq $After.Creation)
}
function Try-GracefulStop($Health) {
  $instance = Field $Health 'instanceId'
  if ($instance -isnot [string] -or $instance -notmatch '^[0-9a-fA-F-]{36}$') { return $false }
  $request = [Net.HttpWebRequest]::Create('http://127.0.0.1:' + $Port + '/api/runtime/restart')
  $request.Proxy = $null
  $request.Method = 'POST'
  $request.AllowAutoRedirect = $false
  $request.KeepAlive = $false
  $request.Timeout = 2000
  $request.ReadWriteTimeout = 2000
  $request.ContentType = 'application/json'
  $request.Headers['X-IELTS-Project-Id'] = $ProjectId
  $request.Headers['X-IELTS-Launcher'] = 'restart-v1'
  $bytes = [Text.Encoding]::UTF8.GetBytes((@{ instanceId = $instance } | ConvertTo-Json -Compress))
  $request.ContentLength = $bytes.Length
  $response = $null
  try {
    $stream = $request.GetRequestStream()
    try { $stream.Write($bytes, 0, $bytes.Length) } finally { $stream.Dispose() }
    $response = $request.GetResponse()
    return ([int]$response.StatusCode -eq 202)
  } catch { return $false } finally { if ($response) { $response.Dispose() } }
}

try {
  if ($Port -lt 1 -or $Port -gt 65535 -or $BuildSignature -notmatch '^sha256:[a-f0-9]{64}$' -or
      $ProjectId -notmatch '^sha256:[a-f0-9]{64}$' -or $Version -notmatch '^\d+\.\d+\.\d+$' -or
      -not [IO.Path]::IsPathRooted($LauncherPath)) { Fail 'INVALID_ARGUMENT' }
  $LauncherPath = [IO.Path]::GetFullPath($LauncherPath)
  if ([IO.Path]::GetFileName($LauncherPath) -cne 'start-learning.cjs' -or -not [IO.File]::Exists($LauncherPath)) { Fail 'INVALID_ARGUMENT' }
  Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
namespace IELTSStartup {
  public static class CommandLine {
    [DllImport("shell32.dll", SetLastError=true)] static extern IntPtr CommandLineToArgvW([MarshalAs(UnmanagedType.LPWStr)] string value, out int count);
    [DllImport("kernel32.dll")] static extern IntPtr LocalFree(IntPtr value);
    public static string[] Split(string value) {
      int count; IntPtr pointer = CommandLineToArgvW(value, out count);
      if (pointer == IntPtr.Zero) throw new InvalidOperationException("COMMAND_UNVERIFIED");
      try { var result = new string[count]; for (int i=0; i<count; i++) result[i] = Marshal.PtrToStringUni(Marshal.ReadIntPtr(pointer, i * IntPtr.Size)); return result; }
      finally { LocalFree(pointer); }
    }
  }
}
'@
  # Serialize every restart decision for this local port, including a fresh
  # health check. A second double click must never stop the replacement service.
  $mutex = [Threading.Mutex]::new($false, ('Local\IELTSLearningRestart-v1-' + $Port))
  try { $locked = $mutex.WaitOne(30000) } catch [Threading.AbandonedMutexException] { $locked = $true }
  if (-not $locked) { Fail 'RESTART_BUSY' }
  $health = Read-Health
  if (Is-Current $health) { Reply 'current'; exit 0 }
  Assert-AppHealth $health
  $owned = Get-ListenerOwner
  if ($null -eq $owned) { Reply 'absent'; exit 0 }
  if ($null -eq $health) { Fail 'HEALTH_UNVERIFIED' }
  $health = Read-Health
  if (Is-Current $health) { Reply 'current'; exit 0 }
  Assert-AppHealth $health
  if ($null -eq $health) { Fail 'PROCESS_CHANGED' }
  $healthPid = Field $health 'pid'
  if ($null -ne $healthPid -and $healthPid -ne $owned.Id) { Fail 'PROCESS_CHANGED' }
  $again = Get-ListenerOwner
  try { if (-not (Same-Owner $owned $again)) { Fail 'PROCESS_CHANGED' } } finally { if ($again) { $again.Process.Dispose() } }
  if (Try-GracefulStop $health) {
    if ($owned.Process.WaitForExit(3000)) { Reply 'stopped'; exit 0 }
  }
  # Recheck after graceful shutdown and immediately before any force fallback.
  $latest = Read-Health
  if (Is-Current $latest) { Reply 'current'; exit 0 }
  Assert-AppHealth $latest
  $again = Get-ListenerOwner
  try {
    if ($null -eq $again) { Reply 'stopped'; exit 0 }
    if (-not (Same-Owner $owned $again)) { Fail 'PROCESS_CHANGED' }
    if ($null -eq $latest) { Fail 'HEALTH_UNVERIFIED' }
    $latestPid = Field $latest 'pid'
    if ($null -ne $latestPid -and $latestPid -ne $owned.Id) { Fail 'PROCESS_CHANGED' }
    Stop-Process -InputObject $owned.Process -ErrorAction Stop
    if (-not $owned.Process.WaitForExit(5000)) { Fail 'STOP_TIMEOUT' }
  } finally { if ($again) { $again.Process.Dispose() } }
  Reply 'stopped'
  exit 0
} catch {
  $code = $_.Exception.Message
  if ($code -notmatch '^[A-Z_]+$') { $code = 'RESTART_UNVERIFIED' }
  @{ state = 'blocked'; code = $code } | ConvertTo-Json -Compress | Write-Output
  exit 1
} finally {
  if ($owned) { $owned.Process.Dispose() }
  if ($locked) { $mutex.ReleaseMutex() }
  if ($mutex) { $mutex.Dispose() }
}
