let database;
export async function openDatabase() {
  if(database) return database;
  database=await new Promise((resolve,reject)=>{
    const request=indexedDB.open('link-explorer-v1',1);
    request.onupgradeneeded=()=>request.result.createObjectStore('workspace');
    request.onsuccess=()=>{request.result.onversionchange=()=>{request.result.close();database=null;};resolve(request.result);};
    request.onerror=()=>reject(new Error('O navegador não permitiu abrir o armazenamento local.'));
    request.onblocked=()=>reject(new Error('Feche outras abas do Link Explorer para concluir a atualização.'));
  });
  return database;
}
export async function readWorkspace() {
  const db=await openDatabase();
  return new Promise((resolve,reject)=>{const req=db.transaction('workspace','readonly').objectStore('workspace').get('main');req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error);});
}
export async function writeWorkspace(state, expectedRevision) {
  const db=await openDatabase();
  return new Promise((resolve,reject)=>{
    const tx=db.transaction('workspace','readwrite');const store=tx.objectStore('workspace');const check=store.get('main');let reason;
    check.onsuccess=()=>{
      if(expectedRevision!==undefined && check.result && check.result.revision!==expectedRevision){reason=new Error('Há alterações de outra aba. Recarregue a página antes de editar.');tx.abort();return;}
      store.put(state,'main');
    };
    tx.oncomplete=()=>resolve();
    tx.onabort=tx.onerror=()=>reject(reason||new Error(tx.error?.name==='QuotaExceededError'?'O armazenamento está cheio. Exporte um backup e remova imagens que não usa.':'Não foi possível salvar. Sua versão anterior continua preservada.'));
  });
}
