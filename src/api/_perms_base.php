<?php
// Permissões das ações dos módulos já existentes (núcleo). Valor = chave ou lista (qualquer uma serve).
return ['__perms' => [
  'dash' => 'painel.ver',
  'chats' => 'conversas.ver', 'msgs' => 'conversas.ver', 'midia' => 'conversas.midia', 'marcar_lida' => 'conversas.marcar_lida',
  'enviar_texto' => ['enviar.texto', 'conversas.enviar'], 'enviar_midia' => ['enviar.midia', 'conversas.enviar'],
  'enviar_enquete' => 'enviar.enquete', 'enviar_localizacao' => 'enviar.localizacao', 'enviar_contato' => 'enviar.contato',
  'presenca' => ['enviar.texto', 'conversas.enviar'], 'verificar_numero' => ['enviar.verificar', 'enviar.texto', 'contatos.ver'],
  'agendar_texto' => 'agenda.criar', 'agendar_midia' => 'agenda.criar', 'agendadas' => 'agenda.ver',
  'cancelar_agendada' => 'agenda.cancelar', 'reagendar' => 'agenda.cancelar', 'enviar_agora' => 'agenda.cancelar',
  'contatos' => ['contatos.ver', 'enviar.texto', 'conversas.ver', 'campanhas.criar', 'filas.atender'],
  'grupos' => ['grupos.ver', 'enviar.texto'], 'grupo' => 'grupos.ver', 'convite' => 'grupos.convite',
  'historico' => 'historico.ver', 'status_msg' => 'historico.ver', 'exportar_csv' => 'historico.exportar',
  'instancia_criar' => 'conexoes.criar', 'instancia_qr' => 'conexoes.qr', 'instancia_apelido' => 'conexoes.criar',
  'instancia_desconectar' => 'conexoes.desconectar', 'instancia_excluir' => 'conexoes.excluir',
  'config_info' => 'config.ver', 'config_salvar' => 'config.editar', 'qr' => 'conexoes.qr', 'reiniciar' => 'config.reiniciar',
  'perfil_nome' => 'config.perfil', 'perfil_status' => 'config.perfil',
]];
