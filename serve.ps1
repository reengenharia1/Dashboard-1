$ErrorActionPreference = "Stop"
$listener = New-Object System.Net.HttpListener
$listener.Prefixes.Add("http://127.0.0.1:8765/")
$listener.Start()
Write-Host "SERVER_STARTED on http://127.0.0.1:8765/"
$root = (Get-Location).Path

function Read-FileBytesShared([string]$path) {
  $fs = [System.IO.File]::Open($path, [System.IO.FileMode]::Open, [System.IO.FileAccess]::Read, [System.IO.FileShare]::ReadWrite)
  try {
    $ms = New-Object System.IO.MemoryStream
    $fs.CopyTo($ms)
    return $ms.ToArray()
  } finally {
    $fs.Dispose()
  }
}

while ($listener.IsListening) {
  $ctx = $listener.GetContext()
  $req = $ctx.Request
  $res = $ctx.Response
  try {
    $path = [Uri]::UnescapeDataString($req.Url.LocalPath.TrimStart("/"))
    if ([string]::IsNullOrWhiteSpace($path)) { $path = "index.html" }
    $full = [System.IO.Path]::GetFullPath((Join-Path $root $path))
    if (-not $full.StartsWith($root, [System.StringComparison]::OrdinalIgnoreCase)) {
      throw "Invalid path"
    }
    if (-not (Test-Path -LiteralPath $full -PathType Leaf)) {
      $res.StatusCode = 404
      $buf = [Text.Encoding]::UTF8.GetBytes("Not found: $path")
      $res.ContentType = "text/plain; charset=utf-8"
      $res.ContentLength64 = $buf.Length
      $res.OutputStream.Write($buf, 0, $buf.Length)
      $res.Close()
      continue
    }
    $bytes = Read-FileBytesShared $full
    $ext = [IO.Path]::GetExtension($full).ToLowerInvariant()
    $ctype = switch ($ext) {
      ".html" { "text/html; charset=utf-8" }
      ".css"  { "text/css; charset=utf-8" }
      ".js"   { "application/javascript; charset=utf-8" }
      ".csv"  { "text/csv; charset=utf-8" }
      default { "application/octet-stream" }
    }
    $res.StatusCode = 200
    $res.ContentType = $ctype
    $res.ContentLength64 = $bytes.Length
    $res.OutputStream.Write($bytes, 0, $bytes.Length)
    $res.Close()
  } catch {
    Write-Host ("SERVE_ERROR {0}: {1}" -f $req.Url.LocalPath, $_.Exception.Message)
    try {
      $msg = [Text.Encoding]::UTF8.GetBytes("Error reading file")
      $res.StatusCode = 500
      $res.ContentType = "text/plain; charset=utf-8"
      $res.ContentLength64 = $msg.Length
      $res.OutputStream.Write($msg, 0, $msg.Length)
      $res.Close()
    } catch {}
  }
}
