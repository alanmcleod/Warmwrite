(() => {
'use strict';

const OLD_DOC_KEY = 'warmwrite.document.v1';
const DOCS_KEY = 'warmwrite.documents.v2';
const CURRENT_KEY = 'warmwrite.current.v2';
const SETTINGS_KEY = 'warmwrite.settings.v1';
const APP_VERSION = '1.5.2';
const VERSION_URL = './version.json';
const LAST_VERSION_KEY = 'warmwrite.lastVersionSeen';
const DISMISSED_UPDATE_KEY = 'warmwrite.dismissedUpdate';
const BASE_COLOR = [255,250,240], WARM_COLOR = [255,173,77], HOT_COLOR = [244,97,37];

const $ = id => document.getElementById(id);
const editor = $('editor'), editorWrap = $('editorWrap'), docTitle = $('docTitle');
const wordCount = $('wordCount'), sessionCount = $('sessionCount'), unsavedCount = $('unsavedCount');
const autosaveStatus = $('autosaveStatus'), symbolBar = $('symbolBar');
const reminderToggle = $('reminderToggle'), formattingToggle = $('formattingToggle');
const symbolsToggle = $('symbolsToggle'), autoUpdateToggle = $('autoUpdateToggle');
const thresholdSelect = $('thresholdSelect'), symbolsInput = $('symbolsInput');

let settings = loadSettings();
let documents = loadDocuments();
let currentId = localStorage.getItem(CURRENT_KEY);
let currentDoc = null;
let baselineWords = 0;
let sessionStartWords = 0;
let saveTimer = null;
let savedRange = null;
let availableVersion = null;

function uid() { return `${Date.now()}-${Math.random().toString(36).slice(2,9)}`; }
function countWords(text) { const clean = text.trim(); return clean ? clean.split(/\s+/u).length : 0; }
function textNow() { return editor.innerText.replace(/\u00a0/g,' '); }
function titleNow() { return docTitle.value.trim() || 'Untitled'; }

function loadSettings() {
  const defaults = { reminder:true, threshold:300, symbols:'— “ ” ‘ ’ … ( ) ? ! : ;', formatting:false, symbolsBar:true, autoUpdate:true };
  try { return {...defaults, ...JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}')}; }
  catch { return defaults; }
}
function saveSettings() { localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings)); }

function loadDocuments() {
  try {
    const stored = JSON.parse(localStorage.getItem(DOCS_KEY) || '[]');
    if (Array.isArray(stored) && stored.length) return stored;
  } catch {}
  try {
    const old = JSON.parse(localStorage.getItem(OLD_DOC_KEY) || '{}');
    if (old.html || old.title) {
      const migrated = [{id:uid(), title:old.title || 'Untitled', html:old.html || '', baselineWords:Number.isFinite(old.baselineWords) ? old.baselineWords : 0, updatedAt:Date.now()}];
      localStorage.setItem(DOCS_KEY, JSON.stringify(migrated));
      localStorage.setItem(CURRENT_KEY, migrated[0].id);
      return migrated;
    }
  } catch {}
  return [];
}
function persistDocuments() {
  documents.sort((a,b) => b.updatedAt - a.updatedAt);
  localStorage.setItem(DOCS_KEY, JSON.stringify(documents));
  localStorage.setItem(CURRENT_KEY, currentId || '');
  renderRecents();
}
function createBlankDocument(focus=false) {
  const doc = {id:uid(), title:'Untitled', html:'', baselineWords:0, updatedAt:Date.now()};
  documents.push(doc); currentId = doc.id; currentDoc = doc;
  docTitle.value = doc.title; editor.innerHTML = ''; baselineWords = 0; sessionStartWords = 0;
  persistDocuments(); updateStats(); saveDocument();
  if (focus) editor.focus();
}
function loadCurrentDocument() {
  currentDoc = documents.find(d => d.id === currentId) || documents[0];
  if (!currentDoc) return createBlankDocument(false);
  currentId = currentDoc.id;
  docTitle.value = currentDoc.title || 'Untitled';
  editor.innerHTML = currentDoc.html || '';
  baselineWords = Number.isFinite(currentDoc.baselineWords) ? currentDoc.baselineWords : countWords(textNow());
  sessionStartWords = countWords(textNow());
  persistDocuments(); updateStats();
}
function saveDocument() {
  if (!currentDoc) return;
  currentDoc.title = titleNow();
  currentDoc.html = editor.innerHTML;
  currentDoc.baselineWords = baselineWords;
  currentDoc.updatedAt = Date.now();
  persistDocuments();
  autosaveStatus.textContent = 'Saved locally';
}
function queueAutosave() {
  autosaveStatus.textContent = 'Saving…';
  clearTimeout(saveTimer);
  saveTimer = setTimeout(saveDocument, 350);
}
function hasUnsavedWords() { return Math.abs(countWords(textNow()) - baselineWords) > 0; }

function mix(a,b,t) { return a.map((v,i) => Math.round(v + (b[i]-v)*t)); }
function updateStats() {
  const total = countWords(textNow());
  const changed = Math.abs(total - baselineWords);
  const session = total - sessionStartWords;
  wordCount.textContent = total.toLocaleString('en-GB');
  sessionCount.textContent = `${session >= 0 ? '+' : '−'}${Math.abs(session).toLocaleString('en-GB')} this session`;
  unsavedCount.textContent = changed.toLocaleString('en-GB');
  let rgb = BASE_COLOR;
  if (settings.reminder) {
    const threshold = Math.max(1, settings.threshold);
    rgb = changed <= threshold ? mix(BASE_COLOR,WARM_COLOR,Math.min(1,changed/threshold)) : mix(WARM_COLOR,HOT_COLOR,Math.min(1,(changed-threshold)/threshold));
  }
  const colour = `rgb(${rgb.join(',')})`;
  editorWrap.style.backgroundColor = colour; editor.style.backgroundColor = colour;
}
function showStats() {
  const text = textNow(), total = countWords(text), session = total - sessionStartWords;
  $('statsWords').textContent = total.toLocaleString('en-GB');
  $('statsChars').textContent = text.length.toLocaleString('en-GB');
  $('statsSession').textContent = `${session >= 0 ? '+' : '−'}${Math.abs(session).toLocaleString('en-GB')}`;
  $('statsDialog').showModal();
}

function applyBarVisibility() {
  document.body.classList.toggle('formatting-on', settings.formatting);
  document.body.classList.toggle('symbols-on', settings.symbolsBar);
  formattingToggle.checked = settings.formatting;
  symbolsToggle.checked = settings.symbolsBar;
  $('symbolsEditorRow').hidden = !settings.symbolsBar;
}
function compareVersions(a, b) {
  const pa = String(a).split('.').map(Number), pb = String(b).split('.').map(Number);
  const length = Math.max(pa.length, pb.length);
  for (let i = 0; i < length; i++) {
    const av = pa[i] || 0, bv = pb[i] || 0;
    if (av > bv) return 1;
    if (av < bv) return -1;
  }
  return 0;
}
async function checkForUpdates(showResult=false) {
  $('latestVersionText').textContent = 'Checking…';
  try {
    const response = await fetch(`${VERSION_URL}?t=${Date.now()}`, {cache:'no-store'});
    if (!response.ok) throw new Error('Version check failed');

    const data = await response.json();
    availableVersion = String(data.version || APP_VERSION).trim();
    $('latestVersionText').textContent = availableVersion;

    const newer = compareVersions(availableVersion, APP_VERSION) > 0;
    $('settingsUpdateBtn').hidden = !newer;

    // A completed update must never trigger another prompt for the same version.
    if (!newer) {
      localStorage.removeItem(DISMISSED_UPDATE_KEY);
      if (showResult) alert(`WarmWrite ${APP_VERSION} is up to date.`);
      return;
    }

    const dismissedVersion = localStorage.getItem(DISMISSED_UPDATE_KEY);
    const shouldPrompt = showResult || dismissedVersion !== availableVersion;

    if (shouldPrompt) {
      $('updateMessage').textContent =
        `WarmWrite ${availableVersion} is available. You can update now or continue writing and update later from Settings.`;
      if (!$('updateDialog').open) $('updateDialog').showModal();
    }
  } catch {
    $('latestVersionText').textContent = 'Unable to check';
    if (showResult) alert('WarmWrite could not check for updates just now.');
  }
}
async function installUpdate() {
  saveDocument();
  autosaveStatus.textContent = 'Updating…';

  const targetVersion = availableVersion || APP_VERSION;
  localStorage.setItem(LAST_VERSION_KEY, targetVersion);
  localStorage.removeItem(DISMISSED_UPDATE_KEY);

  try {
    if ('serviceWorker' in navigator) {
      const registration = await navigator.serviceWorker.getRegistration();
      if (registration) {
        await registration.update();

        // When a waiting worker exists, activate it now.
        if (registration.waiting) {
          registration.waiting.postMessage({type:'SKIP_WAITING'});
        }
      }
    }
  } catch {}

  // Cache-busting query prevents Safari from immediately reopening the old shell.
  const url = new URL(location.href);
  url.searchParams.set('wwv', targetVersion);
  location.replace(url.toString());
}
function showUpdatedMessageIfNeeded() {
  const previous = localStorage.getItem(LAST_VERSION_KEY);
  if (previous && previous === APP_VERSION) {
    localStorage.removeItem(LAST_VERSION_KEY);
    $('updatedMessage').textContent = `WarmWrite has been updated to version ${APP_VERSION}.`;
    setTimeout(() => $('updatedDialog').showModal(), 350);
  }
}
function refreshSymbols() {
  symbolBar.innerHTML = '';
  settings.symbols.trim().split(/\s+/u).filter(Boolean).forEach(symbol => {
    const btn = document.createElement('button');
    btn.type='button'; btn.className='symbol-btn'; btn.textContent=symbol;
    btn.addEventListener('pointerdown', e => e.preventDefault());
    btn.addEventListener('click', () => insertAtCaret(symbol));
    symbolBar.appendChild(btn);
  });
}
function applyFormattingVisibility() { applyBarVisibility(); }
function rememberSelection() {
  const selection = window.getSelection();
  if (selection && selection.rangeCount && editor.contains(selection.anchorNode)) savedRange = selection.getRangeAt(0).cloneRange();
}
function restoreSelection() {
  if (!savedRange) return;
  const selection = window.getSelection(); selection.removeAllRanges(); selection.addRange(savedRange);
}
function insertAtCaret(text) {
  editor.focus(); restoreSelection();
  const selection = window.getSelection();
  if (!selection || !selection.rangeCount) { editor.append(document.createTextNode(text)); }
  else {
    const range = selection.getRangeAt(0); range.deleteContents();
    const node = document.createTextNode(text); range.insertNode(node); range.setStartAfter(node); range.collapse(true);
    selection.removeAllRanges(); selection.addRange(range); savedRange = range.cloneRange();
  }
  editor.dispatchEvent(new InputEvent('input',{bubbles:true,inputType:'insertText',data:text}));
}
function formattingStateForNode(node, cmd) {
  const element = node.nodeType === Node.ELEMENT_NODE ? node : node.parentElement;
  if (!element || !editor.contains(element)) return false;
  const style = getComputedStyle(element);

  if (cmd === 'bold') {
    const weight = Number.parseInt(style.fontWeight, 10);
    return Number.isFinite(weight) ? weight >= 600 : ['bold', 'bolder'].includes(style.fontWeight);
  }
  if (cmd === 'italic') return style.fontStyle === 'italic';
  if (cmd === 'strikeThrough') return style.textDecorationLine.split(/\s+/).includes('line-through');
  return false;
}
function selectedTextNodes(range) {
  const nodes = [];
  const walker = document.createTreeWalker(editor, NodeFilter.SHOW_TEXT, {
    acceptNode(node) {
      if (!node.nodeValue || !node.nodeValue.trim()) return NodeFilter.FILTER_REJECT;
      try { return range.intersectsNode(node) ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT; }
      catch { return NodeFilter.FILTER_REJECT; }
    }
  });
  while (walker.nextNode()) nodes.push(walker.currentNode);
  return nodes;
}
function selectedFormattingState(cmd, range) {
  if (range.collapsed) return formattingStateForNode(range.startContainer, cmd);
  const nodes = selectedTextNodes(range);
  return nodes.length > 0 && nodes.every(node => formattingStateForNode(node, cmd));
}
function commandState(cmd) {
  try { return document.queryCommandState(cmd); }
  catch { return false; }
}
function toggleSelectedInline(cmd) {
  editor.focus();
  restoreSelection();

  const selection = window.getSelection();
  if (!selection || !selection.rangeCount) return;

  const range = selection.getRangeAt(0).cloneRange();
  const wasOn = selectedFormattingState(cmd, range);
  const targetOn = !wasOn;

  // Safari sometimes changes the selection when a toolbar control is touched.
  // Put the saved range back immediately before issuing the edit command.
  selection.removeAllRanges();
  selection.addRange(range);
  savedRange = range.cloneRange();

  document.execCommand(cmd, false);

  // Verify the result. If Safari ignored the first toggle, restore the same
  // selection and retry once only when the command state still disagrees.
  const afterFirst = commandState(cmd);
  if (afterFirst !== targetOn) {
    selection.removeAllRanges();
    selection.addRange(range);
    document.execCommand(cmd, false);
  }

  rememberSelection();
  updateStats();
  queueAutosave();
}
function applyCommand(cmd) {
  if (['bold','italic','strikeThrough'].includes(cmd)) {
    toggleSelectedInline(cmd);
    return;
  }
  editor.focus();
  restoreSelection();
  document.execCommand(cmd, false);
  rememberSelection();
  updateStats();
  queueAutosave();
}
function safeName(ext) {
  const base = titleNow().replace(/[\\/:*?"<>|]+/g,'-').slice(0,80);
  return `${base}.${ext}`;
}
function download(content,type,filename) {
  const blob = new Blob([content],{type}), url = URL.createObjectURL(blob), link = document.createElement('a');
  link.href=url; link.download=filename; document.body.appendChild(link); link.click(); link.remove();
  setTimeout(() => URL.revokeObjectURL(url),1000);
}
function rtfEscape(text) {
  return Array.from(text).map(ch => {
    const code = ch.codePointAt(0);
    if (ch === '\\' || ch === '{' || ch === '}') return `\\${ch}`;
    if (ch === '\n') return '\\par\n';
    if (code > 127) { const signed = code > 32767 ? code - 65536 : code; return `\\u${signed}?`; }
    return ch;
  }).join('');
}
function nodeToRtf(node) {
  if (node.nodeType === Node.TEXT_NODE) return rtfEscape(node.nodeValue || '');
  if (node.nodeType !== Node.ELEMENT_NODE) return '';
  const tag = node.tagName.toLowerCase(), inner = Array.from(node.childNodes).map(nodeToRtf).join('');
  if (tag === 'br') return '\\line ';
  if (tag === 'span' && node.dataset.wwFormat === 'bold') return node.dataset.wwState === 'off' ? `{\\b0 ${inner}}` : `{\\b ${inner}}`;
  if (tag === 'span' && node.dataset.wwFormat === 'italic') return node.dataset.wwState === 'off' ? `{\\i0 ${inner}}` : `{\\i ${inner}}`;
  if (tag === 'b' || tag === 'strong') return `{\\b ${inner}}`;
  if (tag === 'i' || tag === 'em') return `{\\i ${inner}}`;
  if (tag === 's' || tag === 'strike' || tag === 'del') return `{\\strike ${inner}}`;
  if (tag === 'div' || tag === 'p') return `${inner}\\par\n`;
  return inner;
}
function parseRtf(rtf) {
  const out = document.createElement('div');
  let stack = [{b:false,i:false,s:false,skip:false}], state = stack[0], buffer = '';
  const flush = () => {
    if (!buffer || state.skip) { buffer=''; return; }
    let node = document.createTextNode(buffer);
    if (state.s) { const e=document.createElement('s'); e.appendChild(node); node=e; }
    if (state.i) { const e=document.createElement('i'); e.appendChild(node); node=e; }
    if (state.b) { const e=document.createElement('b'); e.appendChild(node); node=e; }
    out.appendChild(node); buffer='';
  };
  const paragraph = () => { flush(); if (!state.skip) out.appendChild(document.createElement('br')); };
  let i=0;
  while (i < rtf.length) {
    const ch = rtf[i];
    if (ch === '{') { flush(); state={...state}; stack.push(state); i++; continue; }
    if (ch === '}') { flush(); if (stack.length>1) stack.pop(); state=stack[stack.length-1]; i++; continue; }
    if (ch !== '\\') { if (!state.skip && ch !== '\r' && ch !== '\n') buffer += ch; i++; continue; }
    flush(); i++;
    const next = rtf[i];
    if (next === '\\' || next === '{' || next === '}') { if (!state.skip) buffer += next; i++; continue; }
    if (next === "'") {
      const hex = rtf.slice(i+1,i+3); if (!state.skip && /^[0-9a-f]{2}$/i.test(hex)) buffer += String.fromCharCode(parseInt(hex,16));
      i += 3; continue;
    }
    if (next === '*') { state.skip=true; i++; continue; }
    const match = rtf.slice(i).match(/^([a-zA-Z]+)(-?\d+)? ?/);
    if (!match) { i++; continue; }
    const word=match[1], num=match[2] === undefined ? null : Number(match[2]); i += match[0].length;
    if (['fonttbl','colortbl','stylesheet','info','pict','object','header','footer'].includes(word)) state.skip=true;
    else if (word === 'b') state.b = num !== 0;
    else if (word === 'i') state.i = num !== 0;
    else if (word === 'strike') state.s = num !== 0;
    else if (word === 'plain') state.b=state.i=state.s=false;
    else if (word === 'par' || word === 'line') paragraph();
    else if (word === 'tab' && !state.skip) buffer += '\t';
    else if (word === 'emdash' && !state.skip) buffer += '—';
    else if (word === 'endash' && !state.skip) buffer += '–';
    else if (word === 'lquote' && !state.skip) buffer += '‘';
    else if (word === 'rquote' && !state.skip) buffer += '’';
    else if (word === 'ldblquote' && !state.skip) buffer += '“';
    else if (word === 'rdblquote' && !state.skip) buffer += '”';
    else if (word === 'u' && num !== null && !state.skip) {
      buffer += String.fromCharCode(num < 0 ? num + 65536 : num);
      if (rtf[i] === '?') i++;
    }
  }
  flush();
  while (out.lastChild && out.lastChild.nodeName === 'BR') out.removeChild(out.lastChild);
  return out.innerHTML;
}
function markExported() { baselineWords=countWords(textNow()); updateStats(); saveDocument(); }

function renderRecents() {
  const list = $('recentList'); list.innerHTML='';
  const recent = [...documents].sort((a,b)=>b.updatedAt-a.updatedAt).slice(0,3);
  if (!recent.length) { list.innerHTML='<div class="recent-empty">No recent documents</div>'; return; }
  recent.forEach(doc => {
    const btn=document.createElement('button'); btn.className='recent-btn'; btn.textContent=doc.title || 'Untitled';
    if (doc.id === currentId) btn.setAttribute('aria-current','true');
    btn.addEventListener('click', () => switchDocument(doc.id));
    list.appendChild(btn);
  });
}
function switchDocument(id) {
  if (id === currentId) { closeDrawer(); return; }
  saveDocument();
  currentId=id; currentDoc=documents.find(d=>d.id===id);
  if (!currentDoc) return;
  docTitle.value=currentDoc.title || 'Untitled'; editor.innerHTML=currentDoc.html || '';
  baselineWords=Number.isFinite(currentDoc.baselineWords) ? currentDoc.baselineWords : countWords(textNow());
  sessionStartWords=countWords(textNow()); persistDocuments(); updateStats(); closeDrawer(); editor.focus();
}
function openDrawer() { $('drawer').classList.add('open'); $('drawer').setAttribute('aria-hidden','false'); $('scrim').hidden=false; renderRecents(); }
function closeDrawer() { $('drawer').classList.remove('open'); $('drawer').setAttribute('aria-hidden','true'); $('scrim').hidden=true; }

let lastVisibleHeight = 0;
let viewportFrame = 0;
let settleTimer = 0;

function measureVisibleHeight() {
  const viewport = window.visualViewport;
  const measured = viewport ? viewport.height : window.innerHeight;
  return Math.max(320, Math.round(measured));
}

function applyVisibleHeight(force = false) {
  viewportFrame = 0;
  const nextHeight = measureVisibleHeight();

  // Ignore the one- or two-pixel fluctuations iOS emits while the caret and
  // selection handles are changing. Those tiny updates caused the old dock to
  // appear to bob.
  if (!force && Math.abs(nextHeight - lastVisibleHeight) < 4) return;

  lastVisibleHeight = nextHeight;
  document.documentElement.style.setProperty('--ww-visible-height', `${nextHeight}px`);

  const keyboardOpen =
    document.activeElement === editor &&
    nextHeight < Math.round(window.screen.height * 0.82);

  document.body.classList.toggle('keyboard-open', keyboardOpen);
}

function requestVisibleHeight(force = false) {
  if (viewportFrame) cancelAnimationFrame(viewportFrame);
  viewportFrame = requestAnimationFrame(() => applyVisibleHeight(force));
}

function settleVisibleHeight() {
  clearTimeout(settleTimer);
  settleTimer = setTimeout(() => requestVisibleHeight(true), 120);
}

if (window.visualViewport) {
  // Deliberately listen to resize only. visualViewport.scroll fires repeatedly
  // as Safari adjusts the caret and is the main source of apparent bobbing.
  window.visualViewport.addEventListener('resize', () => {
    requestVisibleHeight();
    settleVisibleHeight();
  });
}

window.addEventListener('resize', () => {
  requestVisibleHeight();
  settleVisibleHeight();
});

window.addEventListener('orientationchange', () => {
  setTimeout(() => requestVisibleHeight(true), 180);
});

editor.addEventListener('focus', () => {
  requestVisibleHeight(true);
  settleVisibleHeight();
});

editor.addEventListener('blur', () => {
  setTimeout(() => requestVisibleHeight(true), 140);
});

reminderToggle.checked=settings.reminder; formattingToggle.checked=settings.formatting;
symbolsToggle.checked=settings.symbolsBar; autoUpdateToggle.checked=settings.autoUpdate;
thresholdSelect.value=String(settings.threshold); symbolsInput.value=settings.symbols;
$('currentVersionText').textContent=APP_VERSION;
refreshSymbols(); applyBarVisibility(); loadCurrentDocument(); requestVisibleHeight(true);
showUpdatedMessageIfNeeded();
if (settings.autoUpdate) setTimeout(() => checkForUpdates(false), 900);

editor.addEventListener('input',()=>{ updateStats(); queueAutosave(); });
editor.addEventListener('keyup',rememberSelection); editor.addEventListener('mouseup',rememberSelection); editor.addEventListener('touchend',rememberSelection);
docTitle.addEventListener('input',()=>{ currentDoc.title=titleNow(); currentDoc.updatedAt=Date.now(); renderRecents(); queueAutosave(); });

document.querySelectorAll('[data-cmd]').forEach(btn => {
  btn.addEventListener('pointerdown', e => {
    rememberSelection();
    e.preventDefault();
  });
  btn.addEventListener('touchstart', () => rememberSelection(), {passive:true});
  btn.addEventListener('click',()=>applyCommand(btn.dataset.cmd));
});
document.addEventListener('selectionchange', () => {
  const selection = window.getSelection();
  if (selection && selection.rangeCount && editor.contains(selection.anchorNode)) rememberSelection();
});
$('undoBtn').addEventListener('click',()=>applyCommand('undo'));
$('redoBtn').addEventListener('click',()=>applyCommand('redo'));
$('hideKeyboardBtn').addEventListener('click',()=>editor.blur());

$('menuBtn').addEventListener('click',openDrawer); $('closeDrawer').addEventListener('click',closeDrawer); $('scrim').addEventListener('click',closeDrawer);
$('exportBtn').addEventListener('click',()=>$('exportDialog').showModal());
$('moreBtn').addEventListener('click',()=>$('settingsDialog').showModal());
$('settingsBtn').addEventListener('click',()=>{ closeDrawer(); $('settingsDialog').showModal(); });
$('aboutBtn').addEventListener('click',()=>{ closeDrawer(); $('aboutDialog').showModal(); });
$('statsBtn').addEventListener('click',showStats);

$('exportTxtBtn').addEventListener('click',e=>{ e.preventDefault(); download(textNow(),'text/plain;charset=utf-8',safeName('txt')); markExported(); $('exportDialog').close(); });
$('exportRtfBtn').addEventListener('click',e=>{
  e.preventDefault();
  const body=Array.from(editor.childNodes).map(nodeToRtf).join('');
  download(`{\\rtf1\\ansi\\deff0{\\fonttbl{\\f0 Georgia;}}\\f0\\fs24\n${body}\n}`,'application/rtf',safeName('rtf'));
  markExported(); $('exportDialog').close();
});

$('newDocBtn').addEventListener('click',()=>{
  if (hasUnsavedWords() && !confirm('This document has unsaved words. Start a new document anyway?')) return;
  saveDocument(); createBlankDocument(true); closeDrawer();
});
$('openDocument').addEventListener('change',async event=>{
  const file=event.target.files?.[0]; if (!file) return;
  if (hasUnsavedWords() && !confirm('This document has unsaved words. Open another document anyway?')) { event.target.value=''; return; }
  try {
    const raw=await file.text(), isRtf=/\.rtf$/i.test(file.name) || /rtf/i.test(file.type);
    saveDocument();
    const doc={id:uid(),title:file.name.replace(/\.(txt|rtf)$/i,'') || 'Untitled',html:isRtf ? parseRtf(raw) : '',baselineWords:0,updatedAt:Date.now()};
    documents.push(doc); currentId=doc.id; currentDoc=doc; docTitle.value=doc.title;
    if (isRtf) editor.innerHTML=doc.html; else editor.textContent=raw;
    doc.html=editor.innerHTML; baselineWords=countWords(textNow()); doc.baselineWords=baselineWords; sessionStartWords=baselineWords;
    persistDocuments(); updateStats(); saveDocument(); closeDrawer();
  } catch { alert('WarmWrite could not open that document.'); }
  event.target.value='';
});

formattingToggle.addEventListener('change',()=>{ settings.formatting=formattingToggle.checked; saveSettings(); applyBarVisibility(); });
symbolsToggle.addEventListener('change',()=>{ settings.symbolsBar=symbolsToggle.checked; saveSettings(); applyBarVisibility(); });
autoUpdateToggle.addEventListener('change',()=>{ settings.autoUpdate=autoUpdateToggle.checked; saveSettings(); });
reminderToggle.addEventListener('change',()=>{ settings.reminder=reminderToggle.checked; saveSettings(); updateStats(); });
thresholdSelect.addEventListener('change',()=>{ settings.threshold=Number(thresholdSelect.value); saveSettings(); updateStats(); });
symbolsInput.addEventListener('change',()=>{ settings.symbols=symbolsInput.value || '— “ ” ‘ ’ … ( ) ? ! : ;'; saveSettings(); refreshSymbols(); });

$('checkUpdatesBtn').addEventListener('click', e => { e.preventDefault(); checkForUpdates(true); });
$('settingsUpdateBtn').addEventListener('click', e => { e.preventDefault(); installUpdate(); });
$('updateNowBtn').addEventListener('click', e => { e.preventDefault(); installUpdate(); });
$('laterSettingsBtn').addEventListener('click', e => {
  e.preventDefault();
  if (availableVersion) localStorage.setItem(DISMISSED_UPDATE_KEY, availableVersion);
  $('updateDialog').close();
});
$('closeUpdateBtn').addEventListener('click', () => {
  if (availableVersion) localStorage.setItem(DISMISSED_UPDATE_KEY, availableVersion);
  $('updateDialog').close();
});

$('resetSettingsBtn').addEventListener('click',e=>{
  e.preventDefault();
  if (!confirm('Reset WarmWrite and remove all locally stored documents?')) return;
  localStorage.removeItem(OLD_DOC_KEY); localStorage.removeItem(DOCS_KEY); localStorage.removeItem(CURRENT_KEY); localStorage.removeItem(SETTINGS_KEY); location.reload();
});
window.addEventListener('beforeunload',saveDocument);
if ('serviceWorker' in navigator) window.addEventListener('load',()=>navigator.serviceWorker.register('./service-worker.js').catch(()=>{}));
})();