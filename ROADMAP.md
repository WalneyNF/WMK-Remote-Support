# Roadmap — WMK Remote Support

> O status **planejado** indica que a funcionalidade ainda não foi implementada/validada.

## Etapa 0 — Base
- [x] Repositório renomeado para WMK Remote Support
- [x] README inicial em português do Brasil
- [x] Identidade vetorial WMK inicial no repositório
- [x] Workflow de tentativa de compilação NSIS para Windows
- [ ] Executar e validar Actions com logs reais
- [ ] Substituir ícones binários (ICO/PNG/ICNS) pela arte aprovada
- [ ] Testar comunicação host-controlador em dois Windows

## Etapa 1 — Localização e marca
- [ ] Traduzir **todas** as chaves do React (catálogos de idioma)
- [ ] Adicionar pt-BR às mensagens e menus do Rust
- [ ] Traduzir recursos Android e seletor de idioma
- [ ] Alterar nomes internos com migração de configuração/serviço e verificação de compatibilidade
- [ ] Traduzir manuais de instalação, segurança, configuração, uso e problemas conhecidos
- [ ] Atualizar tela Sobre, ícone do tray, janela, instalador e splash

## Etapa 2 — Atendimento
- [ ] Modo cliente rápido com autorização por sessão
- [ ] Transferência de arquivos autenticada e limitada
- [ ] Chat de suporte
- [ ] Cadastro de empresas, contatos e computadores
- [ ] Histórico de chamados com auditoria e exportação
- [ ] Diagnóstico autorizado (CPU, RAM, disco, rede e serviços)

## Etapa 3 — Segurança e produção
- [ ] Contas de técnicos, permissões e MFA
- [ ] Revisão de elevação de privilégios e proteção de segredos
- [ ] Testes contra abuso, sessão indevida, replay e DoS
- [ ] Assinatura digital, atualizações e rollback
- [ ] Infraestrutura de relay confiável com monitoramento e backups
- [ ] Publicação de Releases apenas após testes de qualidade

## Etapa 4 — Assistência com IA
- [ ] Análise opcional de logs com consentimento e redação de dados sensíveis
- [ ] Diagnóstico orientado e relatório técnico com revisão humana

## Princípio do projeto
Preservar o núcleo funcional do Airhand durante o rebranding e implementar melhorias em módulos para evitar regressões de segurança e latência.
