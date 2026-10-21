# Graph Report - zapzap  (2026-10-21)

## Corpus Check
- 269 files · ~411,011 words
- Verdict: corpus is large enough that graph structure adds value.
- Unclassified: 31 file(s) not represented in the graph (top: .css 27, (none) 3, .webmanifest 1)

## Summary
- 1701 nodes · 4459 edges · 106 communities (81 shown, 25 thin omitted)
- Extraction: 71% EXTRACTED · 29% INFERRED · 0% AMBIGUOUS · INFERRED: 1273 edges (avg confidence: 0.85)
- Token cost: 90,000 input · 25,000 output

## Community Hubs (Navigation)
- Conexões Evolution API
- Tela Conversas (chat)
- Campanhas (envio em massa)
- Motor de automações
- Filas e atendimento (API)
- Editor do chatbot
- Envio e agendamento
- Chatbot (hook de mensagens)
- API de relatórios
- API de integrações e núcleo
- Tela Enviar
- Tela Automações e tempo real
- Usuários e auditoria (API)
- API de conversas
- API VLT (séries)
- API de automações
- Chatbot (fluxos)
- Tela Atendimento (filas)
- Autenticação e sessões
- Tela Conexões
- Push (Web Push VAPID)
- Manual: dúvidas e Evolution
- Histórico de versões
- Tela Campanhas
- Etiquetas e notas (API)
- Tela Relatórios
- Respostas rápidas e contatos
- Tela VLT (leads)
- Armazenamento de conversas
- Esquema base do banco
- Manual: usuários e permissões
- Manual: conexões WhatsApp
- Histórico de versões 2
- Auditoria (API)
- Tela Configurações
- Tela Integrações
- Tela Usuários
- Histórico de versões 3
- Manual: etiquetas e grupos
- Manual: conversas e envio
- Painel inicial
- Manual: configurações
- Manual: usuários e permissões 2
- Respostas rápidas (API)
- Tela Histórico
- Webhooks de saída
- Tela Agendadas
- Ajuda embutida
- Manual: usuários e permissões 3
- Manual: filas e chatbot
- API pública
- Manual: automações
- Módulo grupos
- Tela Etiquetas
- Histórico de versões 4
- Histórico de versões 5
- Manual: API pública e tokens
- Núcleo app.js (ZZ)
- Tela Auditoria
- Tela Grupos
- Histórico de versões 6
- Instalação
- Manual: automações 2
- Histórico de versões 7
- Instalação 2
- VLT (hook de leads)
- Mensagens guardadas
- Push no navegador
- Histórico de versões 8
- Instalação 3
- Manual: conexões WhatsApp 2
- Tabelas de automações
- Tela Apagadas
- Manual: campanhas
- Manual: conexões WhatsApp 3
- Dashboard (API)
- Tabelas de campanhas
- Tabelas do chatbot
- API de conversas 2
- SSE (tempo real)
- Tabelas de etiquetas
- Histórico de versões 9
- Tabelas de envios
- Tabelas de notificações
- Tabelas VLT
- Histórico de versões 10
- Tabelas conv msgs
- Tabelas conversas
- Tabelas lembretes resp
- Tabelas mensagens guardadas
- Tabelas presenca
- Tabelas respostas

## God Nodes (most connected - your core abstractions)
1. `bd()` - 216 edges
2. `out()` - 206 edges
3. `inst()` - 152 edges
4. `entrada()` - 84 edges
5. `aud_detalhe()` - 72 edges
6. `Página Versões` - 61 edges
7. `uid()` - 50 edges
8. `evo()` - 49 edges
9. `cache_arq()` - 36 edges
10. `ZapZap — Painel de WhatsApp do Alequizão` - 30 edges

## Surprising Connections (you probably didn't know these)
- `tabela conversas_lidas` --conceptually_related_to--> `Conversas`  [AMBIGUOUS]
  docs/ARQUITETURA.md → README.md
- `tabela envios` --conceptually_related_to--> `Envio`  [AMBIGUOUS]
  docs/ARQUITETURA.md → README.md
- `Polling inteligente` --semantically_similar_to--> `Recebimento em tempo real (webhook)`  [INFERRED] [semantically similar]
  README.md → docs/INSTALACAO.md
- `Atualização forçada` --conceptually_related_to--> `Atualização forçada`  [INFERRED]
  README.md → docs/ARQUITETURA.md
- `Evolution API v2.3` --conceptually_related_to--> `Evolution API v2.3.x`  [INFERRED]
  README.md → docs/INSTALACAO.md

## Import Cycles
- None detected.

## Hyperedges (group relationships)
- **Fluxo de atendimento em fila (SLA, assumir, transferir, encerrar)** — docs_manual_atendimento, docs_manual_filas, docs_manual_sla_cores_espera, docs_manual_assumir_atendimento, docs_manual_transferir_atendimento, docs_manual_encerrar_reabrir, docs_manual_encerrar_por_falta_de_resposta, docs_manual_linha_do_tempo [EXTRACTED 1.00]
- **Recursos que dependem do recebimento em tempo real** — docs_manual_recebimento_tempo_real, docs_manual_automacoes, docs_manual_chatbot, docs_manual_opt_out, docs_manual_mensagens_apagadas, docs_manual_filas [EXTRACTED 1.00]
- **Integração com sistemas externos (token, escopos, API pública, webhooks, segredo)** — docs_manual_integracoes, docs_manual_token_api, docs_manual_escopos_token, docs_manual_api_publica, docs_manual_webhooks_saida, docs_manual_segredo_webhook [EXTRACTED 1.00]
- **Fluxo de atualização forçada (deploy → __V__ → versao.php → Service Worker)** — deploy_exemplo, docs_arquitetura_marcador_v, src_versao, docs_arquitetura_service_worker_servido_por_php, docs_arquitetura_atualizacao_forcada [EXTRACTED 1.00]
- **Recebimento em tempo real: Evolution → webhook.php → hooks → automações/chatbot/atendimento** — docs_instalacao_evolution_api_v2_3_x, src_webhook, docs_arquitetura_hooks_php_eventos_do_webhook, docs_arquitetura_eventos_do_webhook_messages_upsert_connection_update_presence_update, changelog_modulo_automacoes_motor_editor_e_simulador, changelog_modulo_chatbot_fluxos_e_simulador, changelog_modulo_atendimento_filas_e_atendimentos [INFERRED 0.85]
- **Tarefas periódicas: cron.php (agendadas) e cron_tick.php → cron.d (filas, campanhas, automações, lembretes, alertas)** — src_cron, src_cron_tick, docs_arquitetura_cron_d_php_tarefas_periodicas, docs_arquitetura_tabela_agendadas, docs_arquitetura_tabela_campanhas, docs_arquitetura_tabela_lembretes_resp, changelog_alerta_por_e_mail_quando_o_whatsapp_desconectar [INFERRED 0.85]

## Communities (106 total, 25 thin omitted)

### Community 0 - "Conexões Evolution API"
Cohesion: 0.05
Nodes (90): conexao_alertar(), email_modelo(), enviar_email(), kv_get(), kv_set(), {closure#2}(), {closure#1}(), {closure#10}() (+82 more)

### Community 1 - "Tela Conversas (chat)"
Cohesion: 0.07
Nodes (81): abrirChat(), abrirDadosContato(), buscar(), pintar(), abrirLb(), abrirLembrete(), acaoAtendimento(), ajustarViewport() (+73 more)

### Community 2 - "Campanhas (envio em massa)"
Cohesion: 0.08
Nodes (56): camp_agora(), camp_apagar_arquivo(), camp_avisos(), camp_chave(), camp_chave_var(), camp_contagens(), camp_enviados_hoje(), camp_erro() (+48 more)

### Community 3 - "Motor de automações"
Cohesion: 0.08
Nodes (36): {closure#11}(), {closure#13}(), {closure#14}(), {closure#1}(), au_acoes(), au_agora(), au_carregar(), au_casa() (+28 more)

### Community 4 - "Filas e atendimento (API)"
Cohesion: 0.10
Nodes (42): {closure#1}(), {closure#3}(), {closure#15}(), {closure#10}(), {closure#11}(), {closure#12}(), {closure#13}(), {closure#14}() (+34 more)

### Community 5 - "Editor do chatbot"
Cohesion: 0.13
Nodes (42): adicionarNo(), alcancaveis(), avisoSim(), cardFluxo(), carregarFilas(), carregarFluxos(), carregarLogs(), carregarSessoes() (+34 more)

### Community 6 - "Envio e agendamento"
Cohesion: 0.11
Nodes (39): ag_apagar_anexo(), ag_caminho_anexo(), ag_enviar(), ag_processar(), ag_resumo(), ag_tipo_por_ext(), ag_autor(), ag_buscar() (+31 more)

### Community 7 - "Chatbot (hook de mensagens)"
Cohesion: 0.09
Nodes (34): {closure#3}(), filas_atrasado(), filas_fmt(), filas_inativ(), {closure#1}(), cb_atend_cols(), cb_avancar(), cb_chamar_webhook() (+26 more)

### Community 8 - "API de relatórios"
Cohesion: 0.15
Nodes (33): {closure#10}(), {closure#11}(), {closure#12}(), {closure#13}(), {closure#14}(), {closure#15}(), {closure#4}(), {closure#5}() (+25 more)

### Community 9 - "API de integrações e núcleo"
Cohesion: 0.12
Nodes (32): cbapi_fluxo(), {closure#11}(), {closure#12}(), {closure#13}(), {closure#14}(), {closure#1}(), {closure#10}(), {closure#11}() (+24 more)

### Community 10 - "Tela Enviar"
Cohesion: 0.14
Nodes (36): atualizarVerif(), avatar(), definirDestino(), enviar(), enviarArquivo(), erroCampo(), escolherArquivo(), fmtWa() (+28 more)

### Community 11 - "Tela Automações e tempo real"
Cohesion: 0.12
Nodes (34): render(), abrirEditor(), acaoHtml(), addPalavra(), agoraSim(), aoClicar(), cardHtml(), carregar() (+26 more)

### Community 12 - "Usuários e auditoria (API)"
Cohesion: 0.12
Nodes (26): {closure#1}(), {closure#2}(), {closure#1}(), {closure#10}(), {closure#11}(), {closure#12}(), {closure#13}(), {closure#15}() (+18 more)

### Community 13 - "API de conversas"
Cohesion: 0.15
Nodes (28): {closure#11}(), {closure#12}(), {closure#14}(), {closure#15}(), {closure#3}(), {closure#4}(), {closure#5}(), {closure#6}() (+20 more)

### Community 14 - "API VLT (séries)"
Cohesion: 0.11
Nodes (18): {closure#3}(), {closure#13}(), {closure#14}(), {closure#15}(), {closure#2}(), vlt_balde(), vlt_conta(), vlt_data() (+10 more)

### Community 15 - "API de automações"
Cohesion: 0.12
Nodes (23): au_descricao_gatilho(), au_id(), au_obter(), au_row_json(), {closure#1}(), {closure#10}(), {closure#12}(), {closure#2}() (+15 more)

### Community 16 - "Chatbot (fluxos)"
Cohesion: 0.12
Nodes (17): cbapi_arestas(), cbapi_conteudo(), cbapi_erro(), cbapi_fluxo_out(), cbapi_gatilho(), cbapi_id(), cbapi_nos_out(), cbapi_pag() (+9 more)

### Community 17 - "Tela Atendimento (filas)"
Cohesion: 0.17
Nodes (26): render(), abrirDet(), acao(), alertar(), card(), carregar(), carregarFilas(), carregarLembr() (+18 more)

### Community 18 - "Autenticação e sessões"
Cohesion: 0.11
Nodes (19): bd (MySQL), {closure#1}(), {closure#4}(), {closure#5}(), {closure#1}(), auditar(), auth_clear(), auth_ok() (+11 more)

### Community 19 - "Tela Conexões"
Cohesion: 0.19
Nodes (23): render(), abrirNovo(), abrirQr(), atualizarRelogio(), conectou(), gerar(), passo(), pintar() (+15 more)

### Community 20 - "Push (Web Push VAPID)"
Cohesion: 0.14
Nodes (21): {closure#2}(), {closure#6}(), push_host_curto(), push_prefs_limpa(), {closure#1}(), push_b64u(), push_b64u_dec(), push_chave_kv() (+13 more)

### Community 21 - "Manual: dúvidas e Evolution"
Cohesion: 0.12
Nodes (22): docs/MANUAL.md, Página Ajuda com manual, v1.0.115, Recebimento em tempo real (webhook), Alequizão (desenvolvedor), Atualização forçada, Chart.js, Conexões (+14 more)

### Community 22 - "Histórico de versões"
Cohesion: 0.16
Nodes (23): Janela de aviso de atualização (removida), Página Versões, Republicação sem alterações de arquivos, v1.0.100, v1.0.101, v1.0.102, v1.0.103, v1.0.104 (+15 more)

### Community 23 - "Tela Campanhas"
Cohesion: 0.18
Nodes (22): acaoCampanha(), analisar(), assistente(), fecha(), p1(), p2(), p3(), p4() (+14 more)

### Community 24 - "Etiquetas e notas (API)"
Cohesion: 0.18
Nodes (18): {closure#10}(), {closure#11}(), {closure#12}(), {closure#13}(), {closure#14}(), {closure#2}(), {closure#4}(), {closure#5}() (+10 more)

### Community 25 - "Tela Relatórios"
Cohesion: 0.19
Nodes (21): animar(), carregar(), casca(), destroy(), detalhe(), erroTela(), exportar(), heatmap() (+13 more)

### Community 26 - "Respostas rápidas e contatos"
Cohesion: 0.16
Nodes (15): avatar(), cartao(), render(), carrega(), abrir(), card(), carregar(), desenhar() (+7 more)

### Community 27 - "Tela VLT (leads)"
Cohesion: 0.19
Nodes (18): carregar(), casca(), completar(), destroy(), formFiltro(), graficos(), htmlCalendario(), htmlFunil() (+10 more)

### Community 28 - "Armazenamento de conversas"
Cohesion: 0.19
Nodes (18): cv_lid_aprender(), {closure#1}(), cs_aprender(), cs_atualizar_status(), cs_cv(), cs_gravar_msg(), cs_gravar_registro(), cs_jid_ignorar() (+10 more)

### Community 29 - "Esquema base do banco"
Cohesion: 0.15
Nodes (16): auditoria, config_kv, eventos, sessoes, usuario_instancias, usuario_permissoes, usuarios, atendimento_eventos (+8 more)

### Community 30 - "Manual: usuários e permissões"
Cohesion: 0.15
Nodes (14): api/*.php (um arquivo por módulo), Atualização forçada, Catálogo de permissões (chave => [grupo, rótulo]), Criando um módulo (4 passos), cron.d/*.php (tarefas periódicas), manual/img (imagens da Ajuda), modules/*.js e *.css (uma tela por arquivo), Permissões default-deny (+6 more)

### Community 31 - "Manual: conexões WhatsApp"
Cohesion: 0.11
Nodes (19): Cabeçalho X-Instancia, evo() / evo_global(), inst(), Leitura x escrita, Segurança do Evolution (proxy no servidor), tabela usuario_instancias, tabela webhooks_saida, Várias conexões (instância ativa) (+11 more)

### Community 32 - "Histórico de versões 2"
Cohesion: 0.13
Nodes (18): Alerta por e-mail quando o WhatsApp desconectar, Chaves VAPID sem Composer, Gravação de áudio no navegador, Service worker de notificações, v1.0.105, v1.0.112, v1.0.93, Web Push (notificações no aparelho) (+10 more)

### Community 33 - "Auditoria (API)"
Cohesion: 0.20
Nodes (11): aud_cats(), aud_csv(), aud_dia(), aud_frase(), aud_info(), aud_linha(), aud_mapa(), aud_where() (+3 more)

### Community 34 - "Tela Configurações"
Cohesion: 0.22
Nodes (15): render(), buscarQr(), carregar(), desenhar(), desenharConexao(), erroCampo(), esqueleto(), forca() (+7 more)

### Community 35 - "Tela Integrações"
Cohesion: 0.24
Nodes (15): render(), cartaoHook(), cartaoToken(), desenhar(), excluirHook(), formHook(), logsHook(), mostrarSegredo() (+7 more)

### Community 36 - "Tela Usuários"
Cohesion: 0.27
Nodes (15): abaAtividade(), abaPermissoes(), abaSessoes(), abrirEditor(), abrirOverlay(), catalogo(), excluir(), invalido() (+7 more)

### Community 37 - "Histórico de versões 3"
Cohesion: 0.27
Nodes (16): Botão Assumir vira selo Em atendimento por você, Cores por tempo sem resposta (SLA), Módulo Atendimento (filas e atendimentos), Painel Meus atendimentos, v1.0.74, v1.0.86, v1.0.88, v1.0.90 (+8 more)

### Community 38 - "Manual: etiquetas e grupos"
Cohesion: 0.15
Nodes (16): Etiquetas e notas internas, Presença em tempo real (digitando/gravando), Respostas rápidas, v1.0.69, v1.0.91, Eventos do webhook (messages.upsert, connection.update, presence.update), hooks/*.php (eventos do webhook), migracoes/*.sql (tabelas por módulo) (+8 more)

### Community 39 - "Manual: conversas e envio"
Cohesion: 0.19
Nodes (14): Tela Agendadas, Agendar o envio, Assumir um atendimento, Conversas (lista e chat), Enviar cartão de contato, Enviar enquete (2 a 12 opções), Enviar localização, Enviar fotos, documentos e arquivos (até 25 MB) (+6 more)

### Community 40 - "Painel inicial"
Cohesion: 0.23
Nodes (14): animar(), carregar(), casca(), destroy(), erro(), esqueleto(), pintarGrafico(), pintarPerfil() (+6 more)

### Community 41 - "Manual: configurações"
Cohesion: 0.20
Nodes (12): tabela agendadas, config.php (config.exemplo.php), Configurações › Segurança, master_usuario / master_inicial, Passo 3: Pasta privada e configuração, Passo 5: Tarefas agendadas (cron), Passo 6: Primeiro acesso, Pasta privada /var/www/zapzap-dados (+4 more)

### Community 42 - "Manual: usuários e permissões 2"
Cohesion: 0.23
Nodes (13): Administrador (master), Alerta de falhas de login repetidas, Auditoria (quem fez o quê, quando e de onde), Exportar CSV, Entrar no painel (login), Mensagens apagadas pelo contato (cópia guardada), Menu lateral e barra de atalhos, Perfis rápidos (Atendente, Somente leitura, Gerente) (+5 more)

### Community 43 - "Respostas rápidas (API)"
Cohesion: 0.35
Nodes (13): {closure#2}(), {closure#3}(), {closure#4}(), {closure#5}(), rr_apagar_arquivo(), rr_atalho_ok(), rr_buscar(), rr_dir() (+5 more)

### Community 44 - "Tela Histórico"
Cohesion: 0.32
Nodes (12): atualizar(), atualizarCsv(), carregar(), cartao(), desenharLista(), erroCartao(), filtros(), marcarStatus() (+4 more)

### Community 45 - "Webhooks de saída"
Cohesion: 0.31
Nodes (12): {closure#1}(), {closure#2}(), {closure#3}(), wso_chave_seg(), wso_cifrar(), wso_decifrar(), wso_disparar(), wso_entregar() (+4 more)

### Community 46 - "Tela Agendadas"
Cohesion: 0.32
Nodes (11): abrirReagendar(), acao(), card(), carregar(), contadores(), contagem(), desenharFiltros(), desenharLista() (+3 more)

### Community 47 - "Ajuda embutida"
Cohesion: 0.37
Nodes (11): ampliar(), blocoHtml(), ligarBusca(), pintarBusca(), render(), slides(), telaIndice(), telaSecao() (+3 more)

### Community 48 - "Manual: usuários e permissões 3"
Cohesion: 0.18
Nodes (12): Módulo de auditoria, v1.0.68, v1.0.75, assinar(), Assinatura obrigatória, Auditoria de ações POST, tabela auditoria, tabela usuarios (+4 more)

### Community 49 - "Manual: filas e chatbot"
Cohesion: 0.33
Nodes (12): Tela Atendimento (Aguardando / Em atendimento / Resolvidos), Chatbot (fluxos por etapas), Encerrar por falta de resposta (inatividade), Encerrar e reabrir atendimento, Etapas do fluxo (Mensagem, Menu, Pergunta, Transferir, Encerrar, Webhook), Filas de atendimento, Iniciar um atendimento (ativo), Linha do tempo do atendimento (+4 more)

### Community 50 - "API pública"
Cohesion: 0.25
Nodes (10): Integrações: tokens e segredos, v1.0.70, tabela api_tokens, API pública, Integrações, Tokens de API com escopos, ap_enviado(), ap_jid() (+2 more)

### Community 51 - "Manual: automações"
Cohesion: 0.22
Nodes (10): Automações (Quando / Então), Aviso por e-mail quando a conexão cai, Central de notificações (sino), Condições da automação, Gatilho da automação (Quando), Horário de atendimento da fila, Preferências de notificação (som, vibração, não perturbe), Registros das automações (+2 more)

### Community 52 - "Módulo grupos"
Cohesion: 0.35
Nodes (10): {closure#1}(), {closure#2}(), {closure#3}(), {closure#4}(), {closure#5}(), {closure#6}(), gz_contatos(), gz_jid() (+2 more)

### Community 53 - "Tela Etiquetas"
Cohesion: 0.29
Nodes (7): abrir(), abrirConversas(), abrirEditor(), render(), telaEtiquetas(), telaNotas(), trocar()

### Community 54 - "Histórico de versões 4"
Cohesion: 0.20
Nodes (10): Ajuste para telas de 320 px, Cabeçalho adaptado a celulares estreitos, Módulo Chatbot (fluxos e simulador), v1.0.113, v1.0.114, v1.0.116, v1.0.120, v1.0.77 (+2 more)

### Community 55 - "Histórico de versões 5"
Cohesion: 0.29
Nodes (10): Descadastro por SAIR, Módulo Campanhas e listas, v1.0.62, v1.0.71, v1.0.80, tabela campanhas, tabela listas, Campanhas (+2 more)

### Community 56 - "Manual: API pública e tokens"
Cohesion: 0.31
Nodes (10): API pública (api_publica.php), Escopos do token (Enviar texto, Enviar mídia, Ver status, Ler mensagens), Glossário, Integrações (Tokens, Webhooks, Como usar), JID (identificador da conversa), Página Ajuda (manual embutido), Segredo do webhook (HMAC-SHA256), Token de API (+2 more)

### Community 57 - "Núcleo app.js (ZZ)"
Cohesion: 0.33
Nodes (6): abrirSeletor(), carregarInstancias(), estadoConexao(), montarApp(), navegar(), pintarSeletor()

### Community 58 - "Tela Auditoria"
Cohesion: 0.51
Nodes (9): render(), alerta(), carregar(), carregarResumo(), chips(), desenhar(), linha(), pilulas() (+1 more)

### Community 59 - "Tela Grupos"
Cohesion: 0.33
Nodes (8): abrir(), cardHtml(), carregar(), copiar(), desenhar(), erroHtml(), esqueleto(), render()

### Community 60 - "Histórico de versões 6"
Cohesion: 0.36
Nodes (9): Módulo Usuários, Senha provisória e definitiva de usuários, v1.0.109, v1.0.110, v1.0.81, v1.0.83, v1.0.84, v1.0.89 (+1 more)

### Community 61 - "Instalação"
Cohesion: 0.28
Nodes (8): deploy.exemplo.sh script, Marcador __V__, Banco zapzap (utf8mb4), Marcador __V__, Passo 1: Banco de dados, Passo 2: Código (deploy), src/migracoes/*.sql, docs/INSTALACAO.md

### Community 62 - "Manual: automações 2"
Cohesion: 0.22
Nodes (9): Ações da automação (Então), Comportamento da conexão (rejeitar chamadas, ignorar grupos, sempre online…), Etiquetas (rótulos coloridos), Tela Grupos (somente leitura), Marcar como lida, Notas internas, Respostas rápidas (atalho com /), Sincronização completa dos dados (+1 more)

### Community 63 - "Histórico de versões 7"
Cohesion: 0.29
Nodes (8): Módulo Automações (motor, editor e simulador), v1.0.63, v1.0.67, v1.0.82, tabela automacoes, tabela chatbot_*, Automações e chatbot, Modo TESTE

### Community 64 - "Instalação 2"
Cohesion: 0.29
Nodes (8): Extensões PHP (curl, mbstring, openssl, pdo_mysql, fileinfo, gd), MySQL 5.7+ (ou MariaDB), nginx (ou Apache), Passo 4: Configuração do nginx, PHP 8.3-FPM, Requisitos de instalação, MySQL 5.7+ com migrações automáticas, PHP 8.3 sem Composer

### Community 65 - "VLT (hook de leads)"
Cohesion: 0.46
Nodes (7): {closure#12}(), {closure#1}(), {closure#2}(), vlt_casar(), vlt_filtros_ativos(), vlt_gravar(), vlt_norm()

### Community 66 - "Mensagens guardadas"
Cohesion: 0.46
Nodes (7): {closure#1}(), {closure#2}(), mg_baixar(), mg_guardar(), mg_limpar(), mg_marcar(), mg_revogada()

### Community 67 - "Push no navegador"
Cohesion: 0.54
Nodes (7): assinaturaAtual(), ativar(), desativar(), enviarAoServidor(), estado(), registro(), renovar()

### Community 68 - "Histórico de versões 8"
Cohesion: 0.33
Nodes (7): Lembrar de responder, Menu com gesto de deslizar, Página Lembretes, v1.0.118, v1.0.76, Mobile-first, tabela lembretes_resp

### Community 69 - "Instalação 3"
Cohesion: 0.33
Nodes (6): Tela Configurações, Forçar atualização agora, Instalar como aplicativo (PWA), Perfil do WhatsApp (nome e recado), Sessões de usuário (até 30 dias), Troca de senha obrigatória no primeiro acesso

### Community 70 - "Manual: conexões WhatsApp 2"
Cohesion: 0.38
Nodes (6): Conexão (instância de WhatsApp), Conexões liberadas por usuário, Desconectar: manter, ocultar ou apagar dados, Evolution API, Seletor de conexão ativa (Seus WhatsApps), Tela Conexões

### Community 71 - "Tabelas de automações"
Cohesion: 0.29
Nodes (6): automacao_contatos, automacao_dedupe, automacao_envios, automacao_logs, automacao_marcas, automacoes

### Community 72 - "Tela Apagadas"
Cohesion: 0.48
Nodes (5): atualizar(), carregar(), cartao(), midia(), render()

### Community 73 - "Manual: campanhas"
Cohesion: 0.53
Nodes (5): Assistente de campanha em 4 passos, Campanhas (envio em massa), Tela Contatos, Listas de contatos, Opt-out (SAIR, PARAR, STOP, DESCADASTRAR)

### Community 74 - "Manual: conexões WhatsApp 3"
Cohesion: 0.40
Nodes (6): Conectar com código de pareamento, Nono dígito (número sem o 9), Conectar lendo o QR Code, Reiniciar a conexão, Verificar se o número tem WhatsApp, WhatsApp (aparelhos conectados)

### Community 75 - "Dashboard (API)"
Cohesion: 0.53
Nodes (4): {closure#2}(), dash_evolution(), dash_nomes(), dash_resumo_msg()

### Community 76 - "Tabelas de campanhas"
Cohesion: 0.33
Nodes (5): campanha_envios, campanha_optouts, campanhas, lista_contatos, listas

### Community 77 - "Tabelas do chatbot"
Cohesion: 0.33
Nodes (5): chatbot_fluxos, chatbot_logs, chatbot_nos, chatbot_sessoes, chatbot_vistas

### Community 78 - "API de conversas 2"
Cohesion: 0.40
Nodes (5): {closure#4}(), {closure#8}(), cv_lista_chats(), cv_lista_chats_bd(), cs_tem_dados()

### Community 80 - "Tabelas de etiquetas"
Cohesion: 0.50
Nodes (3): etiqueta_conversas, etiquetas, notas

### Community 81 - "Histórico de versões 9"
Cohesion: 0.67
Nodes (3): Conexões: limpeza de dados e sincronização completa, v1.0.72, v1.0.79

## Ambiguous Edges - Review These
- `Conversas` → `tabela conversas_lidas`  [AMBIGUOUS]
  docs/ARQUITETURA.md · relation: conceptually_related_to
- `Envio` → `tabela envios`  [AMBIGUOUS]
  docs/ARQUITETURA.md · relation: conceptually_related_to

## Knowledge Gaps
- **30 isolated node(s):** `Página Ajuda (manual embutido)`, `Preferências de notificação (som, vibração, não perturbe)`, `Gravar e enviar áudio`, `Lembretes (me lembrar de responder)`, `Enviar enquete (2 a 12 opções)` (+25 more)
  These have ≤1 connection - possible missing edges or undocumented components. (Counts symbols only; 227 node(s) total have ≤1 connection when file, concept and rationale nodes are included.)
- **25 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `bd()` connect `Usuários e auditoria (API)` to `Conexões Evolution API`, `Campanhas (envio em massa)`, `Motor de automações`, `Filas e atendimento (API)`, `Envio e agendamento`, `Chatbot (hook de mensagens)`, `API de relatórios`, `API de integrações e núcleo`, `API de conversas`, `API VLT (séries)`, `API de automações`, `Chatbot (fluxos)`, `Autenticação e sessões`, `Push (Web Push VAPID)`, `Etiquetas e notas (API)`, `Armazenamento de conversas`, `Auditoria (API)`, `Respostas rápidas (API)`, `Webhooks de saída`, `API pública`, `VLT (hook de leads)`, `Mensagens guardadas`, `Dashboard (API)`, `API de conversas 2`?**
  _High betweenness centrality (0.142) - this node is a cross-community bridge._
- **Are the 206 inferred relationships involving `bd()` (e.g. with `ag_processar()` and `kv_get()`) actually correct?**
  _`bd()` has 206 INFERRED edges - model-reasoned connections that need verification._
- **What connects `Página Ajuda (manual embutido)`, `Preferências de notificação (som, vibração, não perturbe)`, `Gravar e enviar áudio` to the rest of the system?**
  _30 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Conexões Evolution API` be split into smaller, more focused modules?**
  _Cohesion score 0.05070892410341952 - nodes in this community are weakly interconnected._
- **Why does `out()` connect `API de integrações e núcleo` to `Conexões Evolution API`, `Campanhas (envio em massa)`, `Motor de automações`, `Filas e atendimento (API)`, `Envio e agendamento`, `API de relatórios`, `Usuários e auditoria (API)`, `API de conversas`, `API VLT (séries)`, `API de automações`, `Chatbot (fluxos)`, `Autenticação e sessões`, `Push (Web Push VAPID)`, `Etiquetas e notas (API)`, `Auditoria (API)`, `Respostas rápidas (API)`, `API pública`, `Módulo grupos`, `VLT (hook de leads)`, `Dashboard (API)`, `API de conversas 2`?**
  _High betweenness centrality (0.070) - this node is a cross-community bridge._

### Low-confidence Hints
_AMBIGUOUS edges — the extractor was unsure. Verify before acting on these._

- **What is the exact relationship between `Conversas` and `tabela conversas_lidas`?**
  _Edge tagged AMBIGUOUS (relation: conceptually_related_to) - confidence is low._
- **What is the exact relationship between `Envio` and `tabela envios`?**
  _Edge tagged AMBIGUOUS (relation: conceptually_related_to) - confidence is low._