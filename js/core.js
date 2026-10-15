import { itemIcons } from './icons.js';
export const APP_VERSION = 1;
export const COLORS = ['#a78bfa','#7c9bff','#f08bc0','#5dc9b5','#f5b76b','#c496ef','#89c77a','#ef8b83'];
export const VIEWS = ['icons','cards','list'];
export const MAX_BACKUP_BYTES = 20 * 1024 * 1024;
export const clone = x => structuredClone(x);
export const uid = () => crypto.randomUUID();
export const children = (s, parentId = null) => s.items.filter(i => i.parentId === parentId).sort((a,b) => a.order-b.order || a.name.localeCompare(b.name,'pt-BR'));
export function descendants(s, id) {
  const found = new Set(); const queue = [id];
  const map = new Map();
  for(const i of s.items) { if(!map.has(i.parentId)) map.set(i.parentId,[]); map.get(i.parentId).push(i.id); }
  while(queue.length) {const current=queue.pop(); if(found.has(current)) continue; found.add(current); queue.push(...(map.get(current)||[]));}
  return found;
}
export function ancestry(s, id) {
  const chain=[]; const seen=new Set(); const map=new Map(s.items.map(i=>[i.id,i]));
  while(id && map.has(id) && !seen.has(id)){seen.add(id); const i=map.get(id); chain.unshift(i); id=i.parentId;}
  return chain;
}
export function normalizeUrl(value) {
  let raw=String(value||'').trim();
  if(!/^[a-z][a-z\d+.-]*:/i.test(raw)) raw='https://'+raw;
  let u; try{u=new URL(raw);}catch{throw new Error('Informe um endereço válido, como https://exemplo.com.');}
  if(!['https:','http:'].includes(u.protocol) || !u.hostname || u.username || u.password || raw.length>2048) throw new Error('Use um link HTTP ou HTTPS válido, sem credenciais no endereço.');
  return u.href;
}
const text = (v,max,fallback='') => typeof v==='string' ? v.trim().slice(0,max) : fallback;
function validImage(v) {
  if(!v) return '';
  if(typeof v!=='string' || v.length>900000 || !/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(v)) throw new Error('O backup contém uma imagem inválida ou muito grande.');
  return v;
}
export function validateState(raw) {
  if(!raw || raw.app!=='link-explorer' || raw.version!==APP_VERSION || !Array.isArray(raw.items)) throw new Error('Este arquivo não é um backup compatível do Link Explorer.');
  if(raw.items.length>10000 || JSON.stringify(raw).length>MAX_BACKUP_BYTES) throw new Error('O backup excede o limite de 10 mil itens ou 20 MB.');
  const ids=new Set();
  const items=raw.items.map((i,n)=>{
    if(!i || !/^[a-zA-Z0-9_-]{1,100}$/.test(i.id) || ['home','favorites','recent','__proto__','constructor','prototype'].includes(i.id) || ids.has(i.id)) throw new Error('O backup contém identificadores inválidos ou repetidos.');
    ids.add(i.id);
    if(!['folder','link'].includes(i.type) || typeof i.name!=='string' || !i.name.trim() || i.name.length>80) throw new Error('Há um item sem nome válido no backup.');
    if(i.parentId!==null && (typeof i.parentId!=='string' || !/^[a-zA-Z0-9_-]{1,100}$/.test(i.parentId))) throw new Error('Uma pasta de origem é inválida.');
    return {id:i.id,parentId:i.parentId,type:i.type,name:i.name.trim(),description:text(i.description,800),url:i.type==='link'?normalizeUrl(i.url):'',icon:itemIcons.includes(i.icon)?i.icon:(i.type==='folder'?'folder':'globe'),color:/^#[\da-f]{6}$/i.test(i.color)?i.color:COLORS[0],image:validImage(i.image),favicon:i.favicon===true,favorite:i.favorite===true,order:Number.isFinite(i.order)?i.order:n,createdAt:text(i.createdAt,40),updatedAt:text(i.updatedAt,40),lastOpened:text(i.lastOpened,40)};
  });
  const byId=new Map(items.map(i=>[i.id,i]));
  for(const item of items) {
    let p=item.parentId; const seen=new Set([item.id]); let depth=0;
    while(p!==null){if(seen.has(p)) throw new Error('O backup contém pastas em ciclo.'); seen.add(p); const parent=byId.get(p); if(!parent || parent.type!=='folder') throw new Error('O backup contém uma pasta de origem inexistente.'); p=parent.parentId; if(++depth>128) throw new Error('A estrutura excede 128 níveis de pastas.');}
  }
  const opts=raw.settings||{}; const views={};
  for(const [key,value] of Object.entries(opts.views||{})) if((key==='home'||byId.get(key)?.type==='folder') && VIEWS.includes(value)) views[key]=value;
  return {app:'link-explorer',version:APP_VERSION,revision:Number.isSafeInteger(raw.revision)&&raw.revision>=0?raw.revision:0,updatedAt:text(raw.updatedAt,40),items,settings:{name:text(opts.name,40,'Link Explorer')||'Link Explorer',subtitle:text(opts.subtitle,120,'Seu universo de links, organizado.'),theme:opts.theme==='light'?'light':'dark',accent:/^#[\da-f]{6}$/i.test(opts.accent)?opts.accent:COLORS[0],views}};
}
export function moveItem(s,id,target) {
  const item=s.items.find(i=>i.id===id); if(!item) throw new Error('Este item não existe mais.');
  if(target!==null && !s.items.some(i=>i.id===target && i.type==='folder')) throw new Error('Escolha uma pasta válida.');
  if(descendants(s,id).has(target)) throw new Error('Uma pasta não pode ser movida para dentro dela mesma.');
  item.parentId=target; item.order=Math.max(-1,...children(s,target).filter(i=>i.id!==id).map(i=>i.order))+1;
  item.updatedAt=new Date().toISOString();
  return validateState(s);
}
export function publicSnapshot(s, selectedIds, title, subtitle) {
  const selected=new Set(selectedIds.filter(id=>s.items.some(i=>i.id===id)));
  if(!selected.size) throw new Error('Selecione pelo menos uma pasta ou um link.');
  const include=new Set(); for(const id of selected) for(const child of descendants(s,id)) include.add(child);
  const items=s.items.filter(i=>include.has(i.id)).map(i=>({...clone(i),parentId:include.has(i.parentId)?i.parentId:null,lastOpened:''}));
  const views={}; for(const [k,v] of Object.entries(s.settings.views)) if(k==='home'||include.has(k)) views[k]=v;
  return validateState({app:'link-explorer',version:1,revision:0,updatedAt:new Date().toISOString(),items,settings:{...s.settings,name:title,subtitle,views}});
}
export function makeSeed() {
  const now=new Date().toISOString(); let n=0;
  const folder=(id,name,icon,color,parentId=null)=>({id,name,icon,color,parentId,type:'folder'});
  const link=(id,name,url,icon,color,parentId,description,favorite=false)=>({id,name,url,icon,color,parentId,description,favorite,type:'link'});
  const items=[
    folder('cursos','Cursos','graduation',COLORS[0]),folder('redes','Redes sociais','globe',COLORS[2]),folder('trabalho','Trabalho','work',COLORS[1]),folder('pessoal','Pessoal','heart',COLORS[3]),
    folder('programacao','Programação','code',COLORS[0],'cursos'),folder('desenvolvimento','Desenvolvimento pessoal','sparkles',COLORS[4],'cursos'),
    link('mdn','MDN Web Docs','https://developer.mozilla.org/pt-BR/','code',COLORS[0],'programacao','Sua referência para criar na web.',true),
    link('freecodecamp','freeCodeCamp','https://www.freecodecamp.org/','graduation',COLORS[3],'programacao','Aprenda programação no seu ritmo.'),
    link('curso-video','Curso em Vídeo','https://www.cursoemvideo.com/','video',COLORS[1],'programacao','Um novo conhecimento a cada aula.'),
    link('ted','TED Talks','https://www.ted.com/','bolt',COLORS[4],'desenvolvimento','Ideias que merecem ser compartilhadas.'),
    link('instagram','Instagram','https://www.instagram.com/','instagram',COLORS[2],'redes','Conexões e inspiração.'),
    link('youtube','YouTube','https://www.youtube.com/','youtube',COLORS[7],'redes','Sua próxima descoberta em vídeo.'),
    link('discord','Discord','https://discord.com/','discord',COLORS[1],'redes','Encontre a sua comunidade.'),
    link('github','GitHub','https://github.com/','github',COLORS[0],'trabalho','Onde suas ideias viram projetos.',true),
    link('figma','Figma','https://www.figma.com/','figma',COLORS[2],'trabalho','Um espaço para dar forma às ideias.',true),
    link('notion','Notion','https://www.notion.so/','notion',COLORS[4],'trabalho','Projetos, notas e possibilidades.'),
    link('spotify','Spotify','https://open.spotify.com/','music',COLORS[3],'pessoal','A trilha sonora do seu dia.'),
    link('unsplash','Unsplash','https://unsplash.com/','camera',COLORS[6],'pessoal','Um mundo de referências visuais.'),
  ].map(i=>({description:'',url:'',image:'',favorite:false,favicon:false,createdAt:now,updatedAt:now,lastOpened:'',...i,order:n++}));
  return validateState({app:'link-explorer',version:1,revision:0,updatedAt:now,settings:{name:'Link Explorer',subtitle:'Seu universo de links, organizado.',theme:'dark',accent:COLORS[0],views:{home:'icons'}},items});
}
