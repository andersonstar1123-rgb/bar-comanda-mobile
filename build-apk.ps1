#!/usr/bin/env pwsh

# Script para gerar APK do Bar Comanda Mobile
# Requer: Node.js, EAS CLI (npm install -g eas-cli)

Write-Host "📱 Gerando APK do Bar Comanda Mobile..." -ForegroundColor Green

# Verifica se está no diretório correto
if (-not (Test-Path "package.json")) {
    Write-Host "❌ Execute este script na pasta mobile/" -ForegroundColor Red
    exit 1
}

# Verifica EAS CLI
try {
    eas --version | Out-Null
} catch {
    Write-Host "❌ EAS CLI não encontrado. Instale com: npm install -g eas-cli" -ForegroundColor Red
    exit 1
}

# Verifica login
$loggedIn = eas whoami 2>$null
if (-not $loggedIn) {
    Write-Host "🔐 Faça login no Expo:" -ForegroundColor Yellow
    eas login
}

# Configura variáveis de ambiente para build
$env:EXPO_PUBLIC_API_URL = "http://SEU_IP:3001/api"

Write-Host "🔨 Iniciando build (preview - APK debug)..." -ForegroundColor Yellow
Write-Host "   Isso pode levar 10-20 minutos..." -ForegroundColor Gray

try {
    eas build --platform android --profile preview --non-interactive
    Write-Host "✅ Build concluído!" -ForegroundColor Green
    Write-Host "📥 Baixe o APK no link fornecido acima ou em: https://expo.dev/accounts/[seu-usuario]/projects/bar-comanda/builds" -ForegroundColor Cyan
} catch {
    Write-Host "❌ Erro no build. Tente build local:" -ForegroundColor Red
    Write-Host "   eas build --platform android --profile preview --local" -ForegroundColor Gray
}

Write-Host ""
Write-Host "📋 Para instalar no celular:" -ForegroundColor Cyan
Write-Host "   1. Baixe o APK do link acima" -ForegroundColor Gray
Write-Host "   2. Transfira para o celular (WhatsApp, Drive, cabo USB)" -ForegroundColor Gray
Write-Host "   3. No celular, permita 'Instalar apps desconhecidos' para o gerenciador de arquivos" -ForegroundColor Gray
Write-Host "   4. Abra o APK e instale" -ForegroundColor Gray
Write-Host ""
Write-Host "🔧 Para build de produção (APK assinado):" -ForegroundColor Cyan
Write-Host "   eas build --platform android --profile production" -ForegroundColor Gray