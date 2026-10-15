const encoder=new TextEncoder();
const table=Array.from({length:256},(_,n)=>{for(let k=0;k<8;k++) n=n&1?0xedb88320^(n>>>1):n>>>1;return n>>>0;});
const crc32=bytes=>{let c=0xffffffff;for(const b of bytes)c=table[(c^b)&255]^(c>>>8);return(c^0xffffffff)>>>0;};
export function zipFiles(files) {
  const body=[],directory=[];let offset=0;
  const record=(length)=>{const b=new Uint8Array(length);return [b,new DataView(b.buffer)];};
  for(const [name,content] of Object.entries(files)) {
    const path=encoder.encode(name);const data=typeof content==='string'?encoder.encode(content):content;const crc=crc32(data);
    const [local,v]=record(30+path.length);v.setUint32(0,0x04034b50,true);v.setUint16(4,20,true);v.setUint16(6,0x800,true);v.setUint32(14,crc,true);v.setUint32(18,data.length,true);v.setUint32(22,data.length,true);v.setUint16(26,path.length,true);local.set(path,30);body.push(local,data);
    const [central,c]=record(46+path.length);c.setUint32(0,0x02014b50,true);c.setUint16(4,20,true);c.setUint16(6,20,true);c.setUint16(8,0x800,true);c.setUint32(16,crc,true);c.setUint32(20,data.length,true);c.setUint32(24,data.length,true);c.setUint16(28,path.length,true);c.setUint32(42,offset,true);central.set(path,46);directory.push(central);offset+=local.length+data.length;
  }
  const size=directory.reduce((n,b)=>n+b.length,0);const [end,e]=record(22);e.setUint32(0,0x06054b50,true);e.setUint16(8,directory.length,true);e.setUint16(10,directory.length,true);e.setUint32(12,size,true);e.setUint32(16,offset,true);
  return new Blob([...body,...directory,end],{type:'application/zip'});
}
export function download(blob,name) {const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download=name;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),30000);}
export async function publicPackage(snapshot) {
  const paths=['index.html','styles.css','js/app.js','js/core.js','js/icons.js','js/storage.js','js/export.js','assets/favicon.svg'];
  const contents=await Promise.all(paths.map(async path=>{const response=await fetch(new URL('../'+path,import.meta.url));if(!response.ok) throw new Error('Não foi possível preparar o pacote. Tente novamente com conexão.');return response.text();}));
  const files=Object.fromEntries(paths.map((p,i)=>[p,contents[i]]));
  files['index.html']=files['index.html'].replace('data-public="false"','data-public="true"').replace('<title>Link Explorer — Seu universo de links</title>','<title>Link Explorer — Coleção pública</title>');
  files['collection.json']=JSON.stringify(snapshot,null,2);
  files['LEIA-ME.txt']='LINK EXPLORER — COLEÇÃO PÚBLICA\n\nEste pacote contém somente os itens selecionados na exportação.\nExtraia os arquivos e publique a pasta que contém index.html no GitHub Pages ou na Vercel (sem comando de build).\nA coleção abre em modo de leitura, sem depender dos dados locais do editor.\nPara atualizar: faça uma nova exportação no explorador pessoal e substitua os arquivos publicados.\nPara testar localmente, use um servidor HTTP (exemplo: python -m http.server 8000) e abra http://localhost:8000. Abrir index.html com duplo clique não é suportado.\nImagens enviadas estão incluídas em collection.json. Favicons dependem do site de origem.\nNão há contas, sincronização nem publicação automática neste pacote.\n';
  return zipFiles(files);
}
