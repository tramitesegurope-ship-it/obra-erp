# Obra ERP Desktop

Este empaquetado crea una app instalable para Windows y Ubuntu usando Electron.

## Requisitos
- Node.js instalado

## Pasos
1) Instalar dependencias del backend y frontend:
   - `npm --prefix ../api install`
   - `npm --prefix ../obra-erp-ui install`
2) Instalar dependencias de desktop:
   - `npm install`
3) Generar instaladores:
   - `npm run dist`

Los instaladores quedan en `desktop/dist/`.
Para crear `.exe` lo ideal es correr el comando en Windows. Para Linux, correrlo en Ubuntu.

## Windows
Cuando tengas Windows instalado, abre PowerShell y ejecuta:
`desktop/build-windows.ps1`

## Datos locales
- La base de datos se copia al primer inicio a:
  - Windows: `%APPDATA%/Obra ERP/data/db/dev.db`
  - Linux: `~/.config/Obra ERP/data/db/dev.db`
- Si quieres reiniciar la base, borra ese archivo y vuelve a abrir la app.
