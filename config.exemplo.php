<?php
// Copie para <ZAPZAP_DIR>/config.php (pasta PRIVADA, fora do alcance da web) e preencha. NUNCA versione o arquivo real.
return [
    // Obrigatórios
    'segredo'      => 'TROQUE-POR-64-CARACTERES-ALEATORIOS',      // ex.: php -r 'echo bin2hex(random_bytes(32));'
    'base'         => 'http://127.0.0.1:8081',                    // URL da Evolution API (v2.3.x)
    'instancia'    => 'principal',                                // conexão (instância) padrão — fica protegida contra exclusão
    'token'        => 'APIKEY-DA-INSTANCIA',                      // apikey dessa instância
    'chave_global' => 'AUTHENTICATION_API_KEY-DA-EVOLUTION',      // necessária para criar/listar/excluir conexões
    'db'           => ['host' => '127.0.0.1', 'nome' => 'zapzap', 'usuario' => 'zapzap', 'senha' => 'TROQUE'],
    // Opcionais
    'url_base'       => 'https://seu-dominio.com/zapzap',          // usada em webhooks e e-mails
    'master_usuario' => 'admin',                                   // primeiro administrador
    'master_inicial' => '',                                        // vazio = senha aleatória em PRIMEIRA_SENHA.txt
    'email_dev'      => 'voce@exemplo.com',                        // recebe alertas (WhatsApp desconectado) e identifica o Web Push
    'smtp'           => ['host' => 'smtp.gmail.com', 'porta' => 465, 'usuario' => 'voce@exemplo.com', 'senha' => 'SENHA-DE-APP', 'de' => 'voce@exemplo.com', 'nome' => 'ZapZap'],
];
