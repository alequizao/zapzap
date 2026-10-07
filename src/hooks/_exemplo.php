<?php
// Cada módulo cria src/hooks/<modulo>.php retornando ['evento' => function(array $ctx): void, '*' => ...].
// Eventos (minúsculo, pontos): messages.upsert, send.message, messages.update, connection.update, qrcode.updated, contacts.upsert, groups.upsert...
// $ctx = ['instancia'=>string, 'evento'=>string, 'dados'=>array (cru da Evolution), 'msg'=>array|null]
// $ctx['msg'] (messages.upsert / send.message): ['id','jid'(chat),'de_mim'(bool),'texto','tipo','ts','nome'(pushName),'grupo'(bool),'autor'(jid do participante em grupos)]
// Regras: idempotente (a Evolution pode repetir), rápido, nunca lança exceção para fora, ignora de_mim, não responde grupos sem regra explícita.
return [];
