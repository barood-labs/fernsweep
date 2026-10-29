// Read-only cross-check: Blockscout (paginated) vs MEV Blocker public RPC eth_getLogs (10k-block chunks).
const owner=process.argv[2].toLowerCase();const T='0x8c5be1e5ebec7d5bd14f71427d1e84f3dd0314c0f7b2291e5b200ac8c7c3b925';
const ot='0x'+owner.slice(2).padStart(64,'0');
const j=async(u,b)=>{for(let t=0;t<5;t++){try{const r=await fetch(u,b?{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(b)}:{});const x=await r.text();try{return JSON.parse(x)}catch{console.error('non-json',u.slice(0,40),r.status)}}catch(e){console.error('fetch err',e.message)}await new Promise(s=>setTimeout(s,3000))}return {}};
let from=0,bsl=[],seen=new Set(),pages=0;
for(;;){let r;for(let t=0;t<8&&!Array.isArray(r);t++)r=(await j(`https://eth.blockscout.com/api?module=logs&action=getLogs&fromBlock=${from}&toBlock=latest&topic0=${T}&topic1=${ot}&topic0_1_opr=and`)).result;if(!Array.isArray(r)){console.log('blockscout page failed');process.exit(1)}pages++;
 for(const l of r){const k=l.transactionHash+l.logIndex;if(!seen.has(k)){seen.add(k);bsl.push(l)}}
 if(r.length<1000)break;from=parseInt(r.at(-1).blockNumber,16)}
const blocks=bsl.map(l=>parseInt(l.blockNumber,16));const lo=Math.min(...blocks),hi=Math.max(...blocks);
console.log('blockscout logs',bsl.length,'pages',pages,'range',lo,hi);
let rl=[];for(let b=lo;b<=hi;b+=50000){let r;for(let t=0;t<4;t++){r=await j('https://rpc.mevblocker.io',{jsonrpc:'2.0',id:1,method:'eth_getLogs',params:[{fromBlock:'0x'+b.toString(16),toBlock:'0x'+Math.min(b+49999,hi).toString(16),topics:[T,ot]}]});if(r.result)break;await new Promise(s=>setTimeout(s,1500))}
 if(!r.result){console.log('drpc fail',b,JSON.stringify(r).slice(0,120));process.exit(1)}rl.push(...r.result)}
const key=l=>l.transactionHash+':'+parseInt(l.logIndex,16);
const A=new Set(bsl.map(key)),B=new Set(rl.map(key));
console.log('drpc logs',rl.length,'only-blockscout',[...A].filter(x=>!B.has(x)).length,'only-drpc',[...B].filter(x=>!A.has(x)).length);
const pairs=new Set(bsl.filter(l=>l.topics.filter(Boolean).length===3).map(l=>l.address.toLowerCase()+'>0x'+l.topics[2].slice(26)));
let active=[];for(const p of pairs){const [t,s]=p.split('>');const r=await j('https://ethereum-rpc.publicnode.com',{jsonrpc:'2.0',id:1,method:'eth_call',params:[{to:t,data:'0xdd62ed3e'+ot.slice(2)+s.slice(2).padStart(64,'0')},'latest']});const v=BigInt((r.result||'0x0').slice(0,66)||'0x0');if(v>0n)active.push([t,s,v>=2n**255n?'UNLIMITED':v.toString()])}
console.log('pairs',pairs.size,'active',active.length);console.table(active.slice(0,10));
