(() => {
  'use strict';
  const menu = window.DEMO_MENU;
  const catalog = window.RECEIPT_CATALOG;
  const content = document.querySelector('#content');
  const title = document.querySelector('#title');
  const description = document.querySelector('#description');
  const back = document.querySelector('#back');
  const step = document.querySelector('#step');
  const sitePicker = document.querySelector('#site');
  const devicePicker = document.querySelector('#device');
  const siteBadge = document.querySelector('#site-badge');
  const siteStatus = document.querySelector('#site-status');
  const MODE_LABEL = { demo: '무료 반복 데모 QR', receipt: '실제 영수증 QR' };
  const findSite = id => catalog.sites.find(s => s.id === id) || null;

  /* 매장·기기·모드별 사용 가능 여부. 생성된 카탈로그의 사유를 쓰되, 필수 값이 비어 있으면 화면에서도 막는다. */
  function availability(siteId, side, mode) {
    const site = findSite(siteId);
    if (!site) return { ready: false, reason: '매장 정보 없음' };
    const device = site.devices[side];
    if (!device) return { ready: false, reason: '기기 미등록' };
    let reason = (device.blocked && device.blocked[mode]) || '';
    if (!reason && mode === 'receipt' && (!site.sourceId || !site.storeCd)) reason = '키오스크 매장코드 미확인';
    if (!reason && mode === 'receipt' && !(device.menus && device.menus.length)) reason = '상품 매핑 없음';
    return { ready: !reason, reason };
  }

  const params = new URLSearchParams(window.location.search);
  // ?site 없이 ?device=R만 오면 기존 링크와 같게 기본 매장(포병여단)으로 연다.
  let siteId = findSite(params.get('site')) ? params.get('site') : catalog.defaultSite;
  let device = params.get('device') === 'R' ? 'R' : 'L';
  let mode = 'demo';
  let category = null;
  let selected = null;
  const site = () => findSite(siteId);
  const displayName = item => item.names?.[device] || item.name;
  const emit = (name, detail) => document.dispatchEvent(new CustomEvent(name, { detail }));

  function siteSummary(s) {
    const modes = ['demo', 'receipt'].filter(m => ['L', 'R'].some(side => availability(s.id, side, m).ready));
    if (modes.length === 2) return s.name;
    if (modes.length === 1) return `${s.name} (${modes[0] === 'demo' ? '데모 QR만' : '영수증 QR만'})`;
    return `${s.name} (준비 중)`;
  }

  function fillPickers() {
    sitePicker.replaceChildren(...catalog.sites.map(s => new Option(siteSummary(s), s.id)));
    sitePicker.value = siteId;
    for (const option of devicePicker.options) {
      const d = site().devices[option.value];
      option.textContent = d ? `${option.value}${d.roast ? ` · ${d.roast}` : ''}` : `${option.value} · 기기 미등록`;
    }
    devicePicker.value = device;
    siteBadge.textContent = `${site().name} L/R`;
    document.title = `아미라운지 ${site().name} ${device} · 데모 QR`;
  }

  function syncUrl() {
    const next = new URLSearchParams(window.location.search);
    next.set('site', siteId);
    next.set('device', device);
    try { window.history.replaceState(null, '', `${window.location.pathname}?${next}`); } catch (_) { /* 미리보기 등에서 무시 */ }
  }

  function renderStatus() {
    const state = availability(siteId, device, mode);
    siteStatus.hidden = state.ready;
    siteStatus.replaceChildren();
    if (state.ready) return;
    const strong = document.createElement('strong');
    strong.textContent = `${site().name} ${device} 기기 · ${MODE_LABEL[mode]} 준비 중`;
    const text = document.createElement('span');
    text.textContent = `사유: ${state.reason}. 이 매장·기기에서는 QR을 표시하거나 전송하지 않습니다.`;
    siteStatus.append(strong, text);
  }

  function button(label, className, action) {
    const node = document.createElement('button');
    node.className = className;
    node.textContent = label;
    node.addEventListener('click', action);
    return node;
  }

  function render(focus = true) {
    content.replaceChildren();
    const state = availability(siteId, device, 'demo');
    if (!state.ready) { category = null; selected = null; }
    back.hidden = !category;
    if (!state.ready) {
      step.textContent = '준비 중';
      title.textContent = `${site().name} ${device} 기기 데모 QR 준비 중`;
      description.textContent = `사유: ${state.reason}`;
      content.className = '';
      const panel = document.createElement('div'); panel.className = 'blocked-panel';
      const strong = document.createElement('strong'); strong.textContent = 'QR을 표시하지 않습니다';
      const note = document.createElement('p'); note.textContent = '이 기기에는 데모 QR 연결이 아직 없어 스캔해도 제조되지 않습니다. 다른 매장·기기를 선택하거나 준비가 끝난 뒤 사용해 주세요.';
      panel.append(strong, note); content.append(panel);
    } else if (!category) {
      step.textContent = '카테고리 선택';
      title.textContent = '어떤 음료를 고를까요?';
      description.textContent = '따뜻하게 또는 시원하게, 카테고리를 선택해 주세요.';
      content.className = 'categories';
      for (const c of ['HOT', 'ICE']) {
        const count = menu.filter(item => item.category === c).length;
        const b = button('', `category ${c.toLowerCase()}`, () => { category = c; render(); });
        const strong = document.createElement('strong'); strong.textContent = c;
        const small = document.createElement('small'); small.textContent = `${c === 'HOT' ? '따뜻한 음료' : '시원한 음료'} ${count}종`;
        b.append(strong, small); content.append(b);
      }
    } else if (!selected) {
      step.textContent = '음료 선택';
      title.textContent = `${category} 음료`;
      description.textContent = '음료를 선택하면 데모 QR이 나타납니다.';
      content.className = 'drinks';
      for (const item of menu.filter(item => item.category === category)) {
        content.append(button(displayName(item), 'drink', () => { selected = item; render(); }));
      }
    } else {
      step.textContent = 'QR 보기';
      title.textContent = `${selected.category} ${displayName(selected)}`;
      description.textContent = `${site().name} ${device} 기기의 스캐너에 QR을 보여주세요.`;
      content.className = '';
      const panel = document.createElement('div'); panel.className = 'qr-panel';
      const img = document.createElement('img'); img.src = `qr/${selected.id}.svg`; img.alt = `${selected.category} ${displayName(selected)} 현장 데모 QR`;
      const label = document.createElement('strong'); label.textContent = '무료 음료 데모';
      const note = document.createElement('p'); note.textContent = '기기가 준비된 상태에서 사용해 주세요. 시간·횟수 제한 없이 사용할 수 있습니다.';
      panel.append(img, label, note); content.append(panel);
    }
    if (focus) title.focus();
  }

  function contextChanged() {
    fillPickers();
    syncUrl();
    renderStatus();
    render(mode === 'demo');
    emit('side-change', device);
  }

  sitePicker.addEventListener('change', () => {
    siteId = sitePicker.value;
    category = null;
    selected = null;
    contextChanged();
  });
  devicePicker.addEventListener('change', () => {
    device = devicePicker.value;
    contextChanged();
  });
  back.addEventListener('click', () => { if (selected) selected = null; else category = null; render(); });

  // 모드 전환: 데모 화면은 그대로 두고 표시만 바꾼다.
  const modeSections = { demo: document.querySelector('#demo-mode'), receipt: document.querySelector('#receipt-mode') };
  const modeTabs = { demo: document.querySelector('#mode-demo'), receipt: document.querySelector('#mode-receipt') };
  function setMode(next, focus = true) {
    mode = next;
    for (const key of Object.keys(modeSections)) {
      modeSections[key].hidden = key !== mode;
      modeTabs[key].setAttribute('aria-pressed', String(key === mode));
      modeTabs[key].classList.toggle('active', key === mode);
    }
    renderStatus();
    emit('mode-change', mode);
    if (focus) (mode === 'demo' ? title : document.querySelector('#receipt-title')).focus();
  }
  for (const key of Object.keys(modeTabs)) modeTabs[key].addEventListener('click', () => setMode(key));
  window.DEMO_SHELL = {
    get mode() { return mode; },
    get device() { return device; },
    get siteId() { return siteId; },
    get site() { return site(); },
    availability,
    setMode,
  };
  fillPickers();
  setMode('demo', false);
  render(false);
})();
