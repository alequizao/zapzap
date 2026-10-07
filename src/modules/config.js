/* Configurações — conexão, perfil, comportamento, segurança e sobre. Classes cfg-. */
ZZ.pagina({ id: 'config', titulo: 'Configurações', icone: 'fa-gear', ordem: 8, tab: false, render(el) {
  const E = ZZ.esc;
  let vivo = true, info = null, orig = null, atualQr = null, qrAberto = false;
  const CHAVES = [
    ['rejectCall', 'Rejeitar chamadas', 'Recusa automaticamente ligações recebidas.', 'fa-phone-slash'],
    ['groupsIgnore', 'Ignorar grupos', 'Não processa mensagens vindas de grupos.', 'fa-users-slash'],
    ['alwaysOnline', 'Sempre online', 'Mantém o WhatsApp com status “online”.', 'fa-circle-dot'],
    ['readMessages', 'Marcar mensagens como lidas', 'Confirma a leitura de tudo o que chega.', 'fa-check-double'],
    ['readStatus', 'Ver status dos contatos', 'Marca os status (stories) como vistos.', 'fa-eye'],
    ['syncFullHistory', 'Sincronizar histórico completo', 'Baixa todo o histórico ao conectar.', 'fa-clock-rotate-left']
  ];

  el.innerHTML = '<div class="cfg-raiz" id="cfgRaiz">' + esqueleto() + '</div>';
  const raiz = ZZ.$('#cfgRaiz', el);

  function esqueleto() { return ZZ.skeleton(1, 'skel-linha cfg-sk') + ZZ.skeleton(2, 'skel-linha cfg-sk') + ZZ.skeleton(2, 'skel-linha cfg-sk'); }

  async function carregar() {
    raiz.innerHTML = esqueleto();
    const j = await ZZ.api('config_info', { silencioso: true });
    if (!vivo) return;
    if (!j || !j.ok) {
      raiz.innerHTML = `<div class="card-soft cfg-erro"><i class="fa-solid fa-triangle-exclamation"></i><p>${E((j && j.msg) || 'Não foi possível carregar as configurações.')}</p><button class="btn-azul" id="cfgTentar"><i class="fa-solid fa-rotate"></i> Tentar de novo</button></div>`;
      ZZ.$('#cfgTentar', raiz).onclick = e => ZZ.busy(e.currentTarget, async () => { await carregar(); return true; });
      return;
    }
    info = j; orig = JSON.stringify(normSet(j.settings));
    desenhar();
  }

  function normSet(s) {
    s = s || {}; const o = {};
    CHAVES.forEach(c => o[c[0]] = !!s[c[0]]);
    o.msgCall = String(s.msgCall || '');
    return o;
  }

  /* ---------- desenho ---------- */
  function desenhar() {
    const p = info.perfil || {}, sv = info.servidor || {}, s = normSet(info.settings);
    const u = (ZZ.eu && ZZ.eu.usuario) || {};
    const pEd = ZZ.pode('config.editar'), pPerf = ZZ.pode('config.perfil');
    const sp = (ok) => ok ? '' : ' disabled title="Sem permissão"';
    const aviso = ok => ok ? '' : '<div class="cfg-semperm"><i class="fa-solid fa-lock"></i> Sem permissão para alterar isto.</div>';
    raiz.innerHTML = `
    <section class="card-soft cfg-sec" id="cfgConta">
      <div class="ch"><i class="fa-solid fa-id-badge"></i> Minha conta</div>
      <div class="cfg-perfil"><div class="cfg-foto cfg-foto-ini">${E(ZZ.iniciais(u.nome))}</div>
        <div><b>${E(u.nome || '')}</b><div class="mut">@${E(u.usuario || '')}</div>
        <span class="badge-status ${u.master ? 'b-info' : 'b-pausa'} cfg-tipo"><i class="fa-solid ${u.master ? 'fa-crown' : 'fa-user'}"></i> ${u.master ? 'Administrador (master)' : 'Usuário'}</span></div></div>
      <div class="cfg-botoes"><button class="btn-perigo" id="cfgSair"><i class="fa-solid fa-right-from-bracket"></i> Sair</button></div>
    </section>

    <section class="card-soft cfg-sec" id="cfgConexao"></section>

    <section class="card-soft cfg-sec">
      <div class="ch"><i class="fa-solid fa-user"></i> Perfil</div>
      <div class="cfg-perfil">
        ${p.foto ? `<img class="cfg-foto" src="${E(p.foto)}" alt="" referrerpolicy="no-referrer" onerror="this.replaceWith(Object.assign(document.createElement('div'),{className:'cfg-foto cfg-foto-ini',textContent:'${E(ZZ.iniciais(p.nome))}'}))">` : `<div class="cfg-foto cfg-foto-ini">${E(ZZ.iniciais(p.nome))}</div>`}
        <div><b>${E(p.nome || 'Sem nome')}</b><div class="mut">${E(ZZ.fmtNumero(p.numero))}</div></div>
      </div>
      <label for="cfgNome">Nome do perfil</label>
      <div class="cfg-campo"><input type="text" id="cfgNome" maxlength="25" value="${E(p.nome || '')}" autocomplete="off"${sp(pPerf)}><button class="btn-azul" id="cfgNomeSalvar"${sp(pPerf)}><i class="fa-solid fa-floppy-disk"></i> Salvar</button></div>
      <div class="msg-campo" id="cfgNomeMsg" hidden></div>
      <label for="cfgRecado">Recado (status)</label>
      <div class="cfg-campo"><input type="text" id="cfgRecado" maxlength="139" value="${E(p.status || '')}" autocomplete="off"${sp(pPerf)}><button class="btn-azul" id="cfgRecadoSalvar"${sp(pPerf)}><i class="fa-solid fa-floppy-disk"></i> Salvar</button></div>
      <div class="msg-campo" id="cfgRecadoMsg" hidden></div>
      ${aviso(pPerf)}
    </section>

    <section class="card-soft cfg-sec">
      <div class="ch"><i class="fa-solid fa-sliders"></i> Comportamento</div>
      <div class="cfg-aviso"><i class="fa-solid fa-triangle-exclamation"></i><span>Esta instância também é usada pelo sistema Lembretes — mudanças valem para todos.</span></div>
      <div id="cfgSwitches">${CHAVES.map(c => `
        <label class="cfg-sw" for="cfgS_${c[0]}">
          <span class="cfg-sw-ic"><i class="fa-solid ${c[3]}"></i></span>
          <span class="cfg-sw-tx"><b>${E(c[1])}</b><small>${E(c[2])}</small></span>
          <input type="checkbox" role="switch" id="cfgS_${c[0]}" data-k="${c[0]}" ${s[c[0]] ? 'checked' : ''}${sp(pEd)}><span class="cfg-sw-trilho"><i></i></span>
        </label>
        ${c[0] === 'rejectCall' ? `<div class="cfg-msgcall" id="cfgMsgCallBox" ${s.rejectCall ? '' : 'hidden'}><label for="cfgMsgCall">Mensagem enviada a quem ligar</label><input type="text" id="cfgMsgCall" maxlength="200" value="${E(s.msgCall)}"${sp(pEd)} placeholder="Ex.: Não atendo ligações, mande mensagem."></div>` : ''}`).join('')}
      </div>
      <button class="btn-azul w100 cfg-salvar" id="cfgSalvar" disabled><i class="fa-solid fa-floppy-disk"></i> Salvar comportamento</button>
      <div class="mut cfg-dica" id="cfgDica">${pEd ? 'Nenhuma alteração pendente.' : '<i class="fa-solid fa-lock"></i> Sem permissão para alterar o comportamento.'}</div>
    </section>

    <section class="card-soft cfg-sec">
      <div class="ch"><i class="fa-solid fa-lock"></i> Segurança</div>
      <p class="mut cfg-p">Trocar a senha da <b>sua conta</b> (@${E(u.usuario || '')}). Ao trocar, as sessões abertas em outros aparelhos são encerradas.</p>
      <label for="cfgSenhaAtual">Senha atual</label>
      <div class="pw"><input type="password" id="cfgSenhaAtual" autocomplete="current-password"><button type="button" class="cfg-olho" aria-label="Mostrar ou ocultar"><i class="fa-solid fa-eye"></i></button></div>
      <div class="msg-campo" hidden></div>
      <label for="cfgSenhaNova">Nova senha</label>
      <div class="pw"><input type="password" id="cfgSenhaNova" autocomplete="new-password"><button type="button" class="cfg-olho" aria-label="Mostrar ou ocultar"><i class="fa-solid fa-eye"></i></button></div>
      <div class="cfg-forca"><div class="cfg-forca-barra"><i id="cfgForcaB"></i></div><span id="cfgForcaT" class="mut">Mínimo de 6 caracteres</span></div>
      <div class="msg-campo" hidden></div>
      <label for="cfgSenhaRep">Repetir nova senha</label>
      <div class="pw"><input type="password" id="cfgSenhaRep" autocomplete="new-password"><button type="button" class="cfg-olho" aria-label="Mostrar ou ocultar"><i class="fa-solid fa-eye"></i></button></div>
      <div class="msg-campo" hidden></div>
      <button class="btn-azul w100 cfg-salvar" id="cfgTrocar"><i class="fa-solid fa-key"></i> Trocar senha</button>
    </section>

    <section class="card-soft cfg-sec">
      <div class="ch"><i class="fa-solid fa-circle-info"></i> Sobre</div>
      <div class="cfg-versoes">
        <div><span class="mut">Painel ZapZap</span><b>${E(sv.versao_painel || ZZ.v || '—')}</b></div>
        <div><span class="mut">Evolution API</span><b>${E(sv.versao_evolution || '—')}</b></div>
      </div>
      <div class="cfg-botoes">
        <button class="btn-soft" id="cfgInstalar"><i class="fa-solid fa-download"></i> Instalar aplicativo</button>
        <button class="btn-soft" id="cfgForcar"><i class="fa-solid fa-rotate"></i> Forçar atualização agora</button>
      </div>
      <div class="cfg-cred">Desenvolvido por <a href="https://instagram.com/alequizao" target="_blank" rel="noopener">Alequizão</a></div>
    </section>`;

    ZZ.$('#cfgSair', raiz).onclick = e => ZZ.busy(e.currentTarget, async () => { await ZZ.api('sair', { corpo: {} }); location.reload(); return true; });
    desenharConexao();
    ligarPerfil(); ligarComportamento(); ligarSenha(); ligarSobre();
  }

  /* ---------- conexão ---------- */
  function desenharConexao() {
    const box = ZZ.$('#cfgConexao', raiz); if (!box) return;
    const est = info.estado;
    const ok = est === 'open', conectando = est === 'connecting';
    const sel = ok ? ['b-ok', 'fa-circle-check', 'Conectado'] : conectando ? ['b-pend', 'fa-spinner fa-spin', 'Conectando…'] : ['b-err', 'fa-circle-xmark', 'Desconectado'];
    box.innerHTML = `
      <div class="ch"><i class="fa-brands fa-whatsapp"></i> Conexão ${qrAberto ? '<span class="vivo cfg-vivo">ao vivo</span>' : ''}</div>
      <div class="cfg-estado"><span class="badge-status ${sel[0]} cfg-selo"><i class="fa-solid ${sel[1]}"></i> ${sel[2]}</span>
        <div class="mut">${ok ? 'O WhatsApp está pronto para enviar e receber.' : 'Escaneie o QR Code para reconectar o aparelho.'}</div></div>
      <div id="cfgQrBox" class="cfg-qr" ${qrAberto ? '' : 'hidden'}></div>
      <div class="cfg-botoes">
        ${ok ? '' : `<button class="btn-azul" id="cfgGerarQr"><i class="fa-solid fa-qrcode"></i> Gerar QR Code</button>`}
        ${ZZ.pode('config.reiniciar') ? '<button class="btn-perigo" id="cfgReiniciar"><i class="fa-solid fa-power-off"></i> Reiniciar conexão</button>' : '<span class="mut cfg-semperm"><i class="fa-solid fa-lock"></i> Reiniciar: sem permissão</span>'}
      </div>`;
    const g = ZZ.$('#cfgGerarQr', box);
    if (g) g.onclick = e => ZZ.busy(e.currentTarget, async () => { qrAberto = true; ZZ.$('#cfgQrBox', box).hidden = false; return await buscarQr(true); });
    if (ZZ.$('#cfgReiniciar', box)) ZZ.$('#cfgReiniciar', box).onclick = reiniciar;
    if (qrAberto && !ok) buscarQr(false);
  }

  async function buscarQr(manual) {
    const box = ZZ.$('#cfgQrBox', raiz); if (!box) return { ok: false };
    if (manual) box.innerHTML = '<div class="skel cfg-qr-sk"></div>';
    const j = await ZZ.api('qr', { silencioso: !manual });
    if (!vivo) return j;
    const b2 = ZZ.$('#cfgQrBox', raiz); if (!b2) return j;
    if (j && j.estado) info.estado = j.estado;
    if (j && j.ok && j.estado === 'open') {
      qrAberto = false; ZZ.toast('WhatsApp conectado!', 'ok'); desenharConexao(); return j;
    }
    if (j && j.ok && j.base64) {
      const src = j.base64.startsWith('data:') ? j.base64 : 'data:image/png;base64,' + j.base64;
      b2.innerHTML = `<img src="${E(src)}" alt="QR Code do WhatsApp" class="cfg-qr-img">
        <ol class="cfg-passos"><li>Abra o <b>WhatsApp</b> no celular</li><li>Toque em <b>Configurações › Aparelhos conectados</b></li><li>Toque em <b>Conectar um aparelho</b> e aponte para este código</li></ol>
        <div class="mut cfg-dica">O código é renovado sozinho a cada 20 segundos.</div>`;
      if (!atualQr) atualQr = setInterval(() => { if (!document.hidden && qrAberto && vivo && !(ZZ.modalAberto > 0)) buscarQr(false); }, 20000);
      return j;
    }
    b2.innerHTML = `<div class="cfg-qr-fail"><i class="fa-solid fa-triangle-exclamation"></i> ${E((j && j.msg) || 'QR Code indisponível no momento. Tente de novo em instantes.')}</div>`;
    return { ok: false };
  }

  async function reiniciar(e) {
    const btn = e.currentTarget;
    if (!await ZZ.confirmar('Reiniciar a conexão do WhatsApp? Ela ficará fora do ar por alguns segundos e o sistema Lembretes também será afetado.', 'Continuar', true)) return;
    if (!await ZZ.confirmar('Tem certeza? Esta é a segunda confirmação: a conexão será reiniciada agora.', 'Sim, reiniciar', true)) return;
    const r = await ZZ.busy(btn, async () => await ZZ.api('reiniciar', { corpo: {} }));
    if (r && r.ok) { ZZ.toast('Conexão reiniciada. Aguarde alguns segundos…', 'ok'); setTimeout(() => vivo && recarregarEstado(), 4000); }
  }
  async function recarregarEstado() {
    const j = await ZZ.api('qr', { silencioso: true }); if (!vivo || !j) return;
    if (j.estado) { info.estado = j.estado; desenharConexao(); }
  }

  /* ---------- perfil ---------- */
  function erroCampo(inp, msgEl, txt) {
    inp.classList.toggle('erro-campo', !!txt); msgEl.hidden = !txt; msgEl.textContent = txt || '';
    if (txt) { inp.focus(); inp.scrollIntoView({ block: 'center', behavior: 'smooth' }); }
    return !txt;
  }
  function ligarPerfil() {
    const n = ZZ.$('#cfgNome', raiz), nm = ZZ.$('#cfgNomeMsg', raiz), r = ZZ.$('#cfgRecado', raiz), rm = ZZ.$('#cfgRecadoMsg', raiz);
    n.oninput = () => erroCampo(n, nm, ''); r.oninput = () => erroCampo(r, rm, '');
    ZZ.$('#cfgNomeSalvar', raiz).onclick = e => {
      const v = n.value.trim();
      if (!erroCampo(n, nm, !v ? 'Digite um nome.' : v.length > 25 ? 'No máximo 25 caracteres.' : '')) return;
      if (v === (info.perfil.nome || '')) return ZZ.toast('O nome já é esse.', 'info');
      return ZZ.busy(e.currentTarget, async () => {
        const j = await ZZ.api('perfil_nome', { corpo: { nome: v } });
        if (j.ok) { info.perfil.nome = v; ZZ.toast('Nome atualizado.', 'ok'); } return j;
      });
    };
    ZZ.$('#cfgRecadoSalvar', raiz).onclick = e => {
      const v = r.value.trim();
      if (!erroCampo(r, rm, v.length > 139 ? 'No máximo 139 caracteres.' : '')) return;
      if (v === (info.perfil.status || '')) return ZZ.toast('O recado já é esse.', 'info');
      return ZZ.busy(e.currentTarget, async () => {
        const j = await ZZ.api('perfil_status', { corpo: { status: v } });
        if (j.ok) { info.perfil.status = v; ZZ.toast('Recado atualizado.', 'ok'); } return j;
      });
    };
  }

  /* ---------- comportamento ---------- */
  function lerSwitches() {
    const o = {};
    CHAVES.forEach(c => o[c[0]] = ZZ.$('#cfgS_' + c[0], raiz).checked);
    o.msgCall = ZZ.$('#cfgMsgCall', raiz).value.trim();
    return o;
  }
  function ligarComportamento() {
    const bt = ZZ.$('#cfgSalvar', raiz), dica = ZZ.$('#cfgDica', raiz);
    const mudou = () => {
      const m = JSON.stringify(lerSwitches()) !== orig;
      bt.disabled = !m; dica.textContent = m ? 'Há alterações não salvas.' : 'Nenhuma alteração pendente.';
      dica.classList.toggle('cfg-dica-alerta', m);
    };
    ZZ.$$('#cfgSwitches input[type=checkbox]', raiz).forEach(i => i.onchange = () => {
      if (i.dataset.k === 'rejectCall') ZZ.$('#cfgMsgCallBox', raiz).hidden = !i.checked;
      ZZ.vibrar(8); mudou();
    });
    ZZ.$('#cfgMsgCall', raiz).oninput = mudou;
    bt.onclick = e => {
      const novo = lerSwitches();
      if (novo.rejectCall && !novo.msgCall) { const c = ZZ.$('#cfgMsgCall', raiz); c.classList.add('erro-campo'); c.focus(); return ZZ.toast('Escreva a mensagem de resposta às chamadas.', 'err'); }
      ZZ.$('#cfgMsgCall', raiz).classList.remove('erro-campo');
      return ZZ.busy(bt, async () => {
        const j = await ZZ.api('config_salvar', { corpo: { settings: novo } });
        if (j.ok) { orig = JSON.stringify(novo); info.settings = novo; ZZ.toast('Configurações salvas.', 'ok'); }
        const m = JSON.stringify(lerSwitches()) !== orig; bt.disabled = !m;
        if (j.ok) { dica.textContent = 'Salvo com sucesso.'; dica.classList.remove('cfg-dica-alerta'); }
        return j;
      });
    };
  }

  /* ---------- segurança ---------- */
  function forca(s) {
    let p = 0; if (s.length >= 6) p++; if (s.length >= 10) p++; if (/[a-z]/.test(s) && /[A-Z]/.test(s)) p++; if (/\d/.test(s)) p++; if (/[^A-Za-z0-9]/.test(s)) p++;
    if (!s) return [0, 'Mínimo de 6 caracteres', ''];
    if (s.length < 6) return [1, 'Muito curta', 'f1'];
    if (p <= 2) return [2, 'Fraca', 'f2'];
    if (p === 3) return [3, 'Média', 'f3'];
    return [4, 'Forte', 'f4'];
  }
  function ligarSenha() {
    const at = ZZ.$('#cfgSenhaAtual', raiz), nv = ZZ.$('#cfgSenhaNova', raiz), rp = ZZ.$('#cfgSenhaRep', raiz);
    const msg = i => i.parentElement.nextElementSibling.classList.contains('cfg-forca') ? i.parentElement.nextElementSibling.nextElementSibling : i.parentElement.nextElementSibling;
    ZZ.$$('.cfg-olho', raiz).forEach(b => b.onclick = () => {
      const i = b.previousElementSibling, ver = i.type === 'password'; i.type = ver ? 'text' : 'password';
      b.innerHTML = `<i class="fa-solid ${ver ? 'fa-eye-slash' : 'fa-eye'}"></i>`;
    });
    nv.oninput = () => {
      const [n, t, c] = forca(nv.value);
      const b = ZZ.$('#cfgForcaB', raiz); b.style.width = (n * 25) + '%'; b.className = c;
      ZZ.$('#cfgForcaT', raiz).textContent = t;
    };
    [at, nv, rp].forEach(i => i.addEventListener('input', () => erroCampo(i, msg(i), '')));
    ZZ.$('#cfgTrocar', raiz).onclick = e => {
      let ok = true; const erros = [];
      if (!at.value) erros.push([at, 'Digite a senha atual.']);
      if (nv.value.length < 6) erros.push([nv, 'A nova senha precisa ter ao menos 6 caracteres.']);
      else if (nv.value === at.value) erros.push([nv, 'A nova senha deve ser diferente da atual.']);
      if (rp.value !== nv.value) erros.push([rp, 'As senhas não conferem.']);
      [at, nv, rp].forEach(i => { const er = erros.find(x => x[0] === i); i.classList.toggle('erro-campo', !!er); const m = msg(i); m.hidden = !er; m.textContent = er ? er[1] : ''; });
      if (erros.length) { erros[0][0].focus(); erros[0][0].scrollIntoView({ block: 'center', behavior: 'smooth' }); return; }
      return ZZ.busy(e.currentTarget, async () => {
        const j = await ZZ.api('trocar_senha', { corpo: { atual: at.value, nova: nv.value } });
        if (j.ok) {
          ZZ.toast('Senha trocada com sucesso.', 'ok'); at.value = nv.value = rp.value = ''; nv.oninput();
          if (ZZ.eu && ZZ.eu.usuario) ZZ.eu.usuario.trocar_senha = false;
          const sec = ZZ.$('#cfgTrocar', raiz); let n = ZZ.$('#cfgSessoes', raiz);
          if (!n) { n = document.createElement('div'); n.id = 'cfgSessoes'; n.className = 'cfg-sessoes'; sec.after(n); }
          n.innerHTML = '<i class="fa-solid fa-shield-halved"></i> Sessões encerradas em outros aparelhos. Esta continua conectada.';
        }
        else if (j.msg && /atual/i.test(j.msg)) { erroCampo(at, msg(at), j.msg); }
        return j;
      });
    };
  }

  /* ---------- sobre ---------- */
  function ligarSobre() {
    ZZ.$('#cfgInstalar', raiz).onclick = () => {
      const standalone = window.matchMedia('(display-mode: standalone)').matches || navigator.standalone;
      if (standalone) return ZZ.toast('O aplicativo já está instalado neste aparelho.', 'ok');
      const bi = document.getElementById('bInstalar');
      if (bi && !bi.hidden) { bi.click(); return; }
      ZZ.modal('<h3>Instalar aplicativo</h3><p>Abra o <b>menu lateral</b> (botão <b>Menu</b>) e toque em <b>Instalar aplicativo</b>.</p><p class="mut">No iPhone: <b>Compartilhar › Adicionar à Tela de Início</b>. No Android/Chrome: menu ⋮ › <b>Instalar app</b>.</p><div class="acoes"><button class="btn-acao" onclick="this.closest(\'.modal-bg\').remove();ZZ.modalAberto--">Entendi</button></div>');
    };
    ZZ.$('#cfgForcar', raiz).onclick = async e => {
      const btn = e.currentTarget; btn.disabled = true; btn.classList.add('btn-carregando');
      ZZ.toast('Limpando cache e recarregando…', 'info');
      try { const ks = await caches.keys(); await Promise.all(ks.map(k => caches.delete(k))); } catch (x) { }
      try { const rs = await navigator.serviceWorker.getRegistrations(); await Promise.all(rs.map(r => r.unregister())); } catch (x) { }
      setTimeout(() => location.reload(), 700);
    };
  }

  carregar();
  el._cfgLimpar = () => { vivo = false; if (atualQr) clearInterval(atualQr); atualQr = null; };
  ZZ._cfgLimpar = el._cfgLimpar;
}, destroy() { if (ZZ._cfgLimpar) ZZ._cfgLimpar(); } });
