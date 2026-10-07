/** Página do painel (HTML único, sem dependências externas além da fonte). Os dados vêm de /api/painel?dados=1 com a senha. */
export const PAINEL_HTML = `<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow">
<title>Painel da IA · InovPay</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=Manrope:wght@400;500;600;700;800&display=swap" rel="stylesheet">
<style>
:root{--escuro:#16181B;--lima:#C4E538;--lima-txt:#4F6400;--bg:#F4F5F2;--card:#FFFFFF;--txt:#16181B;--sub:#5D646B;--borda:#E2E5DF;--ok:#2E8B57;--alerta:#C2410C;--barra:#16181B;--barra2:#9DBB1E}
@media (prefers-color-scheme: dark){:root{--bg:#0E1012;--card:#181B1F;--txt:#ECEFF2;--sub:#9AA3AD;--borda:#2A2F35;--barra:#C4E538;--barra2:#6E8417;--lima-txt:#C4E538}}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--txt);font:15px/1.5 Manrope,system-ui,sans-serif}
a{color:inherit}
.logo{font-weight:800;letter-spacing:-.01em;font-size:20px;display:inline-flex;gap:4px;align-items:center}
.logo .pay{background:var(--lima);color:#16181B;padding:0 7px;border-radius:6px}
header{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:12px 16px;border-bottom:1px solid var(--borda);background:var(--card);position:sticky;top:0;z-index:2}
header .r{margin-left:8px}
nav{display:flex;gap:4px;overflow-x:auto}nav button{border:0;background:none;color:var(--sub);font:inherit;font-weight:600;padding:8px 12px;border-radius:8px;cursor:pointer;white-space:nowrap}
nav button.ativo{background:var(--escuro);color:#fff}
@media (prefers-color-scheme: dark){nav button.ativo{background:var(--lima);color:#16181B}}
main{max-width:1100px;margin:0 auto;padding:16px}
.grade{display:grid;grid-template-columns:repeat(auto-fit,minmax(136px,1fr));gap:12px}
.card{background:var(--card);border:1px solid var(--borda);border-radius:14px;padding:14px 16px}
.n{font-size:28px;font-weight:800}.r{color:var(--sub);font-size:13px}
h2{font-size:16px;margin:24px 0 10px}
.status{display:flex;align-items:center;gap:10px;font-weight:600;flex-wrap:wrap}.bola{width:12px;height:12px;border-radius:50%;flex:none}
table{width:100%;border-collapse:collapse;font-size:13.5px}th,td{text-align:left;padding:8px 6px;border-bottom:1px solid var(--borda);vertical-align:top}
th{color:var(--sub);font-weight:600}td.num{text-align:right;white-space:nowrap}.tabela{overflow-x:auto}
.tag{display:inline-block;padding:1px 8px;border-radius:99px;font-size:12px;font-weight:700;background:var(--bg);border:1px solid var(--borda);white-space:nowrap}
.tag.passou{background:var(--lima);color:#16181B;border-color:var(--lima)}.tag.erro{color:var(--alerta);border-color:var(--alerta)}
.barras{display:flex;align-items:flex-end;gap:3px;height:120px}.barras div{flex:1;background:var(--barra);border-radius:3px 3px 0 0;min-height:1px}
.barras.b2 div{background:var(--barra2)}
.eixo{display:flex;justify-content:space-between;color:var(--sub);font-size:12px;margin-top:4px}
.filtros{display:flex;gap:6px;flex-wrap:wrap;margin-bottom:8px}.filtros button{border:1px solid var(--borda);background:var(--card);color:var(--txt);border-radius:99px;padding:4px 12px;font:inherit;font-size:13px;cursor:pointer}
.filtros button.ativo{border-color:var(--txt);font-weight:700}
#entrar{max-width:340px;margin:12vh auto;padding:16px}#entrar input{width:100%;padding:12px;border:1px solid var(--borda);border-radius:10px;font:inherit;background:var(--card);color:var(--txt)}
#entrar button{margin-top:10px;width:100%;padding:12px;border:0;border-radius:10px;background:var(--escuro);color:#fff;font:inherit;font-weight:700;cursor:pointer}
@media (prefers-color-scheme: dark){#entrar button{background:var(--lima);color:#16181B}}
.msg{color:var(--alerta);font-size:13px;min-height:20px;margin-top:8px}.oculto{display:none}
.vazio{color:var(--sub);font-size:14px;padding:6px 0}
.motivo{display:flex;justify-content:space-between;gap:8px;padding:6px 0;border-bottom:1px dashed var(--borda)}
.resumo{color:var(--sub);font-size:13px;margin-top:2px}
footer{max-width:1100px;margin:0 auto;padding:8px 16px 32px;color:var(--sub);font-size:12px}
@media (max-width:640px){header{flex-wrap:wrap;padding:10px 12px}nav{width:100%}nav button{flex:1;padding:8px 6px}.n{font-size:24px}}
</style>
</head>
<body>
<section id="entrar">
  <div class="logo" style="margin-bottom:6px"><span>inov</span><span class="pay">pay</span></div>
  <div class="r" style="margin-bottom:16px">Painel da assistente virtual</div>
  <input id="senha" type="password" inputmode="numeric" autocomplete="current-password" placeholder="Senha" aria-label="Senha">
  <button id="btnEntrar">Entrar</button>
  <div class="msg" id="msgEntrar"></div>
</section>
<div id="app" class="oculto">
<header>
  <div><span class="logo"><span>inov</span><span class="pay">pay</span></span><span class="r">Painel da IA</span></div>
  <nav id="abas">
    <button data-aba="visao" class="ativo">Visão geral</button>
    <button data-aba="passagens">Passagens</button>
    <button data-aba="diario">Diário</button>
    <button data-aba="resultados">Resultados</button>
  </nav>
</header>
<main>
  <section data-painel="visao">
    <div class="card status" id="status"></div>
    <h2>Hoje</h2><div class="grade" id="hoje"></div>
    <h2>Últimos 7 dias</h2><div class="grade" id="sete"></div>
    <h2>Erros nas últimas 24h</h2><div class="card tabela" id="erros"></div>
  </section>
  <section data-painel="passagens" class="oculto">
    <h2>Atendimentos que a IA passou para a equipe</h2>
    <p class="r" style="margin-top:-4px">Cada linha é um contato que ficou com a tag <b>atendimento-humano</b> e tem uma nota com o resumo no GHL. Clique no nome para abrir o contato.</p>
    <div class="card tabela" id="passagens"></div>
  </section>
  <section data-painel="diario" class="oculto">
    <h2>Diário da IA</h2>
    <div class="filtros" id="filtros"></div>
    <div class="card tabela" id="diario"></div>
  </section>
  <section data-painel="resultados" class="oculto">
    <h2>Contatos atendidos por dia (30 dias)</h2><div class="card"><div class="barras" id="gContatos"></div><div class="eixo" id="eContatos"></div></div>
    <h2>Passagens para a equipe por dia (30 dias)</h2><div class="card"><div class="barras b2" id="gPassagens"></div><div class="eixo" id="ePassagens"></div></div>
    <h2>Passagens por motivo (30 dias)</h2><div class="card" id="motivos"></div>
    <h2>Últimos 30 dias</h2><div class="grade" id="trinta"></div>
    <p class="r" id="cobertura"></p>
  </section>
  <p class="r" id="atualizado"></p>
</main>
<footer>Implantado pela Control Gestão · os números vêm do diário de execuções da IA.</footer>
</div>
<script>
(function(){
var senha='';try{senha=sessionStorage.getItem('painel-inovpay')||''}catch(e){}
var dados=null,filtro='todos';
var $=function(id){return document.getElementById(id)};
function el(tag,attrs,filhos){var n=document.createElement(tag);if(attrs)for(var k in attrs){if(k==='class')n.className=attrs[k];else if(k==='text')n.textContent=attrs[k];else n.setAttribute(k,attrs[k])}(filhos||[]).forEach(function(f){if(f!=null)n.appendChild(typeof f==='string'?document.createTextNode(f):f)});return n}
function hora(iso){return new Date(iso).toLocaleString('pt-BR',{timeZone:'America/Sao_Paulo',day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'})}
function brl(usd){return 'R$ '+((usd||0)*dados.cotacao).toLocaleString('pt-BR',{minimumFractionDigits:2,maximumFractionDigits:2})}
function contato(nome,link){return el('a',{href:link,target:'_blank',rel:'noopener',text:nome||'(sem nome)'})}
var TIPO={resposta:'Respondeu',passou:'Passou para a equipe',aviso:'Aviso fora do horário',erro:'Erro',reset:'Reset de teste',pulou:'Não respondeu'};
function cards(alvo,r){var c=$(alvo);c.textContent='';[
  ['Contatos atendidos',r.contatos,'pessoas diferentes'],
  ['Clientes',r.clientes,'suporte'],
  ['Não clientes',r.naoClientes,'comercial'],
  ['Passagens',r.passagens,'para a equipe'],
  ['Fora do horário',r.foraDoHorario,'contatos atendidos'],
  ['Erros',r.erros,'no diário'],
  ['Custo da IA',brl(r.custoUsd),'aproximado']
].forEach(function(x){c.appendChild(el('div',{class:'card'},[el('div',{class:'r',text:x[0]}),el('div',{class:'n',text:String(x[1])}),el('div',{class:'r',text:x[2]})]))})}
function tabela(alvo,cab,linhas,vazio){var c=$(alvo);c.textContent='';if(!linhas.length){c.appendChild(el('div',{class:'vazio',text:vazio}));return}var t=el('table');t.appendChild(el('tr',null,cab.map(function(h){return el('th',{text:h})})));linhas.forEach(function(l){t.appendChild(el('tr',null,l))});c.appendChild(t)}
function barras(alvo,eixo,valores,rotulos){var g=$(alvo);g.textContent='';var max=Math.max.apply(null,valores.concat([1]));valores.forEach(function(v,i){g.appendChild(el('div',{title:rotulos[i]+': '+v,style:'height:'+Math.round(v/max*100)+'%'}))});var e=$(eixo);e.textContent='';[rotulos[0],rotulos[Math.floor(rotulos.length/2)],rotulos[rotulos.length-1]].forEach(function(r){e.appendChild(el('span',{text:r}))})}
function render(){
  var s=dados.status,ok=s.redis;$('status').textContent='';
  $('status').appendChild(el('span',{class:'bola',style:'background:'+(ok?'var(--ok)':'var(--alerta)')}));
  $('status').appendChild(el('span',{text:ok?'IA no ar':'Memória da IA fora do ar: avise a Control Gestão'}));
  $('status').appendChild(el('span',{class:'r',text:s.modo==='tag'?'Atende contatos com a tag "'+s.gate+'"':(s.modo==='todos'?'Atende todos os contatos sem a tag "'+s.humano+'"':'IA desligada')}));
  cards('hoje',dados.hoje);cards('sete',dados.seteDias);cards('trinta',dados.trintaDias);
  tabela('erros',['Quando','Contato','O que houve'],dados.erros.map(function(e){return [el('td',{text:hora(e.at)}),el('td',null,[contato(e.nome,e.link)]),el('td',{text:e.detalhe})]}),'Nenhum erro nas últimas 24 horas.');
  tabela('passagens',['Quando','Contato','Motivo','Resumo da IA'],dados.passagens.map(function(p){return [el('td',{text:hora(p.at)}),el('td',null,[contato(p.nome,p.link),p.perfil?el('div',{class:'resumo',text:p.perfil==='cliente'?'cliente':'não cliente'}):null]),el('td',null,[el('span',{class:'tag passou',text:p.motivo})]),el('td',{text:p.resumo})]}),'Nenhuma passagem ainda. Quando a IA passar um atendimento para a equipe, ele aparece aqui.');
  var tipos=['todos'];dados.diario.forEach(function(e){if(tipos.indexOf(e.tipo)<0)tipos.push(e.tipo)});
  var f=$('filtros');f.textContent='';tipos.forEach(function(t){var b=el('button',{class:t===filtro?'ativo':'',text:t==='todos'?'Tudo':(TIPO[t]||t)});b.onclick=function(){filtro=t;render()};f.appendChild(b)});
  tabela('diario',['Quando','O que aconteceu','Contato','Detalhe'],dados.diario.filter(function(e){return filtro==='todos'||e.tipo===filtro}).map(function(e){return [el('td',{text:hora(e.at)}),el('td',null,[el('span',{class:'tag'+(e.tipo==='erro'?' erro':e.tipo==='passou'?' passou':''),text:TIPO[e.tipo]||e.tipo})]),el('td',null,[contato(e.nome,e.link)]),el('td',{text:e.tipo==='resposta'?(e.guard&&e.guard.length?'trava acionada: '+e.guard.join(' · '):''):e.detalhe})]}),'O diário está vazio. A primeira conversa com a IA aparece aqui.');
  var rot=dados.dias.map(function(d){return d.dia.slice(8,10)+'/'+d.dia.slice(5,7)});
  barras('gContatos','eContatos',dados.dias.map(function(d){return d.contatos}),rot);
  barras('gPassagens','ePassagens',dados.dias.map(function(d){return d.passagens}),rot);
  var m=$('motivos');m.textContent='';if(!dados.motivos30.length)m.appendChild(el('div',{class:'vazio',text:'Nenhuma passagem nos últimos 30 dias.'}));dados.motivos30.forEach(function(x){m.appendChild(el('div',{class:'motivo'},[el('span',{text:x.motivo}),el('b',{text:String(x.total)})]))});
  $('cobertura').textContent='Base: os últimos '+dados.cobertura.registros+' registros do diário'+(dados.cobertura.desde?' (desde '+hora(dados.cobertura.desde)+')':'')+'. Custo em reais com dólar a R$ '+dados.cotacao.toLocaleString('pt-BR',{minimumFractionDigits:2})+'.';
  $('atualizado').textContent='Atualizado às '+new Date(dados.agora).toLocaleTimeString('pt-BR',{timeZone:'America/Sao_Paulo'})+' · atualiza sozinho a cada minuto.';
}
function carregar(){
  return fetch('/api/painel?dados=1',{headers:{'x-painel-senha':senha}}).then(function(r){
    if(r.status===401){sair('Senha incorreta.');return}
    if(r.status===429){sair('Muitas tentativas. Espere 15 minutos.');return}
    return r.json().then(function(j){dados=j;$('entrar').classList.add('oculto');$('app').classList.remove('oculto');render()})
  }).catch(function(){$('atualizado').textContent='Sem conexão com o painel agora. Tento de novo em 1 minuto.'})
}
function sair(m){try{sessionStorage.removeItem('painel-inovpay')}catch(e){}senha='';$('app').classList.add('oculto');$('entrar').classList.remove('oculto');$('msgEntrar').textContent=m||''}
$('btnEntrar').onclick=function(){senha=$('senha').value.trim();try{sessionStorage.setItem('painel-inovpay',senha)}catch(e){}$('msgEntrar').textContent='Entrando…';carregar()};
$('senha').onkeydown=function(e){if(e.key==='Enter')$('btnEntrar').click()};
document.querySelectorAll('#abas button').forEach(function(b){b.onclick=function(){document.querySelectorAll('#abas button').forEach(function(x){x.classList.toggle('ativo',x===b)});document.querySelectorAll('[data-painel]').forEach(function(s){s.classList.toggle('oculto',s.getAttribute('data-painel')!==b.getAttribute('data-aba'))})}});
if(senha)carregar();
setInterval(function(){if(senha&&dados)carregar()},60000);
})();
</script>
</body>
</html>`
