# WMK Remote Support — Roadmap técnico

**Responsável:** Walney Moreira Klein — walneyk@hotmail.com  
**Licença base:** MIT (copyright original sqlpxc preservado)  
**Acompanhamento:** [manuais/evolucao.json](manuais/evolucao.json) é a fonte de status para planejamento.

## Inventário resumido

| Recurso | Estado |
| --- | --- |
| Ver/controlar computador remoto | Herdado do Airhand; validar na distribuição WMK |
| Computadores salvos por código | Herdado; estrutura empresarial ainda não |
| Cronômetro de sessão | Código implementado; requer testes |
| Capturar tela remota PNG | Código implementado; requer validação do Actions e teste real |
| Transferir qualquer tipo de arquivo | **Não implementado** |
| Programa pronto para cliente configurar sem suporte | **Não implementado** |
| Português completo | Parcial |
| Histórico empresarial / relatórios | Planejado |

## Prioridade P0 — atendimento funcional

1. **Homologar acesso remoto:** build Windows, duas máquinas, conexão através de relay próprio com fingerprint fixado, pareamento, reconexão e UAC.
2. **Validar captura de tela:** imagem PNG da tela remota recebida pelo Worker; seleção do nome/pasta via seletor nativo quando disponível; download como alternativa.
3. **Implementar transferência bidirecional de arquivos:** canal de dados próprio, criptografado e autenticado; consentimento explícito para cada operação; nomes e destinos seguros; barra de progresso e cancelamento. Testar grandes arquivos sem bloquear o controle remoto.
4. **Simplificar instalação:** servidor WMK pré-configurado com identidade verificável; tela inicial apenas para receber assistência ou acessar PC; opções técnicas recolhidas em Avançado.

## Arquitetura proposta da transferência

```text
Técnico: escolher arquivo / baixar do cliente
          |
          v
    Solicitação de transferência (metadados)
          |
          v
    Confirmação no computador de destino
          |
          v
    Fluxo criptografado em blocos
          |
          v
    Arquivo temporário + limites + SHA-256
          |
          v
    Escolha de destino + conclusão e relatório
```

**Não** usar o protocolo de texto da área de transferência para arquivos. Transferências precisam de canal distinto que preserve a responsividade de mouse, teclado e vídeo. Sem upload automático de arquivos ao servidor. O arquivo no destino jamais deve ser executado automaticamente.

## Segurança obrigatória

- Autorização para cada operação, com origem, destino, tamanho e nome visíveis.
- Impedir path traversal, caminhos absolutos remotos, symlinks e gravações fora da pasta autorizada.
- Exigir identidade confiável e confirmação do certificado do relay.
- Hash SHA-256 do arquivo completo; salvar primeiro em diretório temporário restrito.
- Limites configuráveis, cancelamento, retomada vinculada à autorização e proteção contra esgotamento de disco.
- Log mínimo de metadados sem conteúdo ou segredos; revisão de privacidade/LGPD.
- É possível transferir EXE, DLL, ZIP, DBF, FPT, CDX, XML, PDF etc., mas **transferir não significa executar**.

## Prioridade P1

- Tradução integral pt-BR: desktop React, menus Rust, Android e instalador NSIS.
- Lista de clientes por empresa/unidade e computador com acesso controlado por equipe.
- Histórico por atendimento, notas do técnico, evidências e exportação.
- Modo portátil de suporte rápido sem instalação do serviço; modo Host empresarial com instalação e permissões adequadas.

## Prioridade P2

- Diagnóstico de CPU, RAM, disco, rede, impressoras e serviços, somente mediante autorização.
- Chat, anotação sobre a tela, relatórios e orientação assistida.
- Suporte mobile e console web com autenticação forte.

## Condição para disponibilizar a clientes

Só publicar instaladores como Release depois de build verde, testes em máquinas reais, testes de segurança e configuração de relay real. Um workflow com sucesso **não comprova** operação ponta a ponta.

[Plano detalhado e testes](manuais/transferencia-e-testes.md) · [Inventário do projeto](manuais/o-que-existe.html)

## Auditoria e gravação de sessões (P0/P1)

- [ ] Autorização explícita de gravação na máquina controlada e aviso visível para ambas as partes
- [ ] Captura dos quadros remotos decodificados sem bloquear mouse, teclado e áudio
- [ ] Escrita incremental de vídeo WebM/MP4, de acordo com o codec suportado
- [ ] Controles de iniciar, pausar, continuar e parar a gravação, inclusive após reconexão
- [ ] Arquivos por atendimento, hashes SHA-256, relatório de eventos e proteção de dados
- [ ] Perfis e políticas empresariais, retenção, acesso autorizado às evidências e MFA

Documento completo: [manuais/gravacao-auditoria.html](manuais/gravacao-auditoria.html).
