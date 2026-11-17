<p align="center"><img src="assets/wmk-remote-support.svg" alt="WMK Remote Support" width="150"></p>
<h1 align="center">WMK Remote Support</h1>
<p align="center"><strong>Suporte remoto e assistência técnica • Código aberto • Windows, macOS, Linux, Android e navegador</strong></p>
<p align="center"><em>Projeto em desenvolvimento — baseado no Airhand 0.2.3</em></p>

> **Estado atual:** o motor de acesso remoto deriva do Airhand e ainda precisa de compilação, testes de segurança e validação operacional. Cadastro de clientes, chamados, diagnósticos e IA são funcionalidades **planejadas**, não disponíveis nesta versão.
>
> **Atenção:** a arte de apresentação aprovada para o projeto é a logo futurista WMK. O arquivo vetorial desta etapa é um ícone simplificado inspirado na mesma identidade; os ícones binários dos instaladores ainda precisam ser gerados e substituídos.

## Sobre o projeto

O **WMK Remote Support** é uma iniciativa de transformar um software de desktop remoto em uma plataforma de atendimento técnico: conexões seguras com autorização, suporte a clientes, diagnóstico, histórico de chamados e documentação acessível em português brasileiro.

O mecanismo existente utiliza **QUIC/TLS 1.3**, criptografia ponta a ponta entre os dispositivos, codecs **AV1 / HEVC / H.264** quando suportados, conexão direta quando possível e retransmissão por servidor próprio como alternativa. O software cliente utiliza **Rust + Tauri 2 + React/TypeScript**. O aplicativo Android utiliza **Kotlin** e um núcleo em Rust.

## Funcionalidades existentes herdadas do Airhand

- Controle de tela, mouse e teclado;
- Conexão por código de controle de seis dígitos e pareamento inicial;
- Serviço Windows para tela de login e UAC, quando instalado adequadamente;
- Console com abas, múltiplos monitores e várias sessões;
- Acesso pelo navegador com serviço de console web;
- Compartilhamento de tela e controle no Android (com permissões do sistema);
- Áudio remoto, sincronização de área de transferência **apenas para texto**;
- Ajustes de resolução, FPS, bitrate e codec;
- Criptografia de ponta a ponta para sessões cliente-cliente;
- Servidor intermediário hospedável pelo próprio operador.

As funcionalidades acima constam no código/documentação do projeto base; **não constituem certificação de funcionamento nesta distribuição WMK**.

## Limitações conhecidas

- Transferência de arquivos ainda não existe; a área de transferência compartilha texto.
- Hosts Linux suportam X11, não Wayland completo.
- No Windows, o envio de Ctrl+Alt+Del não está implementado.
- O console web exige um serviço adicional, e o serviço pode visualizar o conteúdo descriptografado das sessões.
- Rede corporativa e bloqueio de UDP podem impedir caminho direto; o relay continua necessário.
- O servidor requer configuração e porta **UDP 4433**.
- O aplicativo ainda não está totalmente traduzido para português.

Veja [limitações técnicas](docs/limitations.md) e [segurança](docs/security.md) no material original, disponível em inglês.

## Começando no Windows (desenvolvedores)

### 1. Infraestrutura de comunicação

O Airhand requer um servidor intermediário acessível por ambos os computadores. O arquivo `docker-compose.yml` original descreve o serviço; o servidor mantém certificado e banco de códigos no diretório persistente `data/`.

```bash
docker compose up -d
docker compose logs
```

Registre o fingerprint SHA-256 do certificado gerado. Não apague `data/` nem exponha as informações secretas do servidor.

### 2. Compilar o cliente

Pré-requisitos: **Rust estável**, **Node.js** compatível com o projeto, **CMake**, ambiente **MSVC** com ferramentas C++ e WebView2 no Windows.

```powershell
git clone https://github.com/WalneyNF/WMK-Remote-Support.git
cd WMK-Remote-Support\client
npm ci
$env:AIRHAND_SERVER = "relay.exemplo.com:4433"
$env:AIRHAND_SERVER_FP = "COLOQUE_O_FINGERPRINT_SHA256_AQUI"
npm run tauri build
```

**Nota de compatibilidade:** os nomes internos `AIRHAND_SERVER` e `AIRHAND_SERVER_FP` foram mantidos deliberadamente para não romper o protocolo/configuração existente nesta etapa. Coloque o endereço e o fingerprint do **seu** relay, não os valores de exemplo.

O instalador NSIS deverá ser criado sob `client/src-tauri/target/release/bundle/nsis/` quando o build terminar com sucesso.

### 3. Conectar dois computadores

Instale o aplicativo em ambos, configure o mesmo servidor, obtenha no host o código de controle e informe-o na estação do técnico. Na primeira conexão, conclua o pareamento pelo código mostrado ao usuário do host. Teste sempre em duas máquinas próprias e com autorização explícita.

## Compilação pelo GitHub Actions

Na aba **Actions**, selecione **Windows — compilação WMK** e execute **Run workflow** (quando o workflow estiver disponível na branch). O pipeline valida o frontend e tenta produzir um instalador de testes; se não houver servidor configurado, os binários gerados não estarão prontos para suporte pela internet.

Artefatos de Actions **não são automaticamente Releases públicas**. Primeiro validaremos a compilação e as conexões.

## Evolução WMK

Consulte [ROADMAP.md](ROADMAP.md) para a lista de melhorias planejadas e critérios de validação.

## Segurança e consentimento

O acesso remoto exige autorização, identificação do técnico, possibilidade visível de desconectar, uso de um relay confiável e proteção dos códigos/segredos de pareamento. **Nunca habilite acesso irrestrito em computadores de clientes.** O serviço do Windows pode operar como SYSTEM: uma sessão comprometida pode ter controle administrativo da máquina.

## Créditos, licença e autoria

**WMK Remote Support — personalização e desenvolvimento:** Walney Moreira Klein — walneyk@hotmail.com.

**Projeto original:** [Airhand, por sqlpxc](https://github.com/sqlpxc/airhand).

**Licença:** MIT. O arquivo [LICENSE](LICENSE) mantém os direitos autorais originais. As mudanças WMK devem preservar as notas e atribuições exigidas por essa licença.

---
*Este repositório é um projeto independente e não é afiliado a AnyDesk ou TeamViewer.*
