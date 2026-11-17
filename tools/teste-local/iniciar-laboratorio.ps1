#Requires -Version 5.1
<#
WMK Remote Support - Laboratorio de uma maquina (Windows)
Conecta o Host instalado ao relay local e ao Console Web local.
Nenhuma porta de acesso remoto e publicada na rede.
#>
[CmdletBinding()]
param(
  [switch]$NaoAbrirNavegador,
  [int]$PortaRelay = 4433,
  [int]$PortaConsole = 8080
)
$ErrorActionPreference = "Stop"
$kit = $PSScriptRoot
$relayExe = Join-Path $kit "bin\wmk-relay.exe"
$webExe = Join-Path $kit "bin\wmk-console-web.exe"
$www = Join-Path $kit "www\index.html"
foreach ($f in @($relayExe, $webExe, $www)) {
    if (-not (Test-Path -LiteralPath $f -PathType Leaf)) {
        throw "Arquivo ausente: $f. Extraia o ZIP completo do laboratorio antes de iniciar."
    }
}
if ($PortaRelay -lt 1024 -or $PortaRelay -gt 65535 -or $PortaConsole -lt 1024 -or $PortaConsole -gt 65535) {
    throw "Use portas de 1024 a 65535."
}
if ($PortaRelay -ne 4433) {
    Write-Warning "A compilacao padrao do cliente WMK usa localhost:4433. Outra porta exige alterar a configuracao do cliente."
}
# Evitar executar um segundo servidor sobre endpoints de outro processo.
foreach ($port in @($PortaRelay, $PortaConsole)) {
    if (Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue) {
        throw "A porta TCP $port ja esta em uso. Escolha outra ou feche o programa que a utiliza."
    }
}
if (Get-Command Get-NetUDPEndpoint -ErrorAction SilentlyContinue) {
    if (Get-NetUDPEndpoint -LocalPort $PortaRelay -ErrorAction SilentlyContinue) {
        throw "A porta UDP $PortaRelay ja esta em uso. Pare o relay antigo antes de continuar."
    }
}
$data = Join-Path $kit "dados-teste"
$relayData = Join-Path $data "relay"
$webData = Join-Path $data "console"
$logs = Join-Path $data "logs"
foreach ($dir in @($data,$relayData,$webData,$logs)) {
    New-Item -ItemType Directory -Path $dir -Force | Out-Null
}
$env:AIRHAND_LISTEN = "127.0.0.1:${PortaRelay}"
$env:AIRHAND_CERT = Join-Path $relayData "cert.pem"
$env:AIRHAND_KEY = Join-Path $relayData "key.pem"
$env:AIRHAND_DB = Join-Path $relayData "airhand.db"
$env:AIRHAND_CERT_NAMES = "localhost"
$env:AIRHAND_SERVER = "127.0.0.1:${PortaRelay}"
$env:AIRHAND_SERVER_FP = ""
$env:AIRHAND_WEB_LISTEN = "127.0.0.1:${PortaConsole}"
$env:AIRHAND_WEB_ROOT = Join-Path $kit "www"
$env:AIRHAND_WEB_CERT = Join-Path $webData "cert.pem"
$env:AIRHAND_WEB_KEY = Join-Path $webData "key.pem"
$env:AIRHAND_SERVER_TRUST = Join-Path $webData "server-trust.txt"
$env:AIRHAND_WEB_IDENTITY = Join-Path $webData "controller-key.txt"
$env:AIRHAND_NAME = "WMK Laboratorio (console)"
$env:RUST_LOG = "info"
# Nao define AIRHAND_SERVER_FP: somente no laboratorio 127.0.0.1, confia na
# primeira conexao e memoriza o fingerprint. Nao usar esta politica na Internet.
$relay = $null
$web = $null
try {
    Write-Host "=== WMK Remote Support - Laboratorio Local ===" -ForegroundColor Cyan
    Write-Host "Iniciando relay QUIC somente em 127.0.0.1:$PortaRelay"
    $relay = Start-Process -FilePath $relayExe -WorkingDirectory $kit -PassThru -RedirectStandardOutput (Join-Path $logs "relay-out.log") -RedirectStandardError (Join-Path $logs "relay-err.log")
    Start-Sleep -Seconds 2
    $relay.Refresh()
    if ($relay.HasExited) { throw "Relay encerrou. Verifique $logs\relay-err.log" }
    Write-Host "Iniciando console web somente em 127.0.0.1:$PortaConsole"
    $web = Start-Process -FilePath $webExe -WorkingDirectory $kit -PassThru -RedirectStandardOutput (Join-Path $logs "web-out.log") -RedirectStandardError (Join-Path $logs "web-err.log")
    Start-Sleep -Seconds 2
    $web.Refresh()
    if ($web.HasExited) { throw "Console encerrou. Verifique $logs\web-err.log" }
    Write-Host ""
    Write-Host "1) Abra WMK Remote Support INSTALADO no Windows (modo RECEBER AJUDA/host)." -ForegroundColor Yellow
    Write-Host "2) Use o menu da bandeja do programa para copiar CODIGO DE CONTROLE e CODIGO DE PAREAMENTO."
    Write-Host "3) No navegador, digite o codigo de controle e faca o pareamento."
    Write-Host "4) Confirme a tela, o mouse/teclado, os prints e o tempo de sessao."
    Write-Host "5) Nao e preciso outro computador. Voce vera efeito espelho ao controlar a propria tela."
    Write-Host ""
    Write-Host "Pagina local: http://127.0.0.1:$PortaConsole" -ForegroundColor Green
    Write-Host "Logs: $logs"
    Write-Host "ATENCAO: nao utilize este laboratorio como servidor para clientes na Internet." -ForegroundColor Yellow
    if (-not $NaoAbrirNavegador) {
        Start-Process "http://127.0.0.1:$PortaConsole"
    }
    Read-Host "Pressione ENTER para encerrar os servidores deste laboratorio"
} finally {
    foreach ($proc in @($web,$relay)) {
        if ($null -ne $proc) {
            try {
                $proc.Refresh()
                if (-not $proc.HasExited) {
                    Stop-Process -Id $proc.Id -Force -ErrorAction SilentlyContinue
                }
            } catch {
                Write-Warning "Nao foi possivel encerrar um processo do laboratorio: $_"
            }
        }
    }
    Write-Host "Laboratorio encerrado. Dados e logs preservados em dados-teste."
}
