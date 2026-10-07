/* Versões — histórico detalhado de cada versão publicada (núcleo). */
ZZ.pagina({ id: 'versoes', titulo: 'Versões', icone: 'fa-code-branch', ordem: 9, render(el) {
  el.innerHTML = '<div class="card-soft"><div class="ch"><i class="fa-solid fa-code-branch"></i> Histórico de versões <span class="vivo" style="margin-left:auto">ao vivo</span></div><div id="vsLista">' + ZZ.skeleton(4) + '</div></div>';
  let assinatura = '';
  const carregar = async () => {
    const j = await ZZ.api('versoes', { silencioso: true });
    const box = ZZ.$('#vsLista'); if (!box) return;
    if (!j.ok) { box.innerHTML = '<div class="vazio"><i class="fa-solid fa-triangle-exclamation"></i>Não foi possível carregar as versões.<br><button class="btn-soft btn-sm" id="vsTent">Tentar de novo</button></div>'; ZZ.$('#vsTent').onclick = e => ZZ.busy(e.currentTarget, carregar); return; }
    const as = j.itens.length + ':' + (j.itens[0] ? j.itens[0].versao : '') + ':' + j.atual; if (as === assinatura) return; assinatura = as;
    if (!j.itens.length) { box.innerHTML = '<div class="vazio"><i class="fa-solid fa-box-open"></i>Nenhuma versão registrada ainda.</div>'; return; }
    box.innerHTML = j.itens.map((v, i) => `
      <article class="vs-item ${v.versao === j.atual ? 'vs-atual' : ''}">
        <header><span class="badge-status ${v.versao === j.atual ? 'b-ok' : 'b-info'}">v${ZZ.esc(v.versao)}${v.versao === j.atual ? ' · atual' : ''}</span><span class="mut vs-data">${ZZ.fmtDataHora(v.ts)}</span></header>
        <h3>${ZZ.esc(v.titulo)}</h3>
        <ul>${(v.detalhes || []).map(d => '<li>' + ZZ.esc(d) + '</li>').join('')}</ul>
        ${(v.arquivos || []).length ? `<details><summary>${v.arquivos.length} arquivo(s) alterado(s)</summary><div class="vs-chips">${v.arquivos.map(a => '<code>' + ZZ.esc(a) + '</code>').join('')}</div></details>` : ''}
        ${(v.removidos || []).length ? `<div class="mut vs-rem">Removidos: ${v.removidos.map(a => '<code>' + ZZ.esc(a) + '</code>').join(' ')}</div>` : ''}
      </article>`).join('');
  };
  ZZ.poll(carregar, 15000); carregar();
} });
