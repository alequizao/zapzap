<?php
require __DIR__ . '/lib.php';
no_cache();
header('Content-Type: text/html; charset=utf-8');
$NONCE = base64_encode(random_bytes(16));
header("Content-Security-Policy: default-src 'self'; script-src 'self' 'nonce-$NONCE' https://cdnjs.cloudflare.com; script-src-attr 'unsafe-inline'; style-src 'self' 'unsafe-inline' https://cdnjs.cloudflare.com https://fonts.googleapis.com; font-src 'self' https://cdnjs.cloudflare.com https://fonts.gstatic.com data:; img-src 'self' https: data: blob:; media-src 'self' data: blob: https:; connect-src 'self'; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'");
$V = ZZ_VERSAO;
$logado = auth_ok();
?><!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<meta name="theme-color" content="#2563EB">
<meta name="robots" content="noindex,nofollow">
<title>ZapZap — Painel WhatsApp</title>
<link rel="manifest" href="manifest.webmanifest?v=<?= $V ?>">
<link rel="icon" type="image/svg+xml" href="icon.svg?v=<?= $V ?>">
<link rel="apple-touch-icon" href="icon-192.png?v=<?= $V ?>">
<meta name="apple-mobile-web-app-capable" content="yes">
<link href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.2/css/all.min.css" rel="stylesheet">
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap" rel="stylesheet">
<link href="app.css?v=<?= $V ?>" rel="stylesheet">
<?php foreach (glob(__DIR__ . '/modules/*.css') ?: [] as $f): ?><link href="modules/<?= basename($f) ?>?v=<?= $V ?>" rel="stylesheet">
<?php endforeach; ?>
</head>
<body>
<?php if (!$logado): ?>
<main class="login">
  <section class="login-form">
    <div class="logo"><img src="icon.svg?v=<?= $V ?>" alt=""><b>ZapZap</b></div>
    <h1>Olá! Entre com a sua conta</h1>
    <p class="mut">Painel de controle do WhatsApp do Alequizão.</p>
    <form id="fLogin" autocomplete="on">
      <label for="usuario">Usuário</label>
      <input id="usuario" type="text" autocomplete="username" autocapitalize="none" autocorrect="off" spellcheck="false" autofocus required>
      <label for="senha">Senha</label>
      <div class="pw"><input id="senha" type="password" autocomplete="current-password" required>
        <button type="button" id="ver" aria-label="Mostrar senha"><i class="fa-solid fa-eye"></i></button></div>
      <div id="erro" class="erro" role="alert"></div>
      <button class="btn-acao w100" id="bLogin"><i class="fa-solid fa-lock"></i> Entrar</button>
    </form>
    <footer class="cred">Desenvolvido por <a href="https://instagram.com/alequizao" target="_blank" rel="noopener">Alequizão</a> · v<?= $V ?></footer>
  </section>
  <section class="login-img"><div><i class="fa-brands fa-whatsapp"></i><h2>Tudo do seu WhatsApp<br>em um só painel</h2><p>Conversas, envios, agendamentos e grupos — ao vivo.</p></div></section>
</main>
<?php else: ?>
<div id="app" data-csrf="<?= csrf() ?>"></div>
<?php endif; ?>
<div id="toasts"></div>
<script nonce="<?= $NONCE ?>">window.ZZ={v:"<?= $V ?>",logado:<?= $logado ? 'true' : 'false' ?>,csrf:"<?= $logado ? csrf() : '' ?>"};</script>
<script src="app.js?v=<?= $V ?>"></script>
<?php if ($logado) foreach (glob(__DIR__ . '/modules/*.js') ?: [] as $f): ?><script src="modules/<?= basename($f) ?>?v=<?= $V ?>"></script>
<?php endforeach; ?>
</body>
</html>
