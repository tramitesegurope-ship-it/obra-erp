$ErrorActionPreference = "Stop"

Write-Host "== Kosto 1.0: build Windows installer ==" -ForegroundColor Cyan

Push-Location $PSScriptRoot

Write-Host "Installing dependencies..." -ForegroundColor Yellow
npm --prefix ..\api install
npm --prefix ..\obra-erp-ui install
npm install

Write-Host "Building installer (.exe)..." -ForegroundColor Yellow
npm run dist

Write-Host "Done. Check desktop\dist" -ForegroundColor Green
Pop-Location
