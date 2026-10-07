# Arquitetura

```
src/
├─ index.php · api.php · webhook.php · api_publica.php · cron.php · cron_tick.php · sw.php · versao.php
├─ lib.php         # configuração, Evolution (evo/evo_global), instâncias, helpers, assinatura, notificações
├─ auth.php        # MySQL (bd), migrações, usuários, sessões, permissões, limite de login, auditoria
├─ perms.php       # catálogo de permissões (chave => [grupo, rótulo])
├─ api/*.php       # um arquivo por módulo: devolve ['acao' => callable, '__perms' => [...], '__catalogo' => [...]]
├─ hooks/*.php     # reagem aos eventos do webhook (messages.upsert, connection.update, presence.update…)
├─ cron.d/*.php    # tarefas periódicas de cada módulo (executadas por cron_tick.php)
├─ migracoes/*.sql # tabelas de cada módulo (CREATE TABLE IF NOT EXISTS), aplicadas automaticamente
├─ modules/*.js/css# uma tela por arquivo, registrada com ZZ.pagina({ id, titulo, perm, render })
└─ manual/img      # imagens da página Ajuda
```

## Princípios
- **Várias conexões:** a instância ativa vem do cabeçalho `X-Instancia` (ou cookie) e é validada contra as conexões liberadas ao usuário; `inst()` e `evo()` já usam a conexão ativa. Toda tabela multi-conexão tem a coluna `instancia`.
- **Permissões *default-deny*:** ação sem permissão declarada em `__perms` só o administrador executa. O front esconde o que não pode (`ZZ.pode`), o servidor sempre revalida.
- **Leitura x escrita:** GET só lê (ações `ver_*`, `listar_*`, `rel_*`); toda escrita é POST com CSRF.
- **Assinatura obrigatória:** envios feitos por usuário passam por `assinar()` (`*Nome:*` + texto). Agendamentos e campanhas guardam o nome do autor.
- **Segurança do Evolution:** o navegador nunca recebe a chave; o servidor é um proxy com validação (JIDs, nomes, tamanhos, mime, SSRF nos webhooks de saída).
- **Auditoria:** toda ação POST é registrada (quem, quando, IP, conexão, resultado) sem guardar o conteúdo das mensagens.
- **Atualização forçada:** `__V__` é trocado a cada publicação; o front consulta `versao.php` e recarrega sozinho; o Service Worker é servido por PHP para nunca ficar em cache.
- **Mobile-first:** alvos de toque ≥ 44 px, *bottom sheets*, barra inferior, menu com gesto de deslizar, `100dvh` e áreas seguras do iPhone.

## Tabelas (visão geral)
`usuarios`, `usuario_permissoes`, `usuario_instancias`, `sessoes`, `auditoria`, `eventos`, `notificacoes`, `envios`, `agendadas`, `filas`, `atendimentos`, `automacoes`, `chatbot_*`, `campanhas`, `listas`, `respostas`, `etiquetas`, `notas`, `lembretes_resp`, `api_tokens`, `webhooks_saida`, `push_assinaturas`, `presenca`, `conversas_lidas`.

## Criando um módulo
1. `src/migracoes/<modulo>.sql` com as tabelas;
2. `src/api/<modulo>.php` com as ações e `'__perms'`;
3. (opcional) `src/hooks/<modulo>.php` e `src/cron.d/<modulo>.php`;
4. `src/modules/<modulo>.js` com `ZZ.pagina({...})` — é carregado automaticamente.
