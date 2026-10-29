import json,urllib.request,time
T='0x8c5be1e5ebec7d5bd14f71427d1e84f3dd0314c0f7b2291e5b200ac8c7c3b925';ot='0x0000000000000000000000008fa38b0a1c6cc0ddaddf4da8fd54d3cea1266a77'
def get(u,body=None):
  for i in range(8):
    try:
      rq=urllib.request.Request(u,data=json.dumps(body).encode() if body else None,headers={'content-type':'application/json','user-agent':'Mozilla/5.0'})
      r=json.load(urllib.request.urlopen(rq,timeout=30));
      if isinstance(r.get('result'),list): return r['result']
      print('retry',str(r)[:100])
    except Exception as e: print('err',e)
    time.sleep(3)
b=get(f'https://eth.blockscout.com/api?module=logs&action=getLogs&fromBlock=0&toBlock=latest&topic0={T}&topic1={ot}&topic0_1_opr=and')
k=lambda l:(l['transactionHash'],int(l['logIndex'],16));A={k(l) for l in b}
r=get('https://rpc.mevblocker.io',{'jsonrpc':'2.0','id':1,'method':'eth_getLogs','params':[{'fromBlock':hex(26245532),'toBlock':hex(26296669),'topics':[T,ot]}]})
print('bs',len(b),'rpc',len(r))
for l in r:
  if k(l) not in A: print(int(l['blockNumber'],16),l['address'],len(l['topics']),l['transactionHash'][:14])
