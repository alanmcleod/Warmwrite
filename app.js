(() => {
'use strict';

const APP_VERSION='2.3.0';
const DOCS_KEY='warmwrite.documents.v2';
const CURRENT_KEY='warmwrite.current.v2';
const SETTINGS_KEY='warmwrite.settings.v2';
const POSITIONS_KEY='warmwrite.positions.v1';
const UPDATE_KEY='warmwrite.updateCheckedAt';
const VERSION_URL='./version.json';
const DEFAULT_SYMBOLS='. , “ ” ‘ ’ ? ! — … ( ) : ; # % & £ $ €';
const $=id=>document.getElementById(id);

const editor=$('editor'), editorWrap=$('editorWrap'), docTitle=$('docTitle'), saveStatus=$('saveStatus');
let docs=loadJSON(DOCS_KEY,[]);
let currentId=localStorage.getItem(CURRENT_KEY)||'';
let currentDoc=null, baselineWords=0, sessionStartWords=0, saveTimer=0, positionSaveTimer=0, savedRange=null, focusMode=false,showAllDocs=false,focusRestoreKeyboard=false,readingMode=false,readingPage=0,readingPageCount=1,readingControlsTimer=0,writingScrollTop=0,findMatchesCache=[],findMatchIndex=-1;
let positions=loadJSON(POSITIONS_KEY,{});
let settings={reminder:true,threshold:300,formatting:false,symbolsBar:true,symbols:DEFAULT_SYMBOLS,font:'classic',autoUpdate:true,readingSize:2,...loadJSON(SETTINGS_KEY,{})};

function loadJSON(key,fallback){try{return JSON.parse(localStorage.getItem(key)||'null')??fallback}catch{return fallback}}
function saveJSON(key,val){
  try{
    localStorage.setItem(key,JSON.stringify(val));
    return true;
  }catch(err){
    saveStatus.textContent='Storage full';
    showStorageNotice(true);
    alert('WarmWrite could not save this change because local storage is full. No documents were deleted. Please export important work and remove files yourself.');
    return false;
  }
}
function uid(){return `${Date.now()}-${Math.random().toString(36).slice(2,8)}`}
function countWords(t){const s=t.trim();return s?s.split(/\s+/u).length:0}
function textNow(){return editor.innerText.replace(/\u00a0/g,' ')}
function titleNow(){return docTitle.value.trim()||'Untitled'}
function formatDate(ts){const d=new Date(ts||Date.now()),today=new Date();const day=d.toDateString()===today.toDateString()?'Today':d.toLocaleDateString('en-GB',{day:'numeric',month:'short',year:'numeric'});return `${day}, ${d.toLocaleTimeString('en-GB',{hour:'2-digit',minute:'2-digit'})}`}

function clampProgress(value){
  const n=Number(value);
  return Number.isFinite(n)?Math.max(0,Math.min(1,n)):0;
}
function editorProgress(){
  try{
    const max=Math.max(0,editor.scrollHeight-editor.clientHeight);
    return max>0?clampProgress(editor.scrollTop/max):0;
  }catch{return 0}
}
function savedProgress(){
  if(!currentId)return 0;
  return clampProgress(positions&&positions[currentId]);
}
function savePosition(progress){
  if(!currentId)return;
  try{
    positions[currentId]=clampProgress(progress);
    localStorage.setItem(POSITIONS_KEY,JSON.stringify(positions));
  }catch{}
}
function queuePositionSave(progress){
  clearTimeout(positionSaveTimer);
  positionSaveTimer=setTimeout(()=>savePosition(progress),250);
}
function restoreWritingPosition(progress=savedProgress()){
  const p=clampProgress(progress);
  const apply=()=>{
    try{
      const max=Math.max(0,editor.scrollHeight-editor.clientHeight);
      editor.scrollTop=Math.round(p*max);
    }catch{}
  };
  requestAnimationFrame(()=>{apply();setTimeout(apply,120);setTimeout(apply,350)});
}

function ensureDoc(){
  currentDoc=docs.find(d=>d.id===currentId)||docs[0];
  if(!currentDoc){
    currentDoc={id:uid(),title:'Untitled',html:'',baselineWords:0,updatedAt:Date.now()};
    docs=[currentDoc];
  }
  currentId=currentDoc.id;
  localStorage.setItem(CURRENT_KEY,currentId);
}
function loadCurrent(){
  ensureDoc();
  docTitle.value=currentDoc.title||'Untitled';
  editor.innerHTML=currentDoc.html||'';
  baselineWords=Number.isFinite(currentDoc.baselineWords)?currentDoc.baselineWords:countWords(textNow());
  sessionStartWords=countWords(textNow());
  updateStats();
  restoreWritingPosition();
}
function persist(){
  if(!currentDoc)return;
  currentDoc.title=titleNow();
  currentDoc.html=editor.innerHTML;
  currentDoc.baselineWords=baselineWords;
  currentDoc.updatedAt=Date.now();
  docs.sort((a,b)=>b.updatedAt-a.updatedAt);
  const saved=saveJSON(DOCS_KEY,docs);
  if(saved){
    localStorage.setItem(CURRENT_KEY,currentId);
    saveStatus.textContent='✓ Saved';
  }
  renderRecents();
  checkStorage();
}
function queueSave(){saveStatus.textContent='Saving…';clearTimeout(saveTimer);saveTimer=setTimeout(persist,300)}
function createDoc(){
  persist();
  const d={id:uid(),title:'Untitled',html:'',baselineWords:0,updatedAt:Date.now()};
  docs.unshift(d);currentDoc=d;currentId=d.id;localStorage.setItem(CURRENT_KEY,currentId);
  docTitle.value='Untitled';editor.innerHTML='';baselineWords=0;sessionStartWords=0;persist();updateStats();
}
function switchDoc(id){
  persist();
  const d=docs.find(x=>x.id===id);if(!d)return;
  currentDoc=d;currentId=d.id;localStorage.setItem(CURRENT_KEY,id);
  loadCurrent();closeDrawer();
}

function applySettings(){
  document.body.classList.toggle('formatting-on',settings.formatting);
  document.body.classList.toggle('symbols-on',settings.symbolsBar);
  document.body.classList.toggle('font-modern',settings.font==='modern');
  document.body.classList.toggle('font-classic',settings.font!=='modern');
  $('formatToggle').checked=settings.formatting;
  $('symbolsToggle').checked=settings.symbolsBar;
  $('symbolsEditorRow').hidden=!settings.symbolsBar;
  $('symbolsInput').value=settings.symbols;
  $('fontSelect').value=settings.font;
  $('reminderToggle').checked=settings.reminder;
  $('thresholdSelect').value=String(settings.threshold);
  $('autoUpdateToggle').checked=settings.autoUpdate;
  renderSymbols();
}
function renderSymbols(){
  const bar=$('symbolBar');bar.innerHTML='';
  settings.symbols.trim().split(/\s+/u).filter(Boolean).forEach(sym=>{
    const b=document.createElement('button');b.className='symbol-btn';b.textContent=sym;
    b.addEventListener('pointerdown',e=>e.preventDefault());
    b.addEventListener('click',()=>insertText(sym));
    bar.appendChild(b);
  });
}
function updateStats(){
  const total=countWords(textNow()),unsaved=Math.abs(total-baselineWords),session=total-sessionStartWords;
  $('wordCount').textContent=total.toLocaleString('en-GB');
  $('sessionCount').textContent=`${session>=0?'+':'−'}${Math.abs(session).toLocaleString('en-GB')} this session`;
  $('unsavedCount').textContent=unsaved.toLocaleString('en-GB');
  let c='rgb(255,250,240)';
  if(settings.reminder){
    const t=Math.min(1,unsaved/Math.max(1,settings.threshold));
    c=`rgb(255,${Math.round(250-77*t)},${Math.round(240-163*t)})`;
  }
  editorWrap.style.backgroundColor=c;editor.style.backgroundColor=c;
}
function keyboardIsOpen(){
  const vv=window.visualViewport;
  if(!vv)return document.activeElement===editor;
  return window.innerHeight-vv.height>110;
}
function updateReadingLayout(){
  const reading=focusMode&&!keyboardIsOpen();
  document.body.classList.toggle('reading-layout',reading);
}
function setFocus(on,restoreKeyboard=false){
  focusMode=!!on;
  document.body.classList.toggle('focus-mode',focusMode);
  $('focusBtn').textContent=focusMode?'Focus is On':'Focus is Off';
  $('focusBtn').setAttribute('aria-pressed',String(focusMode));
  updateReadingLayout();
  if(restoreKeyboard){
    requestAnimationFrame(()=>{
      try{editor.focus({preventScroll:true})}catch{editor.focus()}
      restoreSelection();
      updateReadingLayout();
    });
  }
}

const READING_SIZES=[1.02,1.10,1.18,1.28,1.40];
function readingSizeValue(){
  const i=Math.max(0,Math.min(READING_SIZES.length-1,Number(settings.readingSize)||2));
  return READING_SIZES[i];
}
function readingViewportHeight(){
  const viewport=$('readingViewport');
  return Math.max(1,Math.floor(viewport.getBoundingClientRect().height||viewport.clientHeight||window.innerHeight));
}
function updateReadingPage(){
  const pages=$('readingPages');
  if(!pages)return;
  readingPage=Math.max(0,Math.min(readingPage,Math.max(0,readingPageCount-1)));
  const pageHeight=readingViewportHeight();
  pages.style.transform=`translateY(${-readingPage*pageHeight}px)`;
  const readingPercent=readingPageCount<=1?100:Math.round((readingPage/Math.max(1,readingPageCount-1))*100);
  $('readingPageNumber').textContent=`${readingPercent}%`;
}
function prepareReadingFlow(){
  const pages=$('readingPages');
  pages.style.transform='translateY(0)';
  pages.style.width='100%';
  pages.style.columnWidth='auto';
  pages.style.columnGap='normal';
  pages.style.height='auto';
  return readingViewportHeight();
}
function measureReadingPages(keepProgress=true){
  if(!readingMode)return;
  const pages=$('readingPages');
  const oldProgress=readingPageCount>1?readingPage/(readingPageCount-1):0;
  const pageHeight=prepareReadingFlow();
  requestAnimationFrame(()=>{
    const contentHeight=Math.max(pageHeight,pages.scrollHeight);
    readingPageCount=Math.max(1,Math.ceil((contentHeight-1)/pageHeight));
    readingPage=keepProgress?Math.round(oldProgress*Math.max(0,readingPageCount-1)):0;
    updateReadingPage();
  });
}
function paginateReading(keepProgress=true){
  measureReadingPages(keepProgress);
}
function showReadingControls(){
  const controls=$('readingControls');
  controls.hidden=false;
  clearTimeout(readingControlsTimer);
  readingControlsTimer=setTimeout(()=>{if(readingMode)controls.hidden=true},2600);
}
function enterReadingMode(){
  if(readingMode||document.body.classList.contains('home-open'))return;
  persist();
  rememberSelection();
  writingScrollTop=editor.scrollTop;
  const writeProgress=editorProgress();
  savePosition(writeProgress);
  editor.blur();
  readingMode=true;
  readingPage=0;
  document.body.classList.add('reading-mode-open');
  const mode=$('readingMode'),pages=$('readingPages');
  pages.innerHTML=editor.innerHTML||'<p></p>';
  pages.style.setProperty('--reading-font-size',`${readingSizeValue()}rem`);
  mode.hidden=false;
  requestAnimationFrame(()=>{
    const progress=savedProgress();
    prepareReadingFlow();
    requestAnimationFrame(()=>{
      const pageHeight=readingViewportHeight();
      const contentHeight=Math.max(pageHeight,pages.scrollHeight);
      readingPageCount=Math.max(1,Math.ceil((contentHeight-1)/pageHeight));
      readingPage=Math.round(progress*Math.max(0,readingPageCount-1));
      updateReadingPage();
      setTimeout(()=>paginateReading(true),180);
    });
  });
}
function exitReadingMode(){
  if(!readingMode)return;
  const progress=readingPageCount>1?readingPage/(readingPageCount-1):0;
  savePosition(progress);
  readingMode=false;
  clearTimeout(readingControlsTimer);
  $('readingControls').hidden=true;
  $('readingMode').hidden=true;
  document.body.classList.remove('reading-mode-open');
  requestAnimationFrame(()=>{
    const max=Math.max(0,editor.scrollHeight-editor.clientHeight);
    editor.scrollTop=Math.round(progress*max);
  });
}
function changeReadingSize(delta){
  settings.readingSize=Math.max(0,Math.min(READING_SIZES.length-1,(Number(settings.readingSize)||2)+delta));
  saveJSON(SETTINGS_KEY,settings);
  $('readingPages').style.setProperty('--reading-font-size',`${readingSizeValue()}rem`);
  paginateReading(true);
  showReadingControls();
}
function turnReadingPage(delta){
  const next=Math.max(0,Math.min(readingPage+delta,readingPageCount-1));
  if(next===readingPage)return;
  readingPage=next;
  updateReadingPage();
  queuePositionSave(readingPageCount>1?readingPage/(readingPageCount-1):0);
}

function showHome(){
  persist();setFocus(false);document.body.classList.add('home-open');$('homeScreen').hidden=false;renderHome();closeDrawer();
}
function showEditor(){document.body.classList.remove('home-open');$('homeScreen').hidden=true}
function documentWordCount(d){
  const tmp=document.createElement('div');
  tmp.innerHTML=d.html||'';
  return countWords(tmp.innerText||'');
}
function showStorageNotice(force=false){
  const notice=$('storageNotice');
  if(!notice)return;
  if(force){
    notice.hidden=false;
    notice.textContent='Local storage is nearly full. WarmWrite will never delete old documents automatically. Export important work and choose any files you wish to remove.';
  }else if(!notice.dataset.storageWarning){
    notice.hidden=true;
  }
}
async function checkStorage(){
  let localChars=0;
  try{
    for(let i=0;i<localStorage.length;i++){
      const key=localStorage.key(i)||'';
      localChars+=key.length+(localStorage.getItem(key)||'').length;
    }
  }catch{}
  const localBytes=localChars*2;
  let warn=localBytes>4*1024*1024;
  if(navigator.storage&&navigator.storage.estimate){
    try{
      const estimate=await navigator.storage.estimate();
      if(estimate.quota&&estimate.usage/estimate.quota>.8)warn=true;
    }catch{}
  }
  const notice=$('storageNotice');
  if(notice){
    notice.dataset.storageWarning=warn?'true':'';
    notice.hidden=!warn;
    if(warn)notice.textContent='Local storage is getting full. WarmWrite will not purge old documents. Export important work and delete only the documents you choose.';
  }
}
function renderHome(){
  const sorted=[...docs].sort((a,b)=>b.updatedAt-a.updatedAt),latest=sorted[0],card=$('continueCard');
  if(latest){
    card.hidden=false;
    $('continueTitle').textContent=latest.title||'Untitled';
    $('continueMeta').textContent=`${documentWordCount(latest).toLocaleString('en-GB')} words · Last edited ${formatDate(latest.updatedAt)}`;
    $('continueBtn').dataset.id=latest.id;
  }else card.hidden=true;
  const list=$('homeRecent');
  list.innerHTML='';
  const remaining=sorted.slice(1);
  const visible=showAllDocs?remaining:remaining.slice(0,9);
  visible.forEach(d=>{
    const b=document.createElement('button');
    b.className='home-recent-btn';
    const strong=document.createElement('strong'),small=document.createElement('small');
    strong.textContent=d.title||'Untitled';
    small.textContent=`Last edited ${formatDate(d.updatedAt)} · ${documentWordCount(d).toLocaleString('en-GB')} words`;
    b.append(strong,small);
    b.addEventListener('click',()=>{switchDoc(d.id);showEditor()});
    list.appendChild(b);
  });
  if(!list.children.length)list.innerHTML='<div class="subtle">No other recent documents</div>';
  const showBtn=$('showAllDocsBtn');
  showBtn.hidden=remaining.length<=9;
  showBtn.textContent=showAllDocs?'Show fewer documents':`Show all documents (${sorted.length})`;
  checkStorage();
}
function renderRecents(){
  const list=$('drawerRecent');list.innerHTML='';
  [...docs].sort((a,b)=>b.updatedAt-a.updatedAt).slice(0,8).forEach(d=>{
    const b=document.createElement('button');b.className='recent-btn';b.textContent=d.title||'Untitled';b.addEventListener('click',()=>switchDoc(d.id));list.appendChild(b);
  });
}
function openDrawer(){$('drawer').classList.add('open');$('scrim').hidden=false}
function closeDrawer(){$('drawer').classList.remove('open');$('scrim').hidden=true}

function rememberSelection(){
  const s=window.getSelection();
  if(s&&s.rangeCount&&editor.contains(s.anchorNode))savedRange=s.getRangeAt(0).cloneRange();
}
function restoreSelection(){if(!savedRange)return;const s=window.getSelection();s.removeAllRanges();s.addRange(savedRange)}
function insertText(txt){
  editor.focus();restoreSelection();const s=window.getSelection();
  if(!s||!s.rangeCount)return;
  const r=s.getRangeAt(0);r.deleteContents();const n=document.createTextNode(txt);r.insertNode(n);r.setStartAfter(n);r.collapse(true);s.removeAllRanges();s.addRange(r);savedRange=r.cloneRange();
  updateStats();queueSave();
}
function applyCommand(cmd){
  editor.focus();restoreSelection();document.execCommand(cmd,false);rememberSelection();updateStats();queueSave();
}

function findTextNodes(){
  const walker=document.createTreeWalker(editor,NodeFilter.SHOW_TEXT);
  const nodes=[];let node,total=0;
  while((node=walker.nextNode())){
    const start=total,end=start+(node.nodeValue||'').length;
    nodes.push({node,start,end});total=end;
  }
  return {nodes,text:nodes.map(x=>x.node.nodeValue||'').join('')};
}
function makeRangeFromOffsets(start,end){
  const map=findTextNodes(),r=document.createRange();
  if(!map.nodes.length)return null;
  const a=map.nodes.find(x=>start>=x.start&&start<=x.end)||map.nodes[map.nodes.length-1];
  const b=map.nodes.find(x=>end>=x.start&&end<=x.end)||map.nodes[map.nodes.length-1];
  r.setStart(a.node,Math.max(0,Math.min((a.node.nodeValue||'').length,start-a.start)));
  r.setEnd(b.node,Math.max(0,Math.min((b.node.nodeValue||'').length,end-b.start)));
  return r;
}
function buildFindMatches(){
  const term=$('findInput').value;
  findMatchesCache=[];findMatchIndex=-1;
  if(!term){$('findStatus').textContent='0';return}
  const hay=findTextNodes().text.toLocaleLowerCase(),needle=term.toLocaleLowerCase();
  let at=0;
  while((at=hay.indexOf(needle,at))!==-1){findMatchesCache.push({start:at,end:at+term.length});at+=Math.max(1,term.length)}
  $('findStatus').textContent=String(findMatchesCache.length);
}
function revealFindMatch(index){
  if(!findMatchesCache.length)return;
  findMatchIndex=(index+findMatchesCache.length)%findMatchesCache.length;
  const m=findMatchesCache[findMatchIndex],r=makeRangeFromOffsets(m.start,m.end);
  if(!r)return;
  const s=window.getSelection();s.removeAllRanges();s.addRange(r);
  const el=r.startContainer.parentElement;
  if(el)el.scrollIntoView({block:'center',behavior:'smooth'});
  $('findStatus').textContent=`${findMatchIndex+1} of ${findMatchesCache.length}`;
}
function findStep(delta){
  const term=$('findInput').value;
  if(!term)return;
  if(!findMatchesCache.length)buildFindMatches();
  if(!findMatchesCache.length)return;
  revealFindMatch(findMatchIndex<0?(delta>0?0:findMatchesCache.length-1):findMatchIndex+delta);
}
function replaceCurrentMatch(){
  if(!findMatchesCache.length||findMatchIndex<0){findStep(1);return}
  const m=findMatchesCache[findMatchIndex],r=makeRangeFromOffsets(m.start,m.end);
  if(!r)return;
  r.deleteContents();r.insertNode(document.createTextNode($('replaceInput').value));
  updateStats();queueSave();buildFindMatches();
  if(findMatchesCache.length)revealFindMatch(Math.min(findMatchIndex,findMatchesCache.length-1));
}
function replaceAllMatches(){
  buildFindMatches();
  if(!findMatchesCache.length)return;
  const count=findMatchesCache.length;
  if(!confirm(`Replace all ${count} match${count===1?'':'es'}?`))return;
  const replacement=$('replaceInput').value;
  [...findMatchesCache].reverse().forEach(m=>{
    const r=makeRangeFromOffsets(m.start,m.end);
    if(r){r.deleteContents();r.insertNode(document.createTextNode(replacement))}
  });
  updateStats();queueSave();buildFindMatches();
  $('findStatus').textContent=`Replaced ${count}`;
}
function openFindDialog(){
  rememberSelection();buildFindMatches();$('findDialog').showModal();setTimeout(()=>$('findInput').focus(),50);
}
function maybeDoubleSpaceFullStop(e){
  if(e.inputType!=='insertText'||e.data!==' ')return;
  const s=window.getSelection();
  if(!s||!s.rangeCount||!s.isCollapsed||!editor.contains(s.anchorNode))return;
  const node=s.anchorNode,offset=s.anchorOffset;
  if(node.nodeType!==Node.TEXT_NODE||offset<2)return;
  const text=node.nodeValue||'';
  if(text[offset-1]!==' ')return;
  const before=text[offset-2]||'';
  if(!/[\p{L}\p{N}\)\]]/u.test(before))return;
  e.preventDefault();
  const r=document.createRange();r.setStart(node,offset-1);r.setEnd(node,offset);r.deleteContents();
  const n=document.createTextNode('. ');r.insertNode(n);r.setStartAfter(n);r.collapse(true);
  s.removeAllRanges();s.addRange(r);savedRange=r.cloneRange();
  updateStats();queueSave();
}

function cleanPastedHtml(html){
  const src=document.createElement('div');src.innerHTML=html;
  const allowed=new Set(['B','STRONG','I','EM','S','STRIKE','DEL','BR','P','DIV']);
  const clean=node=>{
    if(node.nodeType===Node.TEXT_NODE)return document.createTextNode(node.nodeValue||'');
    if(node.nodeType!==Node.ELEMENT_NODE)return document.createDocumentFragment();
    const frag=document.createDocumentFragment();[...node.childNodes].forEach(c=>frag.appendChild(clean(c)));
    const tag=node.tagName.toUpperCase();if(!allowed.has(tag))return frag;if(tag==='BR')return document.createElement('br');
    const mapped=tag==='STRONG'?'b':tag==='EM'?'i':['STRIKE','DEL'].includes(tag)?'s':tag.toLowerCase();
    const el=document.createElement(mapped);el.appendChild(frag);return el;
  };
  const out=document.createDocumentFragment();[...src.childNodes].forEach(c=>out.appendChild(clean(c)));return out;
}
function insertFragment(frag){
  editor.focus();restoreSelection();const s=window.getSelection();if(!s||!s.rangeCount)return;
  const r=s.getRangeAt(0);r.deleteContents();const last=frag.lastChild;r.insertNode(frag);
  if(last){r.setStartAfter(last);r.collapse(true);s.removeAllRanges();s.addRange(r);savedRange=r.cloneRange()}
  updateStats();queueSave();
}

function safeName(ext){return `${titleNow().replace(/[\\/:*?"<>|]+/g,'-').slice(0,80)}.${ext}`}
function download(content,type,name){const blob=new Blob([content],{type}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=name;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000)}
function makeRtfContent(){
  const body=[...editor.childNodes].map(htmlToRtf).join('');
  return `{\\rtf1\\ansi\\deff0{\\fonttbl{\\f0 Times New Roman;}}\\f0\\fs24\n${body}\n}`;
}
async function shareRtf(){
  const file=new File([makeRtfContent()],safeName('rtf'),{type:'application/rtf'});
  if(navigator.canShare&&navigator.canShare({files:[file]})){
    try{
      await navigator.share({title:titleNow(),text:`${titleNow()} — shared from WarmWrite`,files:[file]});
      return;
    }catch(err){if(err&&err.name==='AbortError')return}
  }
  if(navigator.share){
    try{
      await navigator.share({title:titleNow(),text:textNow()});
      return;
    }catch(err){if(err&&err.name==='AbortError')return}
  }
  download(makeRtfContent(),'application/rtf',safeName('rtf'));
  alert('This browser could not open the share menu, so WarmWrite saved an RTF copy instead.');
}
function printDocument(){
  persist();

  const existing=document.getElementById('warmwritePrintFrame');
  if(existing) existing.remove();

  const frame=document.createElement('iframe');
  frame.id='warmwritePrintFrame';
  frame.setAttribute('aria-hidden','true');
  frame.style.position='fixed';
  frame.style.width='1px';
  frame.style.height='1px';
  frame.style.right='0';
  frame.style.bottom='0';
  frame.style.border='0';
  frame.style.opacity='0';
  frame.style.pointerEvents='none';

  document.body.appendChild(frame);

  const printDoc=frame.contentDocument || frame.contentWindow.document;
  const font=settings.font==='modern'
    ? 'Arial, Helvetica, sans-serif'
    : '"Times New Roman", Times, serif';

  printDoc.open();
  printDoc.write(`<!doctype html>
<html>
<head>
<meta charset="utf-8">
<title></title>
<style>
  @page { margin: 20mm; }
  html, body {
    margin: 0;
    padding: 0;
    color: #111;
    background: white;
    font-family: ${font};
    font-size: 12pt;
    line-height: 1.5;
  }
  h1 {
    font-size: 18pt;
    margin: 0 0 18pt;
  }
  .document {
    overflow-wrap: anywhere;
  }
  p, div {
    break-inside: avoid;
  }
</style>
</head>
<body>
<h1></h1>
<div class="document"></div>
</body>
</html>`);
  printDoc.close();

  printDoc.title=titleNow();
  printDoc.querySelector('h1').textContent=titleNow();
  printDoc.querySelector('.document').innerHTML=editor.innerHTML;

  let removed=false;
  const removeFrame=()=>{
    if(removed) return;
    removed=true;
    setTimeout(()=>frame.remove(),250);
  };

  const printWindow=frame.contentWindow;
  printWindow.addEventListener('afterprint',removeFrame,{once:true});

  setTimeout(()=>{
    try{
      printWindow.focus();
      printWindow.print();
      // iOS does not always emit afterprint.
      setTimeout(removeFrame,3000);
    }catch{
      removeFrame();
      alert('WarmWrite could not open the print dialogue.');
    }
  },180);
}
function rtfEsc(t){return Array.from(t).map(ch=>{const c=ch.codePointAt(0);if('\\{}'.includes(ch))return'\\'+ch;if(ch==='\n')return'\\par\n';if(c>127)return`\\u${c>32767?c-65536:c}?`;return ch}).join('')}
function htmlToRtf(node){
  if(node.nodeType===Node.TEXT_NODE)return rtfEsc(node.nodeValue||'');
  if(node.nodeType!==Node.ELEMENT_NODE)return'';
  const tag=node.tagName.toLowerCase(),inner=[...node.childNodes].map(htmlToRtf).join('');
  if(tag==='br')return'\\line ';if(tag==='b'||tag==='strong')return`{\\b ${inner}}`;if(tag==='i'||tag==='em')return`{\\i ${inner}}`;if(['s','strike','del'].includes(tag))return`{\\strike ${inner}}`;if(tag==='p'||tag==='div')return`${inner}\\par\n`;return inner;
}
function parseRtf(raw){
  return raw.replace(/\\par[d]?/g,'\n').replace(/\\line/g,'\n').replace(/\\u(-?\d+)\?/g,(_,n)=>String.fromCharCode(Number(n)<0?Number(n)+65536:Number(n))).replace(/\\'[0-9a-f]{2}/gi,'').replace(/\\[a-z]+-?\d* ?/gi,'').replace(/[{}]/g,'').trim().replace(/\n/g,'<br>');
}
async function importFile(file){
  if(!file)return;const raw=await file.text();createDoc();currentDoc.title=file.name.replace(/\.(txt|rtf)$/i,'')||'Untitled';docTitle.value=currentDoc.title;
  if(/\.rtf$/i.test(file.name)||/rtf/i.test(file.type))editor.innerHTML=parseRtf(raw);else editor.textContent=raw;
  baselineWords=countWords(textNow());sessionStartWords=baselineWords;currentDoc.baselineWords=baselineWords;persist();updateStats();showEditor();
}
async function checkUpdates(manual=false){
  const now=Date.now(),last=Number(localStorage.getItem(UPDATE_KEY)||0);if(!manual&&now-last<86400000)return;
  $('latestVersion').textContent='Checking…';
  try{const r=await fetch(`${VERSION_URL}?t=${now}`,{cache:'no-store'}),d=await r.json();$('latestVersion').textContent=d.version||APP_VERSION;localStorage.setItem(UPDATE_KEY,String(now));if(manual)alert((d.version||APP_VERSION)===APP_VERSION?`WarmWrite ${APP_VERSION} is up to date.`:`WarmWrite ${d.version} is available.`)}
  catch{$('latestVersion').textContent='Unable to check';if(manual)alert('WarmWrite could not check for updates.')}
}

editor.addEventListener('beforeinput',maybeDoubleSpaceFullStop);
editor.addEventListener('input',()=>{updateStats();queueSave()});
editor.addEventListener('scroll',()=>{if(!readingMode)queuePositionSave(editorProgress())},{passive:true});
editor.addEventListener('keyup',rememberSelection);editor.addEventListener('mouseup',rememberSelection);editor.addEventListener('touchend',rememberSelection);
editor.addEventListener('paste',e=>{e.preventDefault();rememberSelection();const h=e.clipboardData?.getData('text/html'),t=e.clipboardData?.getData('text/plain')||'';if(h)insertFragment(cleanPastedHtml(h));else{const f=document.createDocumentFragment();t.replace(/\r\n?/g,'\n').split('\n').forEach((line,i,a)=>{f.appendChild(document.createTextNode(line));if(i<a.length-1)f.appendChild(document.createElement('br'))});insertFragment(f)}});
docTitle.addEventListener('input',queueSave);
document.querySelectorAll('[data-cmd]').forEach(b=>{b.addEventListener('pointerdown',e=>{rememberSelection();e.preventDefault()});b.addEventListener('click',()=>applyCommand(b.dataset.cmd))});

$('menuBtn').onclick=openDrawer;$('closeDrawerBtn').onclick=closeDrawer;$('scrim').onclick=closeDrawer;
$('settingsBtn').onclick=()=>$('settingsDialog').showModal();
$('findBtn').onclick=openFindDialog;
$('quickGuideBtn').onclick=()=>{closeDrawer();$('helpDialog').showModal()};
$('findInput').addEventListener('input',buildFindMatches);
$('findPrevBtn').onclick=()=>findStep(-1);
$('findNextBtn').onclick=()=>findStep(1);
$('replaceBtn').onclick=replaceCurrentMatch;
$('replaceAllBtn').onclick=replaceAllMatches;
$('focusBtn').addEventListener('pointerdown',e=>{
  focusRestoreKeyboard=keyboardIsOpen()||document.activeElement===editor;
  rememberSelection();
  if(focusRestoreKeyboard)e.preventDefault();
});
$('focusBtn').onclick=()=>setFocus(!focusMode,focusRestoreKeyboard);
$('readingBtn').onclick=enterReadingMode;
$('readingExitBtn').onclick=exitReadingMode;
$('readingPrevZone').onclick=()=>turnReadingPage(-1);
$('readingNextZone').onclick=()=>turnReadingPage(1);
$('readingCentreZone').onclick=showReadingControls;
$('readingSmallerBtn').onclick=e=>{e.stopPropagation();changeReadingSize(-1)};
$('readingLargerBtn').onclick=e=>{e.stopPropagation();changeReadingSize(1)};

$('closeFileBtn').onclick=showHome;$('newFileBtn').onclick=()=>{createDoc();showEditor();closeDrawer();editor.focus()};
$('openInput').onchange=e=>{importFile(e.target.files?.[0]);e.target.value=''};
$('homeImportInput').onchange=e=>{importFile(e.target.files?.[0]);e.target.value=''};
$('homeNewBtn').onclick=()=>{createDoc();showEditor();editor.focus()};$('homeSettingsBtn').onclick=()=>$('settingsDialog').showModal();
$('continueBtn').onclick=()=>{switchDoc($('continueBtn').dataset.id);showEditor()};
$('showAllDocsBtn').onclick=()=>{showAllDocs=!showAllDocs;renderHome()};
$('exportBtn').onclick=()=>$('exportDialog').showModal();
$('exportTxtBtn').onclick=e=>{e.preventDefault();download(textNow(),'text/plain;charset=utf-8',safeName('txt'));baselineWords=countWords(textNow());persist();updateStats();$('exportDialog').close()};
$('exportRtfBtn').onclick=e=>{e.preventDefault();download(makeRtfContent(),'application/rtf',safeName('rtf'));baselineWords=countWords(textNow());persist();updateStats();$('exportDialog').close()};
$('shareRtfBtn').onclick=async e=>{e.preventDefault();await shareRtf();$('exportDialog').close()};
$('printBtn').onclick=e=>{e.preventDefault();$('exportDialog').close();setTimeout(printDocument,80)};
$('hideKeyboardBtn').onclick=()=>editor.blur();$('statsBtn').onclick=()=>{$('statsWords').textContent=countWords(textNow());$('statsChars').textContent=textNow().length;$('statsSession').textContent=countWords(textNow())-sessionStartWords;$('statsDialog').showModal()};
$('fontSelect').onchange=e=>{settings.font=e.target.value;saveJSON(SETTINGS_KEY,settings);applySettings()};
$('formatToggle').onchange=e=>{settings.formatting=e.target.checked;saveJSON(SETTINGS_KEY,settings);applySettings()};
$('symbolsToggle').onchange=e=>{settings.symbolsBar=e.target.checked;saveJSON(SETTINGS_KEY,settings);applySettings()};
$('symbolsInput').onchange=e=>{settings.symbols=e.target.value||DEFAULT_SYMBOLS;saveJSON(SETTINGS_KEY,settings);applySettings()};
$('reminderToggle').onchange=e=>{settings.reminder=e.target.checked;saveJSON(SETTINGS_KEY,settings);updateStats()};
$('thresholdSelect').onchange=e=>{settings.threshold=Number(e.target.value);saveJSON(SETTINGS_KEY,settings);updateStats()};
$('autoUpdateToggle').onchange=e=>{settings.autoUpdate=e.target.checked;saveJSON(SETTINGS_KEY,settings)};
$('checkUpdatesBtn').onclick=e=>{e.preventDefault();checkUpdates(true)};


let viewportFrame=0,viewportSettleTimer=0,lastViewportHeight=0,lastViewportTop=0;

function measureViewport(){
  const vv=window.visualViewport;
  return {
    height:Math.max(320,Math.round(vv?vv.height:window.innerHeight)),
    top:Math.round(vv?vv.offsetTop:0)
  };
}

function applyViewport(force=false){
  viewportFrame=0;
  const next=measureViewport();

  // Ignore tiny iOS caret/selection fluctuations, which otherwise make the
  // complete lower dock appear to bob while typing.
  const heightChanged=Math.abs(next.height-lastViewportHeight)>=4;
  const topChanged=Math.abs(next.top-lastViewportTop)>=4;
  if(!force&&!heightChanged&&!topChanged)return;

  lastViewportHeight=next.height;
  lastViewportTop=next.top;
  document.documentElement.style.setProperty('--ww-visible-height',`${next.height}px`);
  document.documentElement.style.setProperty('--ww-visible-top',`${next.top}px`);
  updateReadingLayout();
}

function requestViewport(force=false){
  if(viewportFrame)cancelAnimationFrame(viewportFrame);
  viewportFrame=requestAnimationFrame(()=>applyViewport(force));
}

function settleViewport(){
  clearTimeout(viewportSettleTimer);
  viewportSettleTimer=setTimeout(()=>requestViewport(true),120);
}

if(window.visualViewport){
  // Resize is enough to detect the keyboard. Listening to visualViewport.scroll
  // causes repeated small movements as Safari follows the caret.
  window.visualViewport.addEventListener('resize',()=>{
    requestViewport();
    settleViewport();
  });
}

window.addEventListener('resize',()=>{
  requestViewport();
  settleViewport();
  if(readingMode)setTimeout(()=>paginateReading(true),100);
});

window.addEventListener('orientationchange',()=>{
  setTimeout(()=>{requestViewport(true);if(readingMode)paginateReading(true)},180);
});

editor.addEventListener('focus',()=>{
  requestViewport(true);
  settleViewport();
});

editor.addEventListener('blur',()=>{
  setTimeout(()=>{requestViewport(true);updateReadingLayout()},140);
});

requestViewport(true);
loadCurrent();applySettings();renderRecents();renderHome();checkStorage();if(settings.autoUpdate)setTimeout(()=>checkUpdates(false),800);
document.addEventListener('keydown',e=>{if(!readingMode)return;if(e.key==='ArrowLeft'){e.preventDefault();turnReadingPage(-1)}else if(e.key==='ArrowRight'||e.key===' '){e.preventDefault();turnReadingPage(1)}else if(e.key==='Escape'){e.preventDefault();exitReadingMode()}});
document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='hidden')savePosition(readingMode?(readingPageCount>1?readingPage/(readingPageCount-1):0):editorProgress())});
window.addEventListener('pagehide',()=>savePosition(readingMode?(readingPageCount>1?readingPage/(readingPageCount-1):0):editorProgress()));
window.addEventListener('beforeunload',()=>{savePosition(readingMode?(readingPageCount>1?readingPage/(readingPageCount-1):0):editorProgress());persist()});
if('serviceWorker'in navigator)window.addEventListener('load',()=>navigator.serviceWorker.register('./service-worker.js').catch(()=>{}));
})();
