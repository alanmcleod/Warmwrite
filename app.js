(() => {
  'use strict';

  const STORAGE_KEY = 'warmwrite.document.v1';
  const SETTINGS_KEY = 'warmwrite.settings.v1';
  const BASE_COLOR = [255, 250, 240];
  const WARM_COLOR = [255, 173, 77];
  const HOT_COLOR = [244, 97, 37];

  const editor = document.getElementById('editor');
  const editorWrap = document.getElementById('editorWrap');
  const docTitle = document.getElementById('docTitle');
  const wordCount = document.getElementById('wordCount');
  const unsavedCount = document.getElementById('unsavedCount');
  const autosaveStatus = document.getElementById('autosaveStatus');
  const symbolBar = document.getElementById('symbolBar');
  const reminderToggle = document.getElementById('reminderToggle');
  const thresholdSelect = document.getElementById('thresholdSelect');
  const symbolsInput = document.getElementById('symbolsInput');

  let settings = loadSettings();
  let baselineWords = 0;
  let saveTimer = null;
  let savedRange = null;

  function countWords(text) {
    const clean = text.trim();
    return clean ? clean.split(/\s+/u).length : 0;
  }

  function textNow() {
    return editor.innerText.replace(/\u00a0/g, ' ');
  }

  function loadSettings() {
    const defaults = { reminder: true, threshold: 300, symbols: '— “ ” ‘ ’ … ( ) ? ! : ;' };
    try { return { ...defaults, ...JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}') }; }
    catch { return defaults; }
  }

  function saveSettings() {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
  }

  function loadDocument() {
    try {
      const data = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
      docTitle.value = data.title || 'Untitled';
      editor.innerHTML = data.html || '';
      baselineWords = Number.isFinite(data.baselineWords) ? data.baselineWords : countWords(textNow());
    } catch {
      docTitle.value = 'Untitled';
      editor.innerHTML = '';
      baselineWords = 0;
    }
  }

  function saveDocument() {
    const payload = { title: docTitle.value.trim() || 'Untitled', html: editor.innerHTML, baselineWords };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
    autosaveStatus.textContent = 'Saved locally';
  }

  function queueAutosave() {
    autosaveStatus.textContent = 'Saving…';
    clearTimeout(saveTimer);
    saveTimer = setTimeout(saveDocument, 350);
  }

  function mix(a, b, t) {
    return a.map((v, i) => Math.round(v + (b[i] - v) * t));
  }

  function updateStats() {
    const total = countWords(textNow());
    const changed = Math.abs(total - baselineWords);
    wordCount.textContent = total.toLocaleString('en-GB');
    unsavedCount.textContent = changed.toLocaleString('en-GB');

    let rgb = BASE_COLOR;
    if (settings.reminder) {
      const threshold = Math.max(1, settings.threshold);
      if (changed <= threshold) rgb = mix(BASE_COLOR, WARM_COLOR, Math.min(1, changed / threshold));
      else rgb = mix(WARM_COLOR, HOT_COLOR, Math.min(1, (changed - threshold) / threshold));
    }
    const colour = `rgb(${rgb.join(',')})`;
    editorWrap.style.backgroundColor = colour;
    editor.style.backgroundColor = colour;
  }

  function refreshSymbols() {
    symbolBar.innerHTML = '';
    const symbols = settings.symbols.trim().split(/\s+/u).filter(Boolean);
    for (const symbol of symbols) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'symbol-btn';
      btn.textContent = symbol;
      btn.addEventListener('pointerdown', e => e.preventDefault());
      btn.addEventListener('click', () => insertAtCaret(symbol));
      symbolBar.appendChild(btn);
    }
  }

  function rememberSelection() {
    const selection = window.getSelection();
    if (selection && selection.rangeCount && editor.contains(selection.anchorNode)) savedRange = selection.getRangeAt(0).cloneRange();
  }

  function restoreSelection() {
    if (!savedRange) return;
    const selection = window.getSelection();
    selection.removeAllRanges();
    selection.addRange(savedRange);
  }

  function insertAtCaret(text) {
    editor.focus();
    restoreSelection();
    const selection = window.getSelection();
    if (!selection || selection.rangeCount === 0) {
      editor.append(document.createTextNode(text));
      return;
    }
    const range = selection.getRangeAt(0);
    range.deleteContents();
    const node = document.createTextNode(text);
    range.insertNode(node);
    range.setStartAfter(node);
    range.collapse(true);
    selection.removeAllRanges();
    selection.addRange(range);
    savedRange = range.cloneRange();
    editor.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText', data: text }));
  }

  function applyCommand(cmd) {
    editor.focus();
    restoreSelection();
    document.execCommand(cmd, false);
    rememberSelection();
    queueAutosave();
  }

  function safeName(ext) {
    const base = (docTitle.value.trim() || 'Untitled').replace(/[\\/:*?"<>|]+/g, '-').slice(0, 80);
    return `${base}.${ext}`;
  }

  function download(content, type, filename) {
    const blob = new Blob([content], { type });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  function rtfEscape(text) {
    return Array.from(text).map(ch => {
      const code = ch.codePointAt(0);
      if (ch === '\\' || ch === '{' || ch === '}') return `\\${ch}`;
      if (ch === '\n') return '\\par\n';
      if (code > 127) {
        const signed = code > 32767 ? code - 65536 : code;
        return `\\u${signed}?`;
      }
      return ch;
    }).join('');
  }

  function nodeToRtf(node) {
    if (node.nodeType === Node.TEXT_NODE) return rtfEscape(node.nodeValue || '');
    if (node.nodeType !== Node.ELEMENT_NODE) return '';
    const tag = node.tagName.toLowerCase();
    const inner = Array.from(node.childNodes).map(nodeToRtf).join('');
    if (tag === 'br') return '\\line ';
    if (tag === 'b' || tag === 'strong') return `{\\b ${inner}}`;
    if (tag === 'i' || tag === 'em') return `{\\i ${inner}}`;
    if (tag === 's' || tag === 'strike' || tag === 'del') return `{\\strike ${inner}}`;
    if (tag === 'div' || tag === 'p') return `${inner}\\par\n`;
    return inner;
  }

  function markExported() {
    baselineWords = countWords(textNow());
    updateStats();
    saveDocument();
  }

  function openDrawer() {
    document.getElementById('drawer').classList.add('open');
    document.getElementById('drawer').setAttribute('aria-hidden', 'false');
    document.getElementById('scrim').hidden = false;
  }

  function closeDrawer() {
    document.getElementById('drawer').classList.remove('open');
    document.getElementById('drawer').setAttribute('aria-hidden', 'true');
    document.getElementById('scrim').hidden = true;
  }

  function syncKeyboardOffset() {
    const viewport = window.visualViewport;
    if (!viewport) {
      document.documentElement.style.setProperty('--keyboard-offset', '0px');
      return;
    }
    const overlap = Math.max(0, window.innerHeight - viewport.height - viewport.offsetTop);
    const editorActive = document.activeElement === editor;
    document.documentElement.style.setProperty('--keyboard-offset', `${editorActive ? overlap : 0}px`);
  }

  if (window.visualViewport) {
    window.visualViewport.addEventListener('resize', syncKeyboardOffset);
    window.visualViewport.addEventListener('scroll', syncKeyboardOffset);
  }
  window.addEventListener('resize', syncKeyboardOffset);
  editor.addEventListener('focus', () => requestAnimationFrame(syncKeyboardOffset));
  editor.addEventListener('blur', () => setTimeout(syncKeyboardOffset, 80));

  loadDocument();
  reminderToggle.checked = settings.reminder;
  thresholdSelect.value = String(settings.threshold);
  symbolsInput.value = settings.symbols;
  refreshSymbols();
  updateStats();
  syncKeyboardOffset();

  editor.addEventListener('input', () => { updateStats(); queueAutosave(); });
  editor.addEventListener('keyup', rememberSelection);
  editor.addEventListener('mouseup', rememberSelection);
  editor.addEventListener('touchend', rememberSelection);
  docTitle.addEventListener('input', queueAutosave);

  document.querySelectorAll('[data-cmd]').forEach(btn => {
    btn.addEventListener('pointerdown', e => e.preventDefault());
    btn.addEventListener('click', () => applyCommand(btn.dataset.cmd));
  });

  const undo = () => applyCommand('undo');
  const redo = () => applyCommand('redo');
  document.getElementById('undoBtn').addEventListener('click', undo);
  document.getElementById('undoBtn2').addEventListener('click', undo);
  document.getElementById('redoBtn').addEventListener('click', redo);
  document.getElementById('redoBtn2').addEventListener('click', redo);
  document.getElementById('hideKeyboardBtn').addEventListener('click', () => editor.blur());

  document.getElementById('menuBtn').addEventListener('click', openDrawer);
  document.getElementById('closeDrawer').addEventListener('click', closeDrawer);
  document.getElementById('scrim').addEventListener('click', closeDrawer);

  document.getElementById('exportBtn').addEventListener('click', () => document.getElementById('exportDialog').showModal());
  document.getElementById('moreBtn').addEventListener('click', () => document.getElementById('settingsDialog').showModal());
  document.getElementById('settingsBtn').addEventListener('click', () => { closeDrawer(); document.getElementById('settingsDialog').showModal(); });
  document.getElementById('aboutBtn').addEventListener('click', () => { closeDrawer(); document.getElementById('aboutDialog').showModal(); });

  document.getElementById('exportTxtBtn').addEventListener('click', e => {
    e.preventDefault(); download(textNow(), 'text/plain;charset=utf-8', safeName('txt')); markExported(); document.getElementById('exportDialog').close();
  });

  document.getElementById('exportRtfBtn').addEventListener('click', e => {
    e.preventDefault();
    const body = Array.from(editor.childNodes).map(nodeToRtf).join('');
    const rtf = `{\\rtf1\\ansi\\deff0{\\fonttbl{\\f0 Georgia;}}\\f0\\fs24\n${body}\n}`;
    download(rtf, 'application/rtf', safeName('rtf')); markExported(); document.getElementById('exportDialog').close();
  });

  document.getElementById('newDocBtn').addEventListener('click', () => {
    if (!confirm('Start a new document? Export anything important first.')) return;
    editor.innerHTML = ''; docTitle.value = 'Untitled'; baselineWords = 0; updateStats(); saveDocument(); closeDrawer(); editor.focus();
  });

  document.getElementById('openTxt').addEventListener('change', async event => {
    const file = event.target.files?.[0];
    if (!file) return;
    const text = await file.text();
    editor.textContent = text;
    docTitle.value = file.name.replace(/\.txt$/i, '') || 'Untitled';
    baselineWords = countWords(text);
    updateStats(); saveDocument(); closeDrawer(); event.target.value = '';
  });

  reminderToggle.addEventListener('change', () => { settings.reminder = reminderToggle.checked; saveSettings(); updateStats(); });
  thresholdSelect.addEventListener('change', () => { settings.threshold = Number(thresholdSelect.value); saveSettings(); updateStats(); });
  symbolsInput.addEventListener('change', () => { settings.symbols = symbolsInput.value || '— “ ” ‘ ’ … ( ) ? ! : ;'; saveSettings(); refreshSymbols(); });

  document.getElementById('resetSettingsBtn').addEventListener('click', e => {
    e.preventDefault();
    if (!confirm('Reset WarmWrite and remove the locally stored document?')) return;
    localStorage.removeItem(STORAGE_KEY); localStorage.removeItem(SETTINGS_KEY); location.reload();
  });

  window.addEventListener('beforeunload', saveDocument);
  if ('serviceWorker' in navigator) window.addEventListener('load', () => navigator.serviceWorker.register('./service-worker.js').catch(() => {}));
})();
