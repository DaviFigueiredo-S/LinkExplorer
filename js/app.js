import { icon, itemIcons } from './icons.js';
import { COLORS, MAX_BACKUP_BYTES, clone, uid, children, descendants, ancestry, normalizeUrl, validateState, moveItem, publicSnapshot, makeSeed } from './core.js';
import { readWorkspace, writeWorkspace } from './storage.js';
import { download, publicPackage } from './export.js';

const $ = id => document.getElementById(id);
const el = (tag, cls, value) => {const node=document.createElement(tag);if(cls)node.className=cls;if(value!==undefined)node.textContent=value;return node;};
const ic = name => {const span=el('span');span.innerHTML=icon(name);return span;};
const button = (label,action,iconName,cls='button secondary',attrs={}) => {
  const node=el('button',cls);node.type='button';node.dataset.action=action;
  if(iconName)node.append(ic(iconName));if(label)node.append(el('span','',label));
  for(const [k,v] of Object.entries(attrs)) node.setAttribute(k,v);
  return node;
};
const publicMode=document.documentElement.dataset.public==='true';
let data, active='home', sortMode='manual', storageAvailable=true, storageStatus='saved', initialized=false;
let routeIndex=0, routeMax=0, draft, editingId=null, editorParent=null, selectedIcon='globe', selectedColor=COLORS[0], selectedImage='', settingsAccent=COLORS[0], movingId=null;
let previewCache=null, menuAnchor=null, toastTimer, mutationQueue=Promise.resolve(), importing=null;
const channel=!publicMode && typeof BroadcastChannel!=='undefined' ? new BroadcastChannel('link-explorer-changes') : null;
const readonly=()=>publicMode || !!previewCache;
const currentParent=()=>data.items.some(i=>i.id===active && i.type==='folder')?active:null;
const error=(id,message)=>{const node=$(id);node.textContent=message||'';node.hidden=!message;};
const folderPath=id=>['Início',...ancestry(data,id).map(i=>i.name)].join(' / ');
const routeHash=route=>route==='home'?'#home':route==='favorites'?'#favorites':route==='recent'?'#recent':'#folder='+encodeURIComponent(route);
function readRoute() {
  const hash=location.hash;
  if(hash==='#favorites')return 'favorites';
  if(hash==='#recent')return 'recent';
  if(hash.startsWith('#folder=')){let id;try{id=decodeURIComponent(hash.slice(8));}catch{return 'home';}if(data.items.some(i=>i.id===id&&i.type==='folder'))return id;}
  return 'home';
}
function navigate(route,replace=false) {
  closeMenu();closeSidebar();$('search').value='';
  if(route===active && !replace){render();return;}
  if(replace)history.replaceState({leIndex:routeIndex},'',routeHash(route));
  else{routeIndex++;routeMax=routeIndex;history.pushState({leIndex:routeIndex},'',routeHash(route));}
  active=route;render();$('main-content').focus({preventScroll:true});window.scrollTo({top:0,behavior:'instant'});
}
window.addEventListener('popstate',()=>{if(!initialized)return;routeIndex=Number.isInteger(history.state?.leIndex)?history.state.leIndex:0;active=readRoute();$('search').value='';closeMenu();closeSidebar();render();});
window.addEventListener('hashchange',()=>{if(!initialized)return;active=readRoute();render();});
function setStatus() {
  const node=$('save-status');node.classList.toggle('unsaved',!storageAvailable||storageStatus==='error');
  const value=readonly()?(previewCache?'Prévia pública':'Coleção pública'):storageStatus==='saving'?'Salvando...':storageStatus==='error'?'Falha ao salvar':storageAvailable?'Salvo neste navegador':'Só nesta sessão';
  node.lastElementChild.textContent=value;
}
function toast(message,action) {
  clearTimeout(toastTimer);$('toast-text').textContent=message;$('toast').hidden=false;$('toast-action').hidden=!action;
  $('toast-action').onclick=action?async()=>{const fn=action;$('toast').hidden=true;try{await fn();}catch(e){toast(e.message);}}:null;
  toastTimer=setTimeout(()=>{$('toast').hidden=true;},action?11000:5500);
}
window.addEventListener('pagehide',()=>{clearTimeout(toastTimer);});
async function mutate(fn,message='',undoable=false,forceStore=false) {
  if(readonly()) throw new Error('Esta coleção está em modo de leitura.');
  const task=mutationQueue.then(async()=>{
    const before=clone(data);let next=clone(data);const result=fn(next);if(result)next=result;
    next=validateState(next);next.revision=before.revision+1;next.updatedAt=new Date().toISOString();
    storageStatus='saving';setStatus();
    try {
      if(storageAvailable||forceStore){await writeWorkspace(next,forceStore?undefined:before.revision);storageAvailable=true;$('storage-warning').hidden=true;}
      data=next;storageStatus='saved';
      if(currentParent()===null && !['home','favorites','recent'].includes(active)){active='home';history.replaceState({leIndex:routeIndex},'','#home');}
      render();channel?.postMessage({revision:next.revision});
      if(message)toast(message+(storageAvailable?'':' · apenas nesta sessão'),undoable?()=>mutate(()=>({...before,revision:data.revision}),'Alteração desfeita.'):null);
      return true;
    }catch(e){storageStatus='error';setStatus();throw e;}
  });
  mutationQueue=task.catch(()=>{});return task;
}
function createNav(label,route,iconName,color,count) {
  const node=button('', 'navigate',iconName,'nav-button'+(active===route?' active':''),{'data-route':route});
  const name=el('span','nav-name',label);node.append(name);
  if(color)node.firstElementChild.style.color=color;
  if(count!==undefined)node.append(el('span','nav-count',String(count)));
  if(active===route)node.setAttribute('aria-current','page');
  return node;
}
function visibleItems() {
  const query=$('search').value.trim().toLocaleLowerCase('pt-BR');
  let items=query?data.items.filter(i=>(i.name+' '+i.description+' '+i.url).toLocaleLowerCase('pt-BR').includes(query)):active==='favorites'?data.items.filter(i=>i.favorite):active==='recent'?data.items.filter(i=>i.lastOpened).sort((a,b)=>b.lastOpened.localeCompare(a.lastOpened)):children(data,currentParent());
  if(sortMode==='name')items.sort((a,b)=>a.name.localeCompare(b.name,'pt-BR'));
  if(sortMode==='recent')items.sort((a,b)=>b.createdAt.localeCompare(a.createdAt));
  return items;
}
function itemVisual(item) {
  if(item.type==='folder') {const visual=el('div','folder-illustration');visual.append(ic(item.icon));return visual;}
  const visual=el('div','link-visual');
  if(item.image || (item.favicon && item.url)){
    const img=el('img',item.image?'':'favicon-image');img.alt='';img.loading='lazy';img.referrerPolicy='no-referrer';
    img.src=item.image||(new URL(item.url).origin+'/favicon.ico');
    img.addEventListener('error',()=>{img.remove();visual.append(ic(item.icon));},{once:true});visual.append(img);
  }else visual.append(ic(item.icon));
  return visual;
}
function itemCard(item,preview=false) {
  const article=el('article','item '+(item.type==='folder'?'folder-item':'link-item'));article.dataset.id=item.id;article.style.setProperty('--item-color',item.color);
  let open;
  if(item.type==='folder'){open=button('','open',null,'item-open',{'data-id':item.id});}
  else{open=el('a','item-open');open.href=item.url;open.target='_blank';open.rel='noopener noreferrer';open.referrerPolicy='no-referrer';open.dataset.track=item.id;}
  open.append(itemVisual(item),el('span','item-title',item.name));
  const count=item.type==='folder'?children(data,item.id).length:0;
  const query=$('search').value.trim();
  const description=query?folderPath(item.parentId):item.description||(item.type==='folder'?'Explore esta pasta':'Uma nova descoberta.');
  open.append(el('span','item-subtitle',description));
  const bottom=el('span','item-bottom');const meta=el('span','item-meta');
  if(item.type==='folder')meta.textContent=count+' '+(count===1?'item':'itens');
  else{meta.append(ic('globe'));let hostname='';try{hostname=new URL(item.url).hostname.replace(/^www\./,'');}catch{}meta.append(el('span','domain',hostname));}
  bottom.append(meta,ic(item.type==='folder'?'right':'arrow'));bottom.lastElementChild.className='open-arrow';open.append(bottom);
  article.append(open);
  if(!preview){
    const more=button('','item-menu','more','icon-button item-more',{'data-id':item.id,'aria-label':'Ações de '+item.name,'aria-haspopup':'menu'});article.append(more);
    if(item.favorite){const star=ic('star');star.className='favorite-marker';star.title='Favorito';article.append(star);}
  }
  return article;
}
function render() {
  if(!data)return;
  document.documentElement.dataset.theme=data.settings.theme;document.documentElement.style.setProperty('--accent',data.settings.accent);document.body.dataset.readonly=String(readonly());
  const ink=data.settings.theme==='light'?'#'+data.settings.accent.slice(1).match(/../g).map(h=>Math.round(parseInt(h,16)*.6).toString(16).padStart(2,'0')).join(''):data.settings.accent;
  document.documentElement.style.setProperty('--accent-ink',ink);
  document.title=data.settings.name+' — '+(readonly()?'Coleção pública':'Link Explorer');
  $('brand-name').textContent=data.settings.name;
  $('primary-nav').replaceChildren(createNav('Visão geral','home','home'),createNav('Favoritos','favorites','star',null,data.items.filter(i=>i.favorite).length));
  $('folder-nav').replaceChildren(...children(data).filter(i=>i.type==='folder').map(i=>createNav(i.name,i.id,i.icon,i.color,children(data,i.id).length)));
  $('back-button').disabled=routeIndex<=0;$('forward-button').disabled=routeIndex>=routeMax;
  const breadcrumbs=$('breadcrumbs');breadcrumbs.replaceChildren();
  const routeParts=[{id:'home',name:'Início',icon:'home'},...(active==='favorites'?[{id:'favorites',name:'Favoritos'}]:active==='recent'?[{id:'recent',name:'Recentes'}]:ancestry(data,currentParent()))];
  routeParts.forEach((part,n)=>{const wrap=el('span');if(n)wrap.append(ic('right'));if(n)wrap.firstElementChild.className='separator';const b=button(part.name,'navigate',n===0?'home':null,'',{'data-route':part.id});wrap.append(b);if(n===routeParts.length-1)b.setAttribute('aria-current','page');if(n>0&&n<routeParts.length-2){wrap.hidden=window.innerWidth<1000;}breadcrumbs.append(wrap);});
  const query=$('search').value.trim();const parent=data.items.find(i=>i.id===active);const isHome=active==='home'&&!query;
  const title=query?'Resultados da busca':active==='favorites'?'Suas melhores descobertas.':active==='recent'?'Seus últimos cliques.':parent?.name||(readonly()?data.settings.name:'Tudo no seu lugar');
  $('page-title').replaceChildren(document.createTextNode(title));if(isHome&&!readonly())$('page-title').append(el('span','','.'));
  $('page-eyebrow').textContent=query?'ENCONTRE O QUE IMPORTA':readonly()?'UMA COLEÇÃO DE DESCOBERTAS':parent?'SEU UNIVERSO, ORGANIZADO':'SEU ESPAÇO DIGITAL';
  $('page-subtitle').textContent=query?'Buscando por “'+query+'” em todas as pastas.':parent?(parent.description||'Cada descoberta tem seu lugar.'):active==='favorites'?'O que você mais gosta, a um clique de distância.':active==='recent'?'Continue de onde parou.':data.settings.subtitle;
  const list=visibleItems();
  const folders=list.filter(i=>i.type==='folder').length;
  $('section-title').textContent=query?'Itens encontrados':active==='favorites'?'Seus favoritos':active==='recent'?'Acessados recentemente':isHome&&folders===list.length?'Suas pastas':'Nesta pasta';
  if(isHome&&readonly())$('section-title').textContent='Explore a coleção';
  $('section-count').textContent=String(list.length);
  let view=data.settings.views[active]||'icons';if(query)view='list';
  $('items').className='items view-'+view;$('items').replaceChildren(...list.map(i=>itemCard(i)));
  $('list-head').hidden=view!=='list'||!list.length;
  document.querySelectorAll('[data-action=view]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.view===view)));
  $('empty-state').hidden=list.length>0;
  $('empty-title').textContent=query?'Nenhuma descoberta por aqui.':active==='favorites'?'Suas melhores descobertas começam aqui.':active==='recent'?'Sua jornada está só começando.':'Uma pasta, muitas possibilidades.';
  $('empty-description').textContent=query?'Tente outro nome, endereço ou palavra da descrição.':active==='favorites'?'Abra o menu de um item e escolha adicionar aos favoritos.':active==='recent'?'Os links que você abrir aparecerão aqui.':readonly()?'Esta pasta ainda não tem itens.':'Adicione o primeiro link ou crie uma subpasta.';
  $('empty-state').querySelector('.editor-only').hidden=['favorites','recent'].includes(active)||!!query;
  const pinned=data.items.filter(i=>i.favorite).slice(0,3);$('pinned-wrap').hidden=!isHome||!pinned.length;
  $('pinned-items').replaceChildren(...pinned.map(i=>itemCard(i)));
  const totalFolders=data.items.filter(i=>i.type==='folder').length;const totalLinks=data.items.length-totalFolders;
  $('item-summary').textContent=totalFolders+' '+(totalFolders===1?'pasta':'pastas')+' · '+totalLinks+' '+(totalLinks===1?'link':'links')+' no seu universo';
  $('mode-banner').hidden=!readonly();$('mode-text').textContent=previewCache?'Prévia pública · somente os itens selecionados.':'Coleção pública · explore as pastas e abra seus links.';
  $('return-editor').hidden=!previewCache;
  $('settings-label').textContent=readonly()?'Aparência':'Configurações';
  $('sidebar-mode').textContent=readonly()?'Coleção pública':'Espaço pessoal';
  $('local-note').hidden=readonly();
  setStatus();
}
function openDialog(id) {closeMenu();const dialog=$(id);if(!dialog.open)dialog.showModal();document.body.style.overflow='hidden';}
function closeDialog(dialog) {if(!dialog)return;dialog.close();if(!document.querySelector('dialog[open]'))document.body.style.overflow='';}
document.querySelectorAll('dialog').forEach(dialog=>{
  dialog.addEventListener('close',()=>{if(!document.querySelector('dialog[open]'))document.body.style.overflow='';});
  dialog.addEventListener('click',e=>{if(e.target===dialog){const r=dialog.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)closeDialog(dialog);}});
});
function renderPickers() {
  $('icon-picker').replaceChildren(...itemIcons.map(name=>{
    const b=button('','choose-icon',name,'icon-choice'+(selectedIcon===name?' selected':''),{'data-icon-name':name,'aria-label':'Ícone '+name,'aria-pressed':String(selectedIcon===name)});return b;
  }));
  renderColors('color-picker',selectedColor,'choose-color');
  $('remove-image').hidden=!selectedImage;
}
function renderColors(id,selected,action) {
  $(id).replaceChildren(...COLORS.map((color,n)=>{const b=button('',action,color===selected?'check':null,'color-choice'+(color===selected?' selected':''),{'data-color':color,'aria-label':'Cor '+(n+1),'aria-pressed':String(color===selected)});b.style.setProperty('--swatch',color);return b;}));
}
function refreshEditor() {
  if(!draft)return;
  draft.name=$('item-name').value|| (draft.type==='folder'?'Sua nova pasta':'Seu próximo link');
  draft.url=$('item-url').value;
  draft.description=$('item-description').value;draft.icon=selectedIcon;draft.color=selectedColor;draft.image=selectedImage;draft.favicon=$('item-favicon').checked;
  $('url-field').hidden=draft.type==='folder';$('item-url').required=draft.type==='link';
  $('favicon-field').hidden=draft.type==='folder';
  $('tab-link').classList.toggle('selected',draft.type==='link');$('tab-folder').classList.toggle('selected',draft.type==='folder');
  $('tab-link').setAttribute('aria-pressed',String(draft.type==='link'));$('tab-folder').setAttribute('aria-pressed',String(draft.type==='folder'));
  let previewUrl='https://seulink.com';try{previewUrl=normalizeUrl(draft.url);}catch{}
  const wrap=el('div','items view-cards');wrap.append(itemCard({...draft,id:'preview-item',url:previewUrl},true));$('item-preview').replaceChildren(wrap);
}
function openEditor(type='link',id=null,root=false) {
  if(readonly())return;
  const item=data.items.find(i=>i.id===id);
  editingId=item?.id||null;editorParent=item?item.parentId:root?null:currentParent();
  $('editor-form').reset();error('editor-error','');
  draft=item?clone(item):{id:'',type,name:'',url:'',description:'',icon:type==='folder'?'folder':'globe',color:COLORS[0],image:'',favorite:false,favicon:false,parentId:editorParent};
  selectedIcon=draft.icon;selectedColor=draft.color;selectedImage=draft.image;
  $('item-name').value=item?.name||'';$('item-url').value=item?.url||'';$('item-description').value=item?.description||'';$('item-favicon').checked=item?.favicon||false;
  $('editor-title').textContent=editingId?'Cada detalhe conta.':'Uma nova descoberta';
  $('editor-location').textContent=folderPath(editorParent);
  $('tab-link').disabled=!!editingId;$('tab-folder').disabled=!!editingId;
  renderPickers();refreshEditor();openDialog('editor-dialog');$('item-name').focus();
}
async function saveEditor(e) {
  e.preventDefault();if(readonly())return;
  error('editor-error','');$('save-item').disabled=true;
  try{
    const name=$('item-name').value.trim();if(!name)throw new Error('Dê um nome para este item.');
    const url=draft.type==='link'?normalizeUrl($('item-url').value):'';
    if(editorParent && !data.items.some(i=>i.id===editorParent))throw new Error('A pasta de destino foi removida. Feche e tente novamente.');
    const fields={name,url,description:$('item-description').value.trim(),icon:selectedIcon,color:selectedColor,image:selectedImage,favicon:draft.type==='link'&&$('item-favicon').checked,updatedAt:new Date().toISOString()};
    const savedId=editingId||uid();
    await mutate(next=>{const existing=next.items.find(i=>i.id===editingId);if(editingId&&!existing)throw new Error('O item foi removido em outra aba.');if(existing)Object.assign(existing,fields);else next.items.push({...fields,id:savedId,type:draft.type,parentId:editorParent,favorite:false,lastOpened:'',createdAt:new Date().toISOString(),order:Math.max(-1,...children(next,editorParent).map(i=>i.order))+1});},editingId?'Item atualizado.':'Mais uma descoberta no seu universo.');
    closeDialog($('editor-dialog'));
  }catch(e){error('editor-error',e.message);}finally{$('save-item').disabled=false;}
}
$('editor-form').addEventListener('submit',saveEditor);
$('editor-form').addEventListener('input',()=>{refreshEditor();error('editor-error','');});
$('item-image').addEventListener('change',async e=>{
  const file=e.target.files[0];if(!file)return;
  $('save-item').disabled=true;error('editor-error','');
  try {
    if(!['image/png','image/jpeg','image/webp'].includes(file.type)||file.size>5*1024*1024)throw new Error('Escolha uma imagem JPG, PNG ou WebP de até 5 MB.');
    const bitmap=await createImageBitmap(file);
    if(bitmap.width*bitmap.height>40000000){bitmap.close();throw new Error('Esta imagem é muito grande. Reduza a resolução e tente novamente.');}
    const ratio=Math.min(1,960/Math.max(bitmap.width,bitmap.height));const canvas=document.createElement('canvas');canvas.width=Math.max(1,Math.round(bitmap.width*ratio));canvas.height=Math.max(1,Math.round(bitmap.height*ratio));
    canvas.getContext('2d').drawImage(bitmap,0,0,canvas.width,canvas.height);bitmap.close();const optimized=canvas.toDataURL('image/webp',.82);
    if(optimized.length>900000)throw new Error('Não foi possível reduzir esta imagem. Escolha um arquivo menor.');
    selectedImage=optimized;
    $('item-favicon').checked=false;renderPickers();refreshEditor();
  }catch(e){error('editor-error',e.message||'Não foi possível abrir esta imagem.');}finally{$('save-item').disabled=false;e.target.value='';}
});
function openSettings() {
  error('settings-error','');$('explorer-name').value=data.settings.name;$('explorer-subtitle').value=data.settings.subtitle;
  $('identity-settings').hidden=readonly();$('explorer-name').required=!readonly();
  $('settings-form').elements.theme.value=data.settings.theme;settingsAccent=data.settings.accent;renderColors('settings-colors',settingsAccent,'settings-color');
  $('settings-note').textContent=readonly()?'A aparência muda somente durante esta visita. A coleção publicada continua igual.':'A personalização fica salva neste navegador, junto dos seus links.';
  openDialog('settings-dialog');
}
$('settings-form').addEventListener('submit',async e=>{
  e.preventDefault();const settings={name:$('explorer-name').value.trim(),subtitle:$('explorer-subtitle').value.trim(),theme:$('settings-form').elements.theme.value,accent:settingsAccent};
  try{if(readonly()){data.settings.theme=settings.theme;data.settings.accent=settings.accent;render();}else await mutate(next=>{Object.assign(next.settings,settings);},'Seu espaço, do seu jeito.');closeDialog($('settings-dialog'));}catch(e){error('settings-error',e.message);}
});
function openBackup() {
  error('backup-error','');const bytes=new TextEncoder().encode(JSON.stringify(data)).length;
  $('backup-stat').textContent=data.items.length+' itens · '+(bytes/1024).toFixed(1)+' KB · formato de backup v1';
  openDialog('backup-dialog');
}
$('import-file').addEventListener('change',async e=>{
  const file=e.target.files[0];if(!file)return;error('backup-error','');
  try{
    if(file.size>MAX_BACKUP_BYTES)throw new Error('O arquivo ultrapassa o limite de 20 MB.');
    importing=validateState(JSON.parse(await file.text()));
    const count=importing.items.length;
    confirmAction('Restaurar este backup?',count+' itens foram validados. A coleção atual deste navegador será substituída.\nExporte um backup antes de continuar se quiser preservar a versão atual.','Restaurar backup',async()=>{
      const backup=importing;await mutate(()=>({...backup,revision:data.revision}),'Backup restaurado.',true,true);importing=null;active='home';history.replaceState({leIndex:routeIndex},'','#home');closeDialog($('backup-dialog'));render();
    });
  }catch(err){error('backup-error',err instanceof SyntaxError?'Este arquivo não contém um JSON válido.':err.message);}finally{e.target.value='';}
});
function confirmAction(title,message,label,action) {
  $('confirm-title').textContent=title;$('confirm-message').textContent=message;$('confirm-action').textContent=label;error('confirm-error','');
  $('confirm-action').onclick=async()=>{const b=$('confirm-action');b.disabled=true;try{await action();closeDialog($('confirm-dialog'));}catch(e){error('confirm-error',e.message);}finally{b.disabled=false;}};
  openDialog('confirm-dialog');
}
function deleteItem(id) {
  const item=data.items.find(i=>i.id===id);if(!item)return;
  const ids=descendants(data,id);const folderCount=data.items.filter(i=>ids.has(i.id)&&i.type==='folder').length;const linkCount=ids.size-folderCount;
  confirmAction('Excluir “'+item.name+'”?','Esta ação remove '+folderCount+' '+(folderCount===1?'pasta':'pastas')+' e '+linkCount+' '+(linkCount===1?'link':'links')+'. Você poderá desfazer logo após a exclusão.','Excluir',()=>mutate(next=>{next.items=next.items.filter(i=>!ids.has(i.id));for(const id of ids)delete next.settings.views[id];},'Item excluído.',true));
}
function openMove(id) {
  const item=data.items.find(i=>i.id===id);if(!item)return;movingId=id;error('move-error','');$('move-name').textContent='Escolha um novo lugar para “'+item.name+'”.';
  const excluded=descendants(data,id);const targets=[{id:null,name:'Início'},...data.items.filter(i=>i.type==='folder'&&!excluded.has(i.id)).sort((a,b)=>folderPath(a.id).localeCompare(folderPath(b.id),'pt-BR'))];
  $('move-target').replaceChildren(...targets.map(i=>{const option=el('option','',i.id?folderPath(i.id):'Início');option.value=i.id||'';option.disabled=i.id===item.parentId;return option;}));
  const first=[...$('move-target').options].find(i=>!i.disabled);$('move-target').value=first?.value||'';
  $('move-form').querySelector('[type=submit]').disabled=!first;openDialog('move-dialog');
}
$('move-form').addEventListener('submit',async e=>{e.preventDefault();try{await mutate(next=>moveItem(next,movingId,$('move-target').value||null),'Item movido.',true);closeDialog($('move-dialog'));}catch(e){error('move-error',e.message);}});
function openPublish() {
  error('publish-error','');$('public-title').value=data.settings.name;$('public-subtitle').value=data.settings.subtitle;
  const ordered=[];function walk(parent,depth){for(const i of children(data,parent)){ordered.push({item:i,depth});if(i.type==='folder')walk(i.id,depth+1);}}walk(null,0);
  $('publish-items').replaceChildren(...ordered.map(({item,depth})=>{const label=el('label','publish-row');label.style.paddingLeft=(10+Math.min(depth,6)*13)+'px';const checkbox=el('input');checkbox.type='checkbox';checkbox.value=item.id;checkbox.checked=currentParent()?item.id===currentParent():item.parentId===null;checkbox.name='publish-item';const ico=ic(item.icon);ico.style.color=item.color;label.append(checkbox,ico,el('span','',item.name),el('small','',item.type==='folder'?'Pasta':'Link'));return label;}));
  syncPublishChoices();
  openDialog('publish-dialog');
}
function syncPublishChoices(changed) {
  const inputs=[...$('publish-items').querySelectorAll('input')];
  const byId=new Map(inputs.map(i=>[i.value,i]));
  if(changed){const related=descendants(data,changed.value);for(const input of inputs)if(input!==changed&&related.has(input.value))input.checked=changed.checked;}
  for(const input of inputs){
    const item=data.items.find(i=>i.id===input.value);
    const included=ancestry(data,item.parentId).some(parent=>byId.get(parent.id)?.checked);
    input.disabled=included;if(included)input.checked=true;
    input.closest('label').lastElementChild.textContent=included?'Incluído na pasta':item.type==='folder'?'Pasta':'Link';
  }
  document.querySelector('[data-action=select-all]').textContent=inputs.length&&inputs.every(i=>i.checked)?'Desmarcar tudo':'Selecionar tudo';
}
$('publish-items').addEventListener('change',event=>{if(event.target.matches('input'))syncPublishChoices(event.target);});
function selectedSnapshot() {
  return publicSnapshot(data,[...$('publish-items').querySelectorAll('input:checked')].map(i=>i.value),$('public-title').value.trim()||data.settings.name,$('public-subtitle').value.trim());
}
$('publish-form').addEventListener('submit',async e=>{
  e.preventDefault();const b=$('export-public');b.disabled=true;error('publish-error','');
  try{const snapshot=selectedSnapshot();const zip=await publicPackage(snapshot);download(zip,'link-explorer-colecao-publica.zip');closeDialog($('publish-dialog'));toast('Site público baixado. Extraia e publique a pasta na sua hospedagem.');}catch(e){error('publish-error',e.message);}finally{b.disabled=false;}
});
function enterPreview() {
  try{const snapshot=selectedSnapshot();previewCache={data,active,hash:location.hash};data=snapshot;active='home';$('search').value='';closeDialog($('publish-dialog'));history.replaceState({leIndex:routeIndex},'','#home');render();window.scrollTo({top:0,behavior:'instant'});}catch(e){error('publish-error',e.message);}
}
function exitPreview() {
  if(!previewCache)return;const cache=previewCache;data=cache.data;active=cache.active;previewCache=null;history.replaceState({leIndex:routeIndex},'',cache.hash||'#home');$('search').value='';render();
}
function closeMenu(returnFocus=false) {$('context-menu').hidden=true;if(returnFocus&&menuAnchor?.isConnected)menuAnchor.focus();menuAnchor=null;}
function openMenu(id,anchor,x,y) {
  const item=data.items.find(i=>i.id===id);if(!item)return;const menu=$('context-menu');menu.replaceChildren();menuAnchor=anchor;
  const add=(label,action,ico,destructive=false,disabled=false)=>{const b=button(label,action,ico,destructive?'destructive':'',{'data-id':id,'role':'menuitem'});b.disabled=disabled;menu.append(b);};
  add(item.type==='folder'?'Abrir pasta':'Abrir link','open','arrow');
  if(item.type==='link')add('Copiar endereço','copy','link');
  if(!readonly()){
    add('Editar e personalizar','edit','edit');add(item.favorite?'Remover dos favoritos':'Adicionar aos favoritos','favorite','star');add('Mover para...','move','move');
    const siblings=children(data,item.parentId);const position=siblings.findIndex(i=>i.id===id);
    add('Mover para cima','reorder-up','up',false,sortMode!=='manual'||position===0);add('Mover para baixo','reorder-down','down',false,sortMode!=='manual'||position===siblings.length-1);add('Excluir','delete','trash',true);
  }
  menu.hidden=false;const r=anchor?.getBoundingClientRect();let left=x??r?.right??20,top=y??r?.bottom??20;
  menu.style.left=Math.max(8,Math.min(left,window.innerWidth-menu.offsetWidth-8))+'px';menu.style.top=Math.max(8,Math.min(top,window.innerHeight-menu.offsetHeight-8))+'px';menu.querySelector('button')?.focus();
}
async function reorder(id,direction) {
  if(sortMode!=='manual')return;
  await mutate(next=>{const item=next.items.find(i=>i.id===id);const siblings=children(next,item.parentId);const index=siblings.findIndex(i=>i.id===id);const other=index+direction;if(other<0||other>=siblings.length)return;[siblings[index],siblings[other]]=[siblings[other],siblings[index]];siblings.forEach((i,n)=>i.order=n);},'Ordem atualizada.');
}
function closeSidebar() {$('sidebar').classList.remove('open');$('sidebar-overlay').hidden=true;document.querySelector('[data-action=mobile-menu]').setAttribute('aria-expanded','false');document.querySelector('.workspace').inert=false;if(!document.querySelector('dialog[open]'))document.body.style.overflow='';}
function toggleSidebar() {const open=!$('sidebar').classList.contains('open');$('sidebar').classList.toggle('open',open);$('sidebar-overlay').hidden=!open;document.querySelector('[data-action=mobile-menu]').setAttribute('aria-expanded',String(open));document.querySelector('.workspace').inert=open;document.body.style.overflow=open?'hidden':'';if(open)$('sidebar').querySelector('a').focus();}
$('sidebar-overlay').addEventListener('click',closeSidebar);
const editorActions=new Set(['new','new-folder','new-link','edit','favorite','move','reorder-up','reorder-down','delete','backup','publish','export-backup']);
async function dispatch(action,target,event) {
  if(readonly()&&editorActions.has(action))return;
  const id=target?.dataset.id;
  switch(action) {
    case 'navigate':navigate(target.dataset.route);break;
    case 'favorites':navigate('favorites');break;
    case 'back':if(routeIndex>0)history.back();break;
    case 'forward':if(routeIndex<routeMax)history.forward();break;
    case 'open':{const item=data.items.find(i=>i.id===id);if(!item)break;if(item.type==='folder')navigate(id);else{window.open(item.url,'_blank','noopener,noreferrer');track(id);}break;}
    case 'new':case 'new-link':openEditor('link');break;
    case 'new-folder':openEditor('folder',null,true);break;
    case 'edit':openEditor('link',id);break;
    case 'editor-type':draft.type=target.dataset.type;selectedIcon=draft.type==='folder'?'folder':'globe';renderPickers();refreshEditor();break;
    case 'choose-icon':selectedIcon=target.dataset.iconName;renderPickers();refreshEditor();break;
    case 'choose-color':selectedColor=target.dataset.color;renderPickers();refreshEditor();break;
    case 'settings-color':settingsAccent=target.dataset.color;renderColors('settings-colors',settingsAccent,'settings-color');break;
    case 'remove-image':selectedImage='';renderPickers();refreshEditor();break;
    case 'close-dialog':closeDialog(target.closest('dialog'));break;
    case 'settings':openSettings();break;
    case 'backup':openBackup();break;
    case 'export-backup':download(new Blob([JSON.stringify(data,null,2)],{type:'application/json'}),'link-explorer-backup-'+new Date().toISOString().slice(0,10)+'.json');toast('Backup completo baixado. Guarde uma cópia fora do navegador.');break;
    case 'publish':openPublish();break;
    case 'select-all':{const inputs=[...$('publish-items').querySelectorAll('input')];const checked=!inputs.every(i=>i.checked);inputs.forEach(i=>i.checked=checked);syncPublishChoices();target.textContent=checked?'Desmarcar tudo':'Selecionar tudo';break;}
    case 'preview-public':enterPreview();break;
    case 'return-editor':exitPreview();break;
    case 'item-menu':openMenu(id,target);return;
    case 'favorite':await mutate(next=>{const i=next.items.find(i=>i.id===id);i.favorite=!i.favorite;},'Favoritos atualizados.');break;
    case 'move':openMove(id);break;
    case 'reorder-up':await reorder(id,-1);break;
    case 'reorder-down':await reorder(id,1);break;
    case 'delete':deleteItem(id);break;
    case 'copy':{const item=data.items.find(i=>i.id===id);try{await navigator.clipboard.writeText(item.url);toast('Endereço copiado.');}catch{toast('Abra o link e copie o endereço pela barra do navegador.');}break;}
    case 'view':{if($('search').value.trim()){toast('A pesquisa usa lista para mostrar a localização de cada resultado.');break;}if(readonly()){data.settings.views[active]=target.dataset.view;render();}else await mutate(next=>{next.settings.views[active]=target.dataset.view;});break;}
    case 'mobile-menu':toggleSidebar();break;
    case 'dismiss-toast':$('toast').hidden=true;break;
  }
}
document.addEventListener('click',async event=>{
  const target=event.target.closest('[data-action]');
  if(!event.target.closest('#context-menu')&&!event.target.closest('[data-action=item-menu]'))closeMenu();
  if(target){if(target.disabled)return;if(target.tagName==='A')event.preventDefault();try{await dispatch(target.dataset.action,target,event);}catch(e){toast(e.message);}if(target.closest('#context-menu'))closeMenu();}
  const link=event.target.closest('[data-track]');if(link)track(link.dataset.track);
});
document.addEventListener('contextmenu',event=>{const item=event.target.closest('.item');if(!item||item.closest('#item-preview'))return;event.preventDefault();openMenu(item.dataset.id,item.querySelector('.item-more'),event.clientX,event.clientY);});
document.addEventListener('keydown',event=>{
  if(event.key==='Escape'){closeMenu(true);if($('sidebar').classList.contains('open')){closeSidebar();document.querySelector('[data-action=mobile-menu]').focus();}}
  if(!$('context-menu').hidden&&['ArrowDown','ArrowUp','Home','End'].includes(event.key)){
    event.preventDefault();const buttons=[...$('context-menu').querySelectorAll('button:not(:disabled)')];let i=buttons.indexOf(document.activeElement);i=event.key==='Home'?0:event.key==='End'?buttons.length-1:(i+(event.key==='ArrowDown'?1:-1)+buttons.length)%buttons.length;buttons[i]?.focus();
  }
  if(event.key==='/'&&!event.ctrlKey&&!event.metaKey&&!document.querySelector('dialog[open]')&&!['INPUT','TEXTAREA','SELECT'].includes(document.activeElement.tagName)){event.preventDefault();$('search').focus();}
});
$('search').addEventListener('input',()=>{closeMenu();render();});
$('sort').addEventListener('change',e=>{sortMode=e.target.value;render();});
window.addEventListener('resize',()=>{closeMenu();if(window.innerWidth>760)closeSidebar();});
async function track(id) {
  const timestamp=new Date().toISOString();
  if(readonly()){const i=data.items.find(i=>i.id===id);if(i)i.lastOpened=timestamp;return;}
  try{await mutate(next=>{const item=next.items.find(i=>i.id===id);if(item)item.lastOpened=timestamp;});}catch(e){toast(e.message);}
}
channel?.addEventListener('message',async()=>{
  if(previewCache||document.querySelector('dialog[open]'))return;
  await mutationQueue;try{const stored=await readWorkspace();if(stored&&stored.revision>data.revision){data=validateState(stored);active=readRoute();render();}}catch{}
});
async function init() {
  document.querySelectorAll('[data-icon]').forEach(node=>node.innerHTML=icon(node.dataset.icon));
  try {
    if(publicMode){const response=await fetch('./collection.json');if(!response.ok)throw new Error('Não foi possível carregar os dados desta coleção. Verifique se collection.json foi publicado junto do site.');data=validateState(await response.json());}
    else {
      try{const stored=await readWorkspace();data=stored?validateState(stored):makeSeed();if(!stored)await writeWorkspace(data);}
      catch(e){storageAvailable=false;data=makeSeed();$('storage-warning').hidden=false;$('storage-warning').textContent=e.message+' As alterações funcionarão só nesta sessão. Exporte um backup antes de sair.';}
    }
    active=readRoute();history.replaceState({leIndex:0},'',routeHash(active));initialized=true;render();
  }catch(e){$('storage-warning').hidden=false;$('storage-warning').textContent=e.message;$('page-title').textContent='Não foi possível abrir a coleção.';$('page-subtitle').textContent='Confira se todos os arquivos do pacote foram publicados.';$('items').replaceChildren();document.body.dataset.readonly='true';$('save-status').hidden=true;}
}
init();
