# Instalação

## Requisitos
- Servidor Linux com **nginx** (ou Apache) + **PHP 8.3-FPM** (extensões: `curl`, `mbstring`, `openssl`, `pdo_mysql`, `fileinfo`, `gd`)
- **MySQL 5.7+** (ou MariaDB equivalente)
- **Evolution API v2.3.x** funcionando (Docker ou instalação própria) e acessível pelo servidor do painel
- HTTPS (obrigatório para PWA, notificações push e cookies seguros)

## 1) Banco de dados
```sql
CREATE DATABASE zapzap CHARACTER SET utf8mb4;
CREATE USER 'zapzap'@'127.0.0.1' IDENTIFIED BY 'uma-senha-forte';
GRANT ALL ON zapzap.* TO 'zapzap'@'127.0.0.1';
```
As tabelas são criadas e atualizadas automaticamente na primeira requisição (`src/migracoes/*.sql`).

## 2) Código
```bash
./deploy.exemplo.sh /var/www/seu-site/zapzap
```
O script copia `src/` e troca o marcador `__V__` pela versão (necessário para o cache e a atualização forçada).

## 3) Pasta privada e configuração
Crie uma pasta **fora do alcance da web** (ex.: `/var/www/zapzap-dados`), dê posse ao usuário do PHP-FPM e copie o exemplo:
```bash
sudo mkdir -p /var/www/zapzap-dados/{cache,anexos}
sudo cp config.exemplo.php /var/www/zapzap-dados/config.php   # edite os valores
sudo chown -R www-data: /var/www/zapzap-dados && sudo chmod 750 /var/www/zapzap-dados && sudo chmod 640 /var/www/zapzap-dados/config.php
```
Informe a pasta ao PHP com a variável de ambiente `ZAPZAP_DIR` (ex.: `env[ZAPZAP_DIR] = /var/www/zapzap-dados` no pool do PHP-FPM) — se o `open_basedir` estiver ativo, inclua essa pasta nele.

## 4) nginx (exemplo)
```nginx
location /zapzap/ {
    index index.php;
    location ~ ^/zapzap/(migracoes|hooks|cron\.d|api)/ { deny all; }   # código interno
    location ~ \.php$ { include fastcgi_params; fastcgi_pass unix:/run/php/php8.3-fpm.sock; fastcgi_param SCRIPT_FILENAME $request_filename; }
}
```

## 5) Tarefas agendadas (cron do usuário do PHP-FPM)
```cron
* * * * * php /var/www/seu-site/zapzap/cron.php      >/dev/null 2>&1   # mensagens agendadas
* * * * * php /var/www/seu-site/zapzap/cron_tick.php >/dev/null 2>&1   # filas, campanhas, automações, lembretes, alertas
```
Execute sempre como o **mesmo usuário do PHP-FPM** (nunca como root), para os arquivos do banco/cache não trocarem de dono.

## 6) Primeiro acesso
Abra `https://seu-dominio.com/zapzap/`. O administrador (`master_usuario`, padrão `admin`) é criado com a senha de `master_inicial` ou, se vazia, com uma senha **aleatória** gravada em `PRIMEIRA_SENHA.txt` na pasta privada. Entre, troque a senha em **Configurações › Segurança** e apague o arquivo.

## 7) Conectar o WhatsApp
Menu **Conexões › Conectar novo WhatsApp** → leia o QR Code (WhatsApp › Aparelhos conectados). Para automações, chatbot e atendimento em tempo real, ligue o **recebimento em tempo real** (webhook) na própria tela — o painel configura a Evolution para chamar `webhook.php` com uma chave por conexão.

## 8) Notificações push (opcional)
Em **Preferências de notificação › Notificações no aparelho**, toque em *Ativar*. No iPhone é preciso instalar o painel na Tela de Início (iOS 16.4+).

## Atualizando
Rode `./deploy.exemplo.sh` novamente: a versão muda e todos os navegadores se atualizam sozinhos.
