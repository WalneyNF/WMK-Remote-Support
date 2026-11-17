# WMK Remote Support — Transferência de arquivos, duração e testes

**Situação em 17/11/2026:** o protocolo original suporta área de transferência de texto, **não** transferência de arquivos. O cronômetro de sessão foi adicionado ao componente `SessionView.tsx`; a compilação e a visualização em uma sessão real ainda precisam ser validadas. Não existe limite artificial de duração de sessão.

## 1. Cenário de suporte

- **Técnico → Cliente:** enviar instalador, atualizador, configuração ou relatório, com autorização do cliente.
- **Cliente → Técnico:** receber log, backup ou arquivo de diagnóstico autorizado.
- Não transferir senhas, chaves privadas e dados pessoais sem necessidade e consentimento.

## 2. Arquitetura proposta (a implementar)

```text
Interface WMK no PC do técnico
   ↕ selecionar arquivo e destino, mostrar progresso
Controlador — transferência autenticada por sessão
   ↕ blocos criptografados ponta a ponta (não são clipboard!)
Host do cliente — confirmação visível
   ↕ arquivo temporário → hash + verificação → renomeação atômica
Disco selecionado pelo cliente
```

### Mensagens sugeridas para uma extensão versionada do protocolo

- `FileOffer`: identificador aleatório, nome saneado, tamanho, hash SHA-256, direção e capacidades; **nunca confiar em caminhos absolutos enviados pelo outro lado**.
- `FileConsent`: aceitação explícita, destino local escolhido pelo usuário e limite de bytes.
- `FileChunk`: identificador + índice/offset + bytes, com limites de mensagem e fluxo.
- `FileAck`: confirmação de progresso e offset para retomada autenticada.
- `FileCancel`: cancelamento iniciado por qualquer um dos lados.
- `FileComplete`: tamanho e hash conferidos; só então concluir.

**Importante:** o protocolo está em `crates/airhand-proto/src/session.rs`, e a conexão em `crates/airhand-link/`. O sistema atual separa fluxo de controle e fluxo de dados grandes, mas isso **não** significa que o envio de arquivos esteja pronto. Recomenda-se um canal de dados independente com controle de congestionamento para não travar mouse/teclado e vídeo, negociado por capacidade. Controladores antigos devem ignorar a funcionalidade de maneira segura.

## 3. Requisitos obrigatórios de segurança

1. Ofertas de arquivos com aprovação explícita para cada envio/recebimento, incluindo nome, tamanho e direção. Não aceitar por padrão.
2. O cliente escolhe o diretório permitido e pode rejeitar a transferência, mesmo que a sessão remota já esteja conectada.
3. Sanear nomes, impedir `../`, caminhos absolutos, links simbólicos e sobrescrita silenciosa. Sem acesso arbitrário ao disco.
4. Respeitar cotas por arquivo/sessão; checar espaço livre e tamanho declarado versus recebido. Aplicar limites de memória e disco.
5. Usar canais criptografados e autenticados de ponta a ponta, com chaves específicas da sessão. O relay não deve gravar arquivos.
6. Gravar em arquivo temporário com permissões restritas; verificar SHA-256, escanear quando possível e só depois mover para o nome final.
7. Progresso em bytes, velocidade, ETA indicativo, pausa/cancelamento e reconexão; retomada vinculada ao mesmo cliente autorizado.
8. Logs técnicos apenas com metadados minimizados (usuário, horário, direção, nome, tamanho, resultado), nunca conteúdo nem tokens.
9. Aprovação separada e visível antes de executar qualquer arquivo transferido; transferência não é execução remota.
10. Testar arquivos vazios, grandes, interrupções de rede, nomes Unicode, múltiplos arquivos, colisões de nome e tentativas de traversal.

## 4. Tempo de sessão

O console agora tem um marcador `Sessão HH:MM:SS`, no painel de estatísticas da visualização remota.

- Conta somente quando `s.state === "live"`.
- Pausa durante conexão, aguardando aprovação e reconexão.
- Mantém o tempo acumulado na instância da tela enquanto a sessão existir.
- Não limita a duração ou desconecta por tempo de uso.
- Ainda não salva histórico persistente após fechar o atendimento. Esse registro deverá ser acrescentado ao módulo de chamados.

## 5. Testar no seu Windows

### Teste recomendado — dois computadores

1. Preparar relay em máquina acessível e abrir **UDP 4433**. Ajustar fingerprint de certificado confiável.
2. Compilar os clientes com endereço/fingerprint do relay.
3. Instalar WMK em um PC de teste e outro PC. Não testar diretamente nos clientes antes da homologação.
4. No PC a ser controlado, abrir o ícone do aplicativo na bandeja; ler **código de controle** e **código de pareamento**.
5. No PC técnico, abrir o console, informar o código de controle e, na primeira conexão, o pareamento.
6. Confirmar a identidade e a autorização no host; verificar visualização, mouse, teclado, áudio e encerramento voluntário.
7. Conferir o cronômetro `Sessão 00:00:00` e testar uma desconexão temporária, verificando se o valor não reinicia.
8. Testar tela bloqueada/UAC apenas com instalação do serviço apropriado; depuração comum pode não ter esses privilégios.

### Teste com uma única máquina

Recomenda-se usar uma **VM Windows** como host e o Windows físico como controlador. A VM deve ter conectividade ao relay. A conexão do PC consigo mesmo não é um bom teste: a tela pode se reproduzir infinitamente e mascarar problemas de captura.

### Build local

```powershell
git clone https://github.com/WalneyNF/WMK-Remote-Support.git
cd WMK-Remote-Support\client
npm ci
# Configure o servidor e o fingerprint real antes do build
$env:AIRHAND_SERVER = "relay.seudominio.com:4433"
$env:AIRHAND_SERVER_FP = "FINGERPRINT_SHA256_DO_SERVIDOR"
npm run tauri build
```

As variáveis `AIRHAND_*` são **identificadores internos legados**, que ainda não podem ser alterados sem atualizar a configuração e a camada de comunicação. O texto exibido aos usuários usa a marca WMK.

## 6. Acesso pelo Android

O repositório possui um app em `android/` com suporte documentado para atuar como controlador de computadores e como host de compartilhamento de tela. É preciso gerar/instalar o APK, apontar para o mesmo relay e efetuar o pareamento. O Android exige permissão explícita para compartilhar tela; para receber comandos no telefone, depende do serviço de acessibilidade, habilitado pelo proprietário.

O APK WMK ainda precisa de homologação, tradução e ícones finais. Android TV tem somente visualização. O servidor relay deve ser acessível pelo telefone — não basta conhecer o código remoto.

## 7. Outras funções desejáveis

- Modo **Suporte Rápido** portátil, consentimento explícito, código temporário e encerramento automático.
- Chat de sessão; destaque visual e desenho sobre a tela (com consentimento).
- Envio/recebimento de arquivos com fila e arrastar/soltar.
- Painel do equipamento: SO, CPU, RAM, disco, rede, impressoras, serviços, eventos e logs permitidos.
- Diagnóstico orientado e relatórios de atendimento editáveis (exportação PDF/HTML).
- Gravação opcional da sessão com aviso constante e autorização bilateral.
- Cadastro de empresas, técnicos, máquinas e histórico com perfis e MFA.
- Ferramentas específicas de suporte a sistemas comerciais e impressão de documentos.
- Assistente IA local/remoto com proteção de dados; sugestões exigem aprovação humana para executar ações.

## 8. Créditos e licença

WMK Remote Support — **Walney Moreira Klein (walneyk@hotmail.com)**.

Projeto derivado do Airhand, de **sqlpxc**, sob licença **MIT**. Os créditos originais e a licença devem ser preservados; consultar `LICENSE`.
