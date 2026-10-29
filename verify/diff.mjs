const T='0x8c5be1e5ebec7d5bd14f71427d1e84f3dd0314c0f7b2291e5b200ac8c7c3b925',ot='0x0000000000000000000000008fa38b0a1c6cc0ddaddf4da8fd54d3cea1266a77';
let b=null;for(let i=0;i<8&&!Array.isArray(b);i++){try{b=(await (await fetch(`https://eth.blockscout.com/api?module=logs&action=getLogs&fromBlock=0&toBlock=latest&topic0=${T}&topic1=${ot}&topic0_1_opr=and`,{headers:{"user-agent":"Mozilla/5.0"}})).json()).result}catch{};if(!Array.isArray(b))await new Promise(s=>setTimeout(s,3000))}
const k=l=>l.transactionHash+':'+parseInt(l.logIndex,16);const A=new Set(b.map(k));
const r=(await (await fetch('https://rpc.mevblocker.io',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({jsonrpc:'2.0',id:1,method:'eth_getLogs',params:[{fromBlock:'0x'+(26245532).toString(16),toBlock:'0x'+(26296669).toString(16),topics:[T,ot]}]})})).json()).result;
for(const l of r)if(!A.has(k(l)))console.log(parseInt(l.blockNumber,16),l.address,l.topics.length,l.transactionHash.slice(0,12));
console.log('bs max block',Math.max(...b.map(l=>parseInt(l.blockNumber,16))),'bs count',b.length);
