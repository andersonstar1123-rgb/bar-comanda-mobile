#!/usr/bin/env pwsh

# Script para gerar o app para iPhone (.ipa) do Bar Comanda
# O build acontece NA NUVEM do Expo (EAS Build) porque Windows não compila iOS.
# Requisitos:
#   - Conta Expo (https://expo.dev/signup)
#   - Conta Apple Developer (gratuita nah para instalar em iPhone físico precisa)
#   - eas-cli instalado (npm install -g eas-cli)

Write-Host ""
Write-Host "📱 BUILD DO APP PARA IPHONE (.ipa) - BAR COMANDA" -ForegroundColor Green
Write-Host "=============================================" -ForegroundColor Gray

if (-not (Test-Path "package.json")) {
    Write-Host "❌ Execute este script na pasta mobile/" -ForegroundColor Red
    exit 1
}

# 1. Login no Expo (necessário uma única vez)
Write-Host ""
Write-Host "1️⃣  Login no Expo:" -ForegroundColor Yellow
try {
    $who = eas whoami 2>$null
} catch { $who = $null }
if (-not $who -or $who -match "Not logged in") {
    eas login
} else {
    Write-Host "   Já logado como: $who" -ForegroundColor Cyan
}

# 2. Configurar projeto EAS (uma única vez)
Write-Host ""
Write-Host "2️⃣  Configurando projeto EAS (cria id no expo.dev)..." -ForegroundColor Yellow
eas init --non-interactive 2>$null

# 3. Build na nuvem
Write-Host ""
Write-Host "3️⃣  Iniciando build iOS na nuvem (10-20 min)..." -ForegroundColor Yellow
Write-Host "   Vai pedir as credenciais Apple (ID Apple + App ID)." -ForegroundColor Gray

eas build --platform ios --profile preview --non-interactive
$code = $LASTEXITCODE

if ($code -ne 0) {
    Write-Host ""
    Write-Host "⚠️  O build precisa de perfil de distribuição. Rode interativo:" -ForegroundColor Yellow
    Write-Host "   eas build --platform ios --profile preview" -ForegroundColor Gray
}

Write-Host ""
Write-Host "✅ INSTALAÇÃO NO IPHONE" -ForegroundColor Green
Write-Host "1. `eas build --platform ios --profile preview` gera um link de download (.ipa)" -ForegroundColor Gray
Write-Host "2. Baixe no iPhone e instale (permita perfil de desenvolvedor em Ajustes > Geral > VPN e Gerenciamento de Dispositivo)" -ForegroundColor Gray
Write-Host ""
Write-Host "📌 Publicar na App Store: `eas build --platform ios --profile production && eas submit --platform ios`" -ForegroundColor Cyan
Write-Host "   (exige Apple Developer Program paga, US$ 99/ano)" -ForegroundColor Gray