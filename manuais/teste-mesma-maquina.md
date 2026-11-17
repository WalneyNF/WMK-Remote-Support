# WMK Remote Support — teste real na mesma máquina (Windows)

**Versão de laboratório 0.3-preview — não é uma versão para clientes.**

Este kit permite usar **um único PC** para executar três papéis isolados:

1. **Relay local** `127.0.0.1:4433/UDP`: identifica códigos e retransmite sessões.
2. **Host WMK instalado no Windows**: o computador que será controlado; permanece em modo *receber suporte*.
3. **Console WMK no navegador** `http://127.0.0.1:8080`: atua como técnico e acessa o host pela mesma máquina.

O navegador se conecta ao serviço web local. Não é necessário Docker, VPS, abrir portas no roteador ou instalar o controlador em outro computador.

> **Limite importante:** controlar a própria tela gera o **efeito espelho**, e captura/controle no mesmo desktop não reproduz diferenças de rede ou permissões de outro computador. Para homologação, ainda será necessário testar com dois PCs ou uma VM.

## 1. Baixar os dois artefatos do GitHub Actions

Abra [GitHub Actions](https://github.com/WalneyNF/WMK-Remote-Support/actions). Selecione a execução da branch `wmk/v0.3-preview-lab` que tenha **ambos os jobs aprovados**:

- `WMK-Remote-Support-Windows-teste`: instalador do cliente desktop, `.exe`.
- `WMK-Laboratorio-Local-Windows-sem-Docker`: dois programas servidores Windows, arquivos HTML do console e inicializador `WMK-Teste-Local.ps1`.

O GitHub exige login para baixar artefatos de Actions. **Não** confundir artefato com Release pública. Os arquivos só existem depois que os jobs terminarem com sucesso.

Extraia o kit inteiro numa pasta como `D:\Ferramentas\WMK-Teste-Local`. **Não execute componentes individuais diretamente de dentro do ZIP.**

## 2. Instalar o WMK desktop (host)

Instale o aplicativo Windows pelo instalador NSIS que acompanha os artefatos (requer permissão administrativa). O aplicativo original Windows usa um serviço para manter o host ativo, e um ícone na bandeja com o código de controle.

Confira que o host aponta para **127.0.0.1:4433** — esse valor está previsto no workflow de laboratório.

* **Não** troque para `access = "open"`. O pareamento inicial é obrigatório por segurança.
* Não permita controles remotos não assistidos por padrão.
* Se já havia usado outro servidor local em `127.0.0.1:4433` e aparece erro de certificado alterado, não apague o trust silenciosamente: confirme qual servidor estava sendo usado e faça uma migração manual e consciente.

## 3. Iniciar laboratório — um clique

No Explorador de Arquivos, abra a pasta extraída do kit. Clique com o botão direito no arquivo `WMK-Teste-Local.ps1` e selecione **Executar com PowerShell** (ou abra o PowerShell na pasta e execute):

```powershell
powershell.exe -NoProfile -File ".\WMK-Teste-Local.ps1"
```

O script verifica arquivos, detecta portas em uso, cria a pasta `dados-teste`, inicia os dois servidores **ligados apenas ao endereço de loopback** e abre o navegador no console.

No navegador, a URL é:

```text
http://127.0.0.1:8080
```

Se o script estiver bloqueado pela política de execução do Windows, confira sua origem e assinatura. É possível abrir o arquivo para inspecionar o conteúdo; **não** desabilite permanentemente a política de execução para contornar esse bloqueio.

O script mantém uma janela PowerShell aberta. Ao pressionar ENTER, somente os dois processos que ele iniciou serão encerrados. Os arquivos de teste e logs permanecem no disco.

## 4. Primeira sessão na mesma máquina

1. Abra o WMK instalado em **modo host/receber assistência**.
2. Clique no ícone WMK da bandeja, próximo ao relógio. Anote o **código de controle** (6 dígitos) e o **código de pareamento** (também 6 dígitos).
3. Com o script em execução, vá ao console web em `http://127.0.0.1:8080`.
4. Digite o código de controle do host e clique em conectar.
5. Na primeira conexão, informe o código de pareamento, solicitado pelo host.
6. Confirme a identidade da máquina. O navegador deve abrir a tela remota.
7. Teste mouse, teclado, cópia de texto, seletor de monitores e, se disponível, o botão **Capturar tela** para criar um PNG.
8. Observe o contador de tempo. Encerre a sessão pelo console e pelo host.

**Para evitar o efeito espelho infinito**, diminua a janela do navegador, mova-a para uma área da tela e não clique repetidamente na cópia remota dela. Se possível, use um monitor secundário ou VM.

## 5. O que este teste pode confirmar?

| Recurso | Teste | Status inicial |
| --- | --- | --- |
| Servidor relay Windows | Log e servidor em execução | Precisa do build |
| Console web Windows | Abre no navegador localhost | Precisa do build |
| Pareamento com código | Código de seis dígitos e autorização | Precisa de execução real |
| Controle de tela | Imagem, mouse e teclado | Precisa de execução real |
| Capturar PNG | Botão Capturar tela e download/diálogo | Código existente; precisa validar |
| Cronômetro sem limite | Tempo sobe durante conexão | Código existente; precisa validar |
| Transferência de arquivos | Enviar/receber em ambas direções | **Não implementado** |
| Gravação de vídeo auditável | Iniciar, consentir, pausar e salvar | **Não implementado** |

Não marque itens como concluídos sem reproduzir os testes. Use [manuais/roadmap.html](roadmap.html) e [manuais/evolucao.json](evolucao.json).

## 6. Arquivos e diagnóstico

O diretório `dados-teste` guarda certificados, banco de códigos e logs gerados pelos servidores. **Não publique o conteúdo dessa pasta** em Issues/README: certificados, banco, identificadores e arquivos privados podem conter informações sensíveis.

Se algo falhar:

- Confira `dados-teste\logs\relay-err.log` e `dados-teste\logs\web-err.log`.
- Certifique-se de que **UDP 4433** e **TCP 8080** não estejam ocupadas.
- Verifique se o serviço do host Windows está em execução.
- Lembre-se de que a compilação local padrão aponta para localhost; **não conecta clientes de outras cidades**. Para uso real, precisamos implantar um relay na Internet, com certificado de identidade previamente verificado e incluído no aplicativo.

## 7. Próxima versão para suporte profissional

Para clientes, manteremos dois modos: **Receber Ajuda** (cliente: abrir e compartilhar ID) e **Acessar Computador** (técnico: digitar ID, usar Meus dispositivos e ferramentas). As funções de transferência bidirecional e gravação com auditoria exigem protocolo próprio, autorização do host e testes de segurança; são tarefas abertas do roadmap e **não** foram embutidas neste kit.

---

**WMK Remote Support — Walney Moreira Klein — walneyk@hotmail.com**  
Base original Airhand — sqlpxc, licença MIT.
