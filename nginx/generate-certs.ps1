$CertDir = Join-Path $PSScriptRoot "certs"
New-Item -ItemType Directory -Force -Path $CertDir | Out-Null
openssl req -x509 -nodes -days 365 `
  -newkey rsa:2048 `
  -keyout "$CertDir\server.key" `
  -out "$CertDir\server.crt" `
  -subj "/CN=localhost" `
  -addext "subjectAltName=DNS:localhost,IP:127.0.0.1"
