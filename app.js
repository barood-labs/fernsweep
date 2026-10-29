'use strict';
// Fernsweep — read-only scanner + user-signed actions via injected EIP-1193 wallet. No keys, no backend.
const CHAINS={
 eth:{name:'Ethereum',id:1,hex:'0x1',rpc:'https://ethereum-rpc.publicnode.com',bs:'https://eth.blockscout.com',logsRpc:'https://rpc.mevblocker.io',recent:50000},
 rh:{name:'Robinhood Chain',id:4663,hex:'0x1237',rpc:'https://rpc.mainnet.chain.robinhood.com',bs:'https://robinhoodchain.blockscout.com',logsRpc:'https://rpc.mainnet.chain.robinhood.com',recent:29000,
   add:{chainId:'0x1237',chainName:'Robinhood Chain',nativeCurrency:{name:'Ether',symbol:'ETH',decimals:18},rpcUrls:['https://rpc.mainnet.chain.robinhood.com'],blockExplorerUrls:['https://robinhoodchain.blockscout.com']}}};
const T_APPROVAL='0x8c5be1e5ebec7d5bd14f71427d1e84f3dd0314c0f7b2291e5b200ac8c7c3b925';
const T_APPROVAL_ALL='0x17307eab39ab6107e8899845ad3d59bd9653f200f220920489ca2b5937696c31';
const DEAD='0x000000000000000000000000000000000000dEaD';
const MAXU=2n**255n;
const $=id=>document.getElementById(id);
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const isAddr=a=>/^0x[0-9a-fA-F]{40}$/.test(a);
const pad=h=>h.replace(/^0x/,'').toLowerCase().padStart(64,'0');
const topicAddr=t=>'0x'+t.slice(26);
const fmt=(v,d=18,p=6)=>{v=BigInt(v);const s=(v<0n?-v:v).toString().padStart(d+1,'0');const i=s.slice(0,-d)||'0',f=s.slice(-d).slice(0,p).replace(/0+$/,'');return (v<0n?'-':'')+i+(f?'.'+f:'')};
const usd=n=>n==null||isNaN(n)?'—':'$'+n.toLocaleString(undefined,{maximumFractionDigits:2});
const status=m=>$('status').innerHTML=m;
const hidden=new Set(JSON.parse(localStorage.getItem('fs_hidden')||'[]'));
async function rpc(c,method,params,url){let e;for(let i=0;i<3;i++){try{return await rpc1(c,method,params,url)}catch(x){e=x;if(/revert|execution/i.test(x.message))throw x;await new Promise(s=>setTimeout(s,800*(i+1)))}}throw e}
async function rpc1(c,method,params,url){const r=await fetch(url||CHAINS[c].rpc,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({jsonrpc:'2.0',id:1,method,params})});const j=await r.json();if(j.error)throw new Error(j.error.message);return j.result}
async function bs(c,path){let e;for(let i=0;i<3;i++){try{const r=await fetch(CHAINS[c].bs+path);if(r.ok){const j=await r.json();if(!('result' in j)||j.result!==null)return j}e=new Error(CHAINS[c].name+' explorer HTTP '+r.status)}catch(x){e=x}await new Promise(s=>setTimeout(s,1500*(i+1)))}throw e}
const priceCache={};
async function nativePrice(c){if(c in priceCache)return priceCache[c];try{const s=await bs(c,'/api/v2/stats');priceCache[c]=s.coin_price?+s.coin_price:null}catch{priceCache[c]=null}return priceCache[c]}

// ---------- spam heuristics ----------
function spamFlags(t){const f=[];const n=(t.name||'')+' '+(t.symbol||'');
 if(t.reputation&&t.reputation!=='ok')f.push('explorer: '+t.reputation);
 if(/https?:|www\.|\.com|\.io|\.xyz|\.org|claim|visit|reward|airdrop|voucher|\$ ?\d/i.test(n))f.push('URL/claim bait in name');
 if(!t.exchange_rate)f.push('no market price');
 if(t.holders_count&&+t.holders_count<50)f.push('few holders');
 return f}
const isSpam=f=>f.some(x=>/explorer|bait/.test(x))||f.length>=3;

// ---------- approvals ----------
// Blockscout getLogs returns max 1000 rows per call; paginate by block cursor and de-duplicate.
async function allLogs(c,topic0,owner){const seen=new Set(),out=[];let from=0;
 for(let guard=0;guard<200;guard++){
  const j=await bs(c,`/api?module=logs&action=getLogs&fromBlock=${from}&toBlock=latest&topic0=${topic0}&topic1=0x${pad(owner)}&topic0_1_opr=and`);
  const rows=Array.isArray(j.result)?j.result:[];
  for(const l of rows){const k=l.transactionHash+':'+parseInt(l.logIndex,16);if(!seen.has(k)){seen.add(k);out.push(l)}}
  if(rows.length<1000)break;
  const last=parseInt(rows[rows.length-1].blockNumber,16);if(last<=from)throw new Error('Too many logs in one block');from=last}
 try{const head=parseInt(await rpc(c,'eth_blockNumber',[]),16);const rl=await rpc(c,'eth_getLogs',[{fromBlock:'0x'+Math.max(0,head-CHAINS[c].recent).toString(16),toBlock:'latest',topics:[topic0,'0x'+pad(owner)]}],CHAINS[c].logsRpc);
  for(const l of rl||[]){const k=l.transactionHash+':'+parseInt(l.logIndex,16);if(!seen.has(k)){seen.add(k);out.push(l)}}}catch{}
 out.sort((a,b)=>parseInt(a.blockNumber,16)-parseInt(b.blockNumber,16)||parseInt(a.logIndex,16)-parseInt(b.logIndex,16));return out}
const tp=l=>(l.topics||[]).filter(x=>x);
async function approvals(c,owner){
 const [erc,all]=await Promise.all([allLogs(c,T_APPROVAL,owner),allLogs(c,T_APPROVAL_ALL,owner)]);
 const latest={};
 // ERC-20 Approval has 3 topics; ERC-721 per-token Approval has 4 (tokenId) — skipped (cleared on transfer).
 for(const l of erc){const t=tp(l);if(t.length!==3)continue;latest['20|'+l.address.toLowerCase()+'|'+topicAddr(t[2])]={kind:'ERC-20',token:l.address,spender:topicAddr(t[2])}}
 for(const l of all){const t=tp(l);if(t.length<3)continue;latest['721|'+l.address.toLowerCase()+'|'+topicAddr(t[2])]={kind:'NFT (all)',token:l.address,spender:topicAddr(t[2])}}
 const out=[];const list=Object.values(latest);
 for(let i=0;i<list.length;i+=8)await Promise.all(list.slice(i,i+8).map(async a=>{
  try{ if(a.kind==='ERC-20'){const r=await rpc(c,'eth_call',[{to:a.token,data:'0xdd62ed3e'+pad(owner)+pad(a.spender)},'latest']);a.amount=BigInt(r&&r!=='0x'?r.slice(0,66):'0x0');if(a.amount===0n)return;a.unlimited=a.amount>=MAXU}
       else {const r=await rpc(c,'eth_call',[{to:a.token,data:'0xe985e9c5'+pad(owner)+pad(a.spender)},'latest']);if(BigInt(r&&r!=='0x'?r.slice(0,66):'0x0')===0n)return;a.unlimited=true}
  }catch(err){if(/revert|execution/i.test(err.message))return;a.unverified=true;a.unlimited=false;a.amount=0n}
  out.push(a)}));
 out.sort((a,b)=>(b.unlimited?1:0)-(a.unlimited?1:0));return out}

// ---------- scan ----------
let LAST={};
async function scanOne(c,a){
 const [bal,toks,appr,price]=await Promise.all([rpc(c,'eth_getBalance',[a,'latest']),bs(c,`/api/v2/addresses/${a}/token-balances`).catch(e=>({err:e.message})),approvals(c,a).catch(e=>({err:e.message})),nativePrice(c)]);
 const tokens=Array.isArray(toks)?toks.filter(t=>t.token&&t.token.type==='ERC-20').map(t=>{const k=t.token;const d=+k.decimals||0;const amt=BigInt(t.value||0);const flags=spamFlags(k);const val=k.exchange_rate?Number(fmt(amt,d,8))*+k.exchange_rate:null;return {addr:k.address_hash,name:k.name,symbol:k.symbol,decimals:d,amt,flags,spam:isSpam(flags),usd:val}}):[];
 const nativeUsd=price?Number(fmt(bal,18,8))*price:null;
 return {c,a,bal:BigInt(bal),nativeUsd,tokens,tokErr:toks.err,approvals:Array.isArray(appr)?appr:[],apprErr:appr.err}}
async function scan(){
 const list=[...new Set($('addrs').value.split(/[\s,;]+/).filter(Boolean))];
 const bad=list.filter(a=>!isAddr(a));if(bad.length)return status('<span class="tag hi">Not valid addresses (ENS names not supported yet):</span> '+esc(bad.join(', ')));
 if(!list.length)return status('Paste at least one address.');
 if(/^(0x)?[0-9a-f]{64}$/i.test($('addrs').value.trim()))return status('That looks like a private key. Never paste it anywhere. Clear it now.');
 localStorage.setItem('fs_saved',JSON.stringify(list));
 const chains=[$('cEth').checked&&'eth',$('cRh').checked&&'rh'].filter(Boolean);
 const res=[];let i=0;
 for(const a of list)for(const c of chains){status(`Scanning ${++i}/${list.length*chains.length}… (${CHAINS[c].name}, ${a.slice(0,8)}…)`);try{res.push(await scanOne(c,a))}catch(e){res.push({c,a,err:e.message})}}
 LAST={};res.forEach(r=>LAST[r.c+'|'+r.a.toLowerCase()]=r);
 render(res,diff(res));status('Done. Scanned '+res.length+' wallet/chain pairs.')}

// ---------- diff vs last scan (alerts) ----------
function diff(res){const prev=JSON.parse(localStorage.getItem('fs_snap')||'{}');const snap={};const notes=[];
 for(const r of res){if(r.err)continue;const k=r.c+'|'+r.a.toLowerCase();
  const ap=r.approvals.filter(x=>x.unlimited).map(x=>x.token+'>'+x.spender);const sp=r.tokens.filter(t=>t.spam).map(t=>t.addr);
  snap[k]={ap,sp};const p=prev[k];if(!p)continue;
  ap.filter(x=>!p.ap.includes(x)).forEach(x=>notes.push(`${CHAINS[r.c].name} ${r.a.slice(0,8)}…: NEW unlimited approval ${x}`));
  sp.filter(x=>!p.sp.includes(x)).forEach(x=>notes.push(`${CHAINS[r.c].name} ${r.a.slice(0,8)}…: NEW spam token ${x}`))}
 localStorage.setItem('fs_snap',JSON.stringify(Object.assign(prev,snap)));return {notes,first:!Object.keys(prev).length}}

// ---------- render ----------
function render(res,d){
 let totU=0,html='';const tot={eth:0n,rh:0n};
 for(const r of res){if(r.err)continue;tot[r.c]+=r.bal;totU+=(r.nativeUsd||0)+r.tokens.filter(t=>!t.spam).reduce((s,t)=>s+(t.usd||0),0)}
 html+=`<section class="card"><h2>Portfolio</h2><p>Total (native + priced non-spam tokens): <b>${usd(totU)}</b> · ETH on Ethereum: ${fmt(tot.eth)} · ETH on Robinhood Chain: ${fmt(tot.rh)}</p>
 <p class="muted">Prices from Blockscout explorer data; unpriced tokens count as $0.</p>
 <h3>Alerts since last scan</h3>${d.first?'<p class="muted">First scan saved as baseline.</p>':d.notes.length?'<ul>'+d.notes.map(n=>'<li class="tag hi">'+esc(n)+'</li>').join('')+'</ul>':'<p class="tag ok">No new risky approvals or spam tokens.</p>'}
 <div class="row"><button id="csv" class="ghost">Export history CSV (all scanned wallets)</button><button id="sweepBtn" class="ghost">Gas sweeper</button><button id="bridgeBtn" class="ghost">Bridge helper</button><button id="airBtn" class="ghost">Airdrop checker</button></div><div id="tools"></div></section>`;
 for(const r of res){const ch=CHAINS[r.c];
  if(r.err){html+=`<section class="card"><h3>${ch.name} · ${esc(r.a)}</h3><p class="tag hi">${esc(r.err)}</p></section>`;continue}
  const toks=r.tokens.filter(t=>!hidden.has(r.c+'|'+t.addr.toLowerCase()));
  html+=`<section class="card"><h3>${ch.name} · <a href="${ch.bs}/address/${r.a}" target="_blank" rel="noopener">${esc(r.a)}</a></h3>
  <p>Native: <b>${fmt(r.bal)} ETH</b> (${usd(r.nativeUsd)}) · ${r.tokens.length} tokens (${r.tokens.filter(t=>t.spam).length} flagged spam) · ${r.approvals.length} active approvals</p>
  <h4>Approvals ${r.apprErr?'<span class="tag md">'+esc(r.apprErr)+'</span>':''}</h4>
  ${r.approvals.length?`<div class="row"><button class="danger" data-act="revokeAll" data-k="${r.c}|${r.a}">Revoke all ${r.approvals.length} (one tx each)</button></div><div class="scroll"><table><tr><th>Type</th><th>Token</th><th>Spender</th><th>Allowance</th><th></th></tr>${r.approvals.map((a,i)=>`<tr><td>${a.kind}</td><td><a href="${ch.bs}/token/${a.token}" target="_blank" rel="noopener">${esc(a.token)}</a></td><td>${esc(a.spender)}</td><td>${a.unverified?'<span class="tag md">could not verify (RPC busy) — rescan</span>':a.unlimited?'<span class="tag hi">UNLIMITED — high risk</span>':esc(a.amount.toString())}</td><td><button class="warn" data-act="revoke" data-k="${r.c}|${r.a}" data-i="${i}">Revoke</button></td></tr>`).join('')}</table></div>`:'<p class="tag ok">No active approvals found.</p>'}
  <h4>Tokens ${r.tokErr?'<span class="tag md">'+esc(r.tokErr)+'</span>':''}</h4>
  <div class="scroll"><table><tr><th>Token</th><th>Amount</th><th>USD</th><th>Flags</th><th></th></tr>${toks.map(t=>`<tr><td>${esc(t.symbol)} <span class="muted">${esc(t.name)}</span><br><code>${t.addr}</code></td><td>${fmt(t.amt,t.decimals)}</td><td>${t.spam?'—':usd(t.usd)}</td><td>${t.flags.map(f=>`<span class="tag ${t.spam?'hi':'md'}">${esc(f)}</span>`).join('')||'<span class="tag ok">ok</span>'}</td><td>${t.spam?`<button class="ghost" data-act="hide" data-h="${r.c}|${t.addr.toLowerCase()}">Hide</button> <button class="danger" data-act="burn" data-k="${r.c}|${r.a}" data-t="${t.addr}">Burn</button>`:''}</td></tr>`).join('')}</table></div>
  ${hidden.size?'<p class="muted">Hidden spam tokens are saved only in this browser.</p>':''}</section>`}
 $('results').innerHTML=html;
 $('csv').onclick=exportCsv;$('sweepBtn').onclick=sweepUI;$('bridgeBtn').onclick=bridgeUI;$('airBtn').onclick=airUI}

// ---------- wallet (user's own injected EIP-1193) ----------
let ACCT=null;
async function connect(){if(!window.ethereum)return alert('No browser wallet found. Install MetaMask or Rabby to take actions. Scanning works without one.');
 const a=await ethereum.request({method:'eth_requestAccounts'});ACCT=a[0];$('who').textContent='Connected: '+ACCT}
async function ensure(c,from){if(!ACCT)await connect();
 if(ACCT.toLowerCase()!==from.toLowerCase())throw new Error(`Switch your wallet to ${from} first (connected: ${ACCT}).`);
 try{await ethereum.request({method:'wallet_switchEthereumChain',params:[{chainId:CHAINS[c].hex}]})}
 catch(e){if(e.code===4902&&CHAINS[c].add)await ethereum.request({method:'wallet_addEthereumChain',params:[CHAINS[c].add]});else throw e}}
async function gasQuote(c,tx){const [g,gp]=await Promise.all([rpc(c,'eth_estimateGas',[tx]),rpc(c,'eth_gasPrice',[])]);const gas=BigInt(g),price=BigInt(gp);return {gas,price,cost:gas*price}}
async function send(c,tx,label){await ensure(c,tx.from);const q=await gasQuote(c,tx);const p=await nativePrice(c);
 if(!confirm(`${label}\n\nChain: ${CHAINS[c].name}\nEstimated gas: ${q.gas} units ≈ ${fmt(q.cost)} ETH (${usd(p?Number(fmt(q.cost,18,10))*p:null)})\n\nYour wallet will show the final details. Continue?`))return null;
 const h=await ethereum.request({method:'eth_sendTransaction',params:[{...tx,gas:'0x'+(q.gas*12n/10n).toString(16)}]});
 status(`Sent: <a target="_blank" rel="noopener" href="${CHAINS[c].bs}/tx/${h}">${h}</a>`);return h}
function revokeTx(owner,a){return a.kind==='ERC-20'?{from:owner,to:a.token,data:'0x095ea7b3'+pad(a.spender)+pad('0')}:{from:owner,to:a.token,data:'0xa22cb465'+pad(a.spender)+pad('0')}}
document.addEventListener('click',async e=>{const b=e.target.closest('button[data-act]');if(!b)return;const act=b.dataset.act;
 try{ if(act==='hide'){hidden.add(b.dataset.h);localStorage.setItem('fs_hidden',JSON.stringify([...hidden]));b.closest('tr').remove();return}
  const [c,a]=b.dataset.k.split('|');const r=LAST[c+'|'+a.toLowerCase()];
  if(act==='revoke'){const ap=r.approvals[+b.dataset.i];await send(c,revokeTx(a,ap),`Revoke ${ap.kind} approval\nToken: ${ap.token}\nSpender: ${ap.spender}`)}
  if(act==='revokeAll'){for(const ap of r.approvals){const h=await send(c,revokeTx(a,ap),`Revoke ${ap.kind} approval\nToken: ${ap.token}\nSpender: ${ap.spender}`);if(!h)break}}
  if(act==='burn'){const t=r.tokens.find(x=>x.addr===b.dataset.t);
   if(!confirm(`⚠️ BURN ${t.symbol}?\n\nThis sends ALL ${fmt(t.amt,t.decimals)} to ${DEAD} forever. It cannot be undone.\nScam tokens sometimes have malicious transfer code — hiding is safer and free. Only burn if you understand this.`))return;
   await send(c,{from:a,to:t.addr,data:'0xa9059cbb'+pad(DEAD)+pad(t.amt.toString(16))},`Burn ${t.symbol} (transfer to dead address)`)}
 }catch(err){status('<span class="tag hi">'+esc(err.message||err)+'</span>')}});

// ---------- gas sweeper ----------
// Fee model: legacy gasPrice so the wallet pays exactly gasLimit*gasPrice and we can leave exact gas.
// Robinhood Chain is an Arbitrum Orbit L2: L1 data cost is charged as extra gas units. We query
// NodeInterface (0x..C8).gasEstimateL1Component and add those units to the L2 estimate.
const NODE_IF='0x00000000000000000000000000000000000000C8';
async function l1Units(c,from,to,data='0x'){if(c!=='rh')return 0n;try{
 const len=(data.length-2)/2;const body=data.slice(2).padEnd(Math.ceil(len/32)*64,'0');
 const r=await rpc(c,'eth_call',[{from,to:NODE_IF,data:'0x77d488a2'+pad(to)+pad('0')+pad('60')+pad(len.toString(16))+body},'latest']);
 return BigInt('0x'+r.slice(2,66))}catch{return 0n}}
async function nativeSweepQuote(c,from,to){
 const [bal,gp]=await Promise.all([rpc(c,'eth_getBalance',[from,'latest']),rpc(c,'eth_gasPrice',[])]);
 const price=BigInt(gp)*12n/10n; // +20% buffer so it confirms
 let l2=21000n;try{l2=BigInt(await rpc(c,'eth_estimateGas',[{from,to,value:'0x1'}]))}catch{}
 const l1=await l1Units(c,from,to);const gas=(l2+l1)*11n/10n;const fee=gas*price;const B=BigInt(bal);
 return {bal:B,gas,price,fee,l1,value:B>fee?B-fee:0n}}
async function sweepUI(){const ws=Object.values(LAST).filter(r=>!r.err);
 $('tools').innerHTML=`<h3>Gas sweeper</h3><p class="muted">Leftover ETH from each wallet → one target. Live gas shown first. Sweep amount = balance − exact max gas, so nothing is stranded. Switch your wallet app to each account and click its button; you sign every send.</p>
 <div class="row"><input id="swTo" placeholder="0x target address (double-check it!)"><button id="swQuote">Get live quotes</button></div><div id="swList" class="scroll"></div>`;
 $('swQuote').onclick=async()=>{const to=$('swTo').value.trim();if(!isAddr(to))return status('Enter a valid target address first.');
  $('swList').innerHTML='Quoting gas…';const rows=[];
  for(const r of ws){if(r.a.toLowerCase()===to.toLowerCase())continue;try{const q=await nativeSweepQuote(r.c,r.a,to);const p=await nativePrice(r.c);
   const U=v=>p?Number(fmt(v,18,12))*p:null;const netU=U(q.value);const worth=q.value>0n&&q.value>q.fee*3n&&(netU==null||netU>=1);
   const swapGas=(r.c==='rh'?250000n:180000n)*q.price; // approve+swap typical
   const dust=r.tokens.filter(t=>!t.spam&&t.usd!=null&&t.usd<50).map(t=>({t,ok:t.usd>U(swapGas)*2}));
   rows.push({r,q,netU,feeU:U(q.fee),worth,dust,swapU:U(swapGas)})}catch(e){rows.push({r,err:e.message})}}
  rows.sort((x,y)=>(y.netU??-1)-(x.netU??-1));
  $('swList').innerHTML=`<table><tr><th>Chain</th><th>Wallet</th><th>Balance</th><th>Gas (ETH / USD)</th><th>Net after gas</th><th></th></tr>${rows.map((x,i)=>x.err?`<tr><td>${CHAINS[x.r.c].name}</td><td>${x.r.a}</td><td colspan=4 class="tag hi">${esc(x.err)}</td></tr>`:
   `<tr><td>${CHAINS[x.r.c].name}</td><td><code>${x.r.a}</code></td><td>${fmt(x.q.bal)} ETH</td><td>${fmt(x.q.fee,18,8)} / ${usd(x.feeU)}${x.r.c==='rh'?`<br><span class="muted">incl. L1 data: ${x.q.l1} gas units</span>`:''}</td><td>${fmt(x.q.value)} ETH (${usd(x.netU)})<br><span class="tag ${x.worth?'ok':'hi'}">${x.worth?'Worth it':'Not worth it'}</span></td><td><button class="warn" data-sw="${i}" ${x.q.value>0n?'':'disabled'}>Sweep</button></td></tr>
   ${x.dust.length?`<tr><td></td><td colspan=5 class="muted">Dust tokens (swap ≈ ${usd(x.swapU)} gas): ${x.dust.map(d=>`${esc(d.t.symbol)} ${usd(d.t.usd)} <span class="tag ${d.ok?'ok':'hi'}">${d.ok?'worth swapping':'not worth swapping'}</span>`).join(' · ')}</td></tr>`:''}`).join('')}</table>`;
  $('swList').querySelectorAll('[data-sw]').forEach(b=>b.onclick=async()=>{const {r}=rows[+b.dataset.sw];
   try{await ensure(r.c,r.a);const q=await nativeSweepQuote(r.c,r.a,to);if(q.value<=0n)throw new Error('Balance is below the gas cost.');
    if(!confirm(`Sweep ${fmt(q.value)} ETH\nfrom ${r.a}\nto ${to}\non ${CHAINS[r.c].name}\nGas reserved: ${fmt(q.fee,18,8)} ETH. Continue?`))return;
    const h=await ethereum.request({method:'eth_sendTransaction',params:[{from:r.a,to,value:'0x'+q.value.toString(16),gas:'0x'+q.gas.toString(16),gasPrice:'0x'+q.price.toString(16)}]});status('Sweep sent: '+esc(h))}catch(e){status('<span class="tag hi">'+esc(e.message)+'</span>')}})}}

// ---------- CSV export ----------
async function exportCsv(){const rows=[['chain','wallet','hash','time_utc','type','from','to','token','amount','fee_eth','status']];
 for(const r of Object.values(LAST)){if(r.err)continue;status('Fetching history '+r.a.slice(0,8)+'… '+CHAINS[r.c].name);
  const tx=await bs(r.c,`/api?module=account&action=txlist&address=${r.a}&sort=asc`).catch(()=>({result:[]}));
  for(const t of tx.result||[])rows.push([CHAINS[r.c].name,r.a,t.hash,new Date(t.timeStamp*1000).toISOString(),'native',t.from,t.to,'ETH',fmt(t.value),fmt(BigInt(t.gasUsed||0)*BigInt(t.gasPrice||0)),t.isError==='1'?'failed':'ok']);
  const tt=await bs(r.c,`/api?module=account&action=tokentx&address=${r.a}&sort=asc`).catch(()=>({result:[]}));
  for(const t of tt.result||[])rows.push([CHAINS[r.c].name,r.a,t.hash,new Date(t.timeStamp*1000).toISOString(),'erc20',t.from,t.to,t.tokenSymbol,fmt(t.value,+t.tokenDecimal||0),'','ok'])}
 const csv=rows.map(r=>r.map(x=>'"'+String(x??'').replace(/"/g,'""')+'"').join(',')).join('\n');
 const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([csv],{type:'text/csv'}));a.download='fernsweep-history.csv';a.click();
 status(`CSV ready: ${rows.length-1} rows. Explorer APIs may cap very long histories (~10k rows per list). Not tax advice; no cost-basis calculation.`)}

// ---------- bridge helper ----------
async function bridgeUI(){let gp={};for(const c of ['eth','rh'])try{gp[c]=BigInt(await rpc(c,'eth_gasPrice',[]))}catch{}
 const p=await nativePrice('eth');const est=c=>gp[c]?fmt(gp[c]*21000n,18,8)+' ETH ('+usd(p?Number(fmt(gp[c]*21000n,18,12))*p:null)+')':'—';
 let pend='';for(const r of Object.values(LAST).filter(r=>!r.err&&r.c==='eth')){const tx=await bs('eth',`/api?module=account&action=txlist&address=${r.a}&sort=desc&page=1&offset=25`).catch(()=>({result:[]}));
  const recent=(tx.result||[]).filter(t=>/deposit|bridge|outbox|inbox/i.test(t.functionName||'')&&Date.now()/1000-t.timeStamp<8*86400);
  recent.forEach(t=>pend+=`<li>${r.a.slice(0,8)}… <a target="_blank" rel="noopener" href="https://eth.blockscout.com/tx/${t.hash}">${esc(t.functionName.split('(')[0])}</a> ${new Date(t.timeStamp*1000).toLocaleString()}</li>`)}
 $('tools').innerHTML=`<h3>Robinhood Chain bridge helper</h3><p>Use only the official bridge linked from <a href="https://docs.robinhood.com/chain/" target="_blank" rel="noopener">Robinhood Chain docs</a> or Robinhood Wallet. Never use bridge links from DMs or ads.</p>
 <p>Simple transfer cost right now — Ethereum: ${est('eth')} · Robinhood Chain: ${est('rh')}. Bridge deposits cost more (contract call, typically 3–8× a simple transfer on Ethereum). Arbitrum-style withdrawals back to Ethereum take ~7 days.</p>
 <h4>Recent bridge-like transactions on Ethereum (last 8 days)</h4>${pend?'<ul>'+pend+'</ul>':'<p class="muted">None detected (heuristic: function name contains deposit/bridge/inbox/outbox).</p>'}`}

// ---------- airdrop checker (honest stub) ----------
function airUI(){$('tools').innerHTML=`<h3>Airdrop / claim checker</h3><p class="tag md">Limited coverage</p><p>There's no free, trustworthy, universal airdrop database, so we don't show guessed eligibility. Fake “claim” sites are the #1 wallet-drainer trick — any spam token telling you to “claim” is flagged above.</p>
 <p>Free official checks to do yourself: each project's own site linked from its verified X account. Never sign a "claim" that asks for approvals or setApprovalForAll.</p>`}

// ---------- Stuck: pending tx ----------
$('stCheck').onclick=async()=>{const a=$('stAddr').value.trim(),c=$('stChain').value;if(!isAddr(a))return $('stOut').textContent='Enter a valid address.';
 try{const [l,p,gp]=await Promise.all([rpc(c,'eth_getTransactionCount',[a,'latest']),rpc(c,'eth_getTransactionCount',[a,'pending']),rpc(c,'eth_gasPrice',[])]);
  const L=parseInt(l),P=parseInt(p);let h=`<p>Confirmed nonce: <b>${L}</b> · Pending nonce (as seen by public RPC): <b>${P}</b> · Network gas price: ${fmt(BigInt(gp),9,2)} gwei</p>`;
  if(P>L){h+=`<p class="tag md">${P-L} transaction(s) waiting, starting at nonce ${L}.</p>`;for(let n=L;n<P;n++)h+=`<div class="row">Nonce ${n}: <button class="warn" data-cancel="${n}">Cancel (0 ETH to self, higher fee)</button></div>`}
  else h+=`<p class="muted">The public node sees nothing pending. If your wallet still shows “pending” at nonce ${L}, it may only exist in your wallet. You can still replace it:</p><div class="row"><button class="warn" data-cancel="${L}">Cancel/replace nonce ${L}</button></div>`;
  h+=`<p class="muted">Speed up: use your wallet's own “Speed up” button (it resends the same tx with a higher fee). Cancel here sends a 0-ETH self-transfer with the same nonce and ~30% higher fee; MetaMask requires “Customize transaction nonce” turned on in Settings → Advanced.</p>`;
  $('stOut').innerHTML=h;
  $('stOut').querySelectorAll('[data-cancel]').forEach(b=>b.onclick=async()=>{try{await ensure(c,a);const fee=BigInt(await rpc(c,'eth_gasPrice',[]))*2n;
   if(!confirm(`Cancel nonce ${b.dataset.cancel} by sending 0 ETH to yourself with max fee ~${fmt(fee,9,2)} gwei. Continue?`))return;
   const tx=await ethereum.request({method:'eth_sendTransaction',params:[{from:a,to:a,value:'0x0',nonce:'0x'+(+b.dataset.cancel).toString(16),maxFeePerGas:'0x'+fee.toString(16),maxPriorityFeePerGas:'0x'+(fee/4n).toString(16)}]});status('Replacement sent: '+esc(tx))}catch(e){status('<span class="tag hi">'+esc(e.message)+'</span>')}})
 }catch(e){$('stOut').innerHTML='<span class="tag hi">'+esc(e.message)+'</span>'}};

// ---------- Stuck: token diagnosis ----------
$('tkCheck').onclick=async()=>{const t=$('tkAddr').value.trim(),h=$('tkHolder').value.trim(),c=$('tkChain').value;if(!isAddr(t))return $('tkOut').textContent='Enter a valid token address.';
 const why=[];let info={},sc={};
 try{info=await bs(c,`/api/v2/tokens/${t}`)}catch{}try{sc=await bs(c,`/api/v2/smart-contracts/${t}`)}catch{}
 if(info.reputation&&info.reputation!=='ok')why.push(['hi','Explorer marks this token as '+info.reputation+'.']);
 if(!info.exchange_rate)why.push(['md','No market price found — likely no real liquidity, so there may be nobody to sell to.']);
 const src=sc.source_code||'';
 if(!src)why.push(['md','Contract source is not verified — its rules are hidden. Common for scam tokens.']);
 else{const chk=[[/blacklist|blocklist|isBlocked|_isBot|bots\[/i,'Has a blacklist/bot list — the owner can block specific wallets from transferring.'],[/whenNotPaused|function\s+pause/i,'Has a pause switch — the owner can freeze all transfers.'],[/maxTx|maxTransaction|_maxWallet|maxWallet/i,'Has max-transaction / max-wallet limits that can block sells.'],[/tradingEnabled|tradingOpen|enableTrading/i,'Has a trading on/off switch controlled by the owner.'],[/setFee|sellFee|_taxFee|setTax/i,'Owner can change fees — sell tax could be set near 100% (honeypot pattern).']];
  chk.forEach(([re,m])=>re.test(src)&&why.push(['hi',m]));if(sc.is_proxy||/proxy/i.test(sc.proxy_type||''))why.push(['md','Upgradeable proxy — the owner can change the code at any time.'])}
 if(isAddr(h)){try{const bal=BigInt(await rpc(c,'eth_call',[{to:t,data:'0x70a08231'+pad(h)},'latest']));if(bal===0n)why.push(['md','This wallet holds 0 of this token.']);
   else{try{await rpc(c,'eth_call',[{from:h,to:t,data:'0xa9059cbb'+pad(DEAD)+pad('1')},'latest']);why.push(['ok','Simulated a tiny transfer from your wallet: it succeeded. Basic transfers work; selling may still fail on a DEX (fees/limits).'])}
   catch(e){why.push(['hi','Simulated transfer from your wallet FAILED: '+e.message+'. The contract is blocking your wallet from moving it.'])}}}catch{}}
 $('tkOut').innerHTML=`<p><b>${esc(info.name||'Unknown')} (${esc(info.symbol||'?')})</b> · holders: ${esc(info.holders_count||'?')}</p><ul>${why.map(([k,m])=>`<li><span class="tag ${k}">${k==='hi'?'risk':k==='md'?'caution':'ok'}</span> ${esc(m)}</li>`).join('')||'<li>No obvious red flags found.</li>'}</ul><p class="muted">These are heuristics, not proof. If the contract blocks you, no tool can force-unlock it. Hiding it is free; burning may also be blocked.</p>`};

$('scan').onclick=scan;$('connect').onclick=()=>connect().catch(e=>status(esc(e.message)));
$('addrs').value=(JSON.parse(localStorage.getItem('fs_saved')||'[]')).join('\n');
