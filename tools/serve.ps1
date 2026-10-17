$root = (Get-Location).Path + "\dist"
Write-Output "Root: $root"
if (-not (Test-Path "$root\index.html")) { Write-Output "ERROR: index.html not found in $root"; exit 1 }
$listener = [System.Net.HttpListener]::new()
$listener.Prefixes.Add("http://127.0.0.1:5201/")
$listener.Start()
Write-Output "Serving on http://127.0.0.1:5201/"

$mimes = @{
    ".html" = "text/html; charset=utf-8"
    ".js"   = "application/javascript; charset=utf-8"
    ".css"  = "text/css; charset=utf-8"
    ".json" = "application/json; charset=utf-8"
    ".png"  = "image/png"
    ".jpg"  = "image/jpeg"
    ".webp" = "image/webp"
    ".mp3"  = "audio/mpeg"
    ".mp4"  = "video/mp4"
    ".svg"  = "image/svg+xml"
    ".ico"  = "image/x-icon"
    ".webm" = "video/webm"
    ".ogg"  = "audio/ogg"
}

while ($listener.IsListening) {
    try {
        $ctx = $listener.GetContext()
        $url = $ctx.Request.Url.LocalPath
        if ($url -eq "/") { $url = "/index.html" }
        $filePath = Join-Path $root $url.TrimStart("/").Replace("/", "\")
        if (Test-Path $filePath -PathType Leaf) {
            $ext = [System.IO.Path]::GetExtension($filePath).ToLower()
            $mime = $mimes[$ext]
            if (-not $mime) { $mime = "application/octet-stream" }
            $bytes = [System.IO.File]::ReadAllBytes($filePath)
            $ctx.Response.ContentType = $mime
            $ctx.Response.ContentLength64 = $bytes.Length
            $ctx.Response.OutputStream.Write($bytes, 0, $bytes.Length)
        } else {
            $ctx.Response.StatusCode = 404
            $body = [System.Text.Encoding]::UTF8.GetBytes("404: $url")
            $ctx.Response.OutputStream.Write($body, 0, $body.Length)
        }
        $ctx.Response.Close()
    } catch {
        Write-Output "Error: $_"
    }
}
