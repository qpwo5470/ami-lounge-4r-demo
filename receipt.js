/* 실제 영수증 QR 모드. 키오스크와 동일한 정상 인증 판매 전송을 보내고,
   서버가 수락한 뒤에만 1회용 QR을 로컬에서 만든다. 인증 키는 메모리에만 둔다. */
(() => {
  'use strict';
  const core = window.RECEIPT_CORE;
  const shell = window.DEMO_SHELL;
  const SVG_NS = 'http://www.w3.org/2000/svg';
  const DEFAULT_POS = { L: '01', R: '02' };
  const STALE_NOTE = '설정이 바뀌어 진행 중이던 이전 요청의 결과는 표시하지 않습니다. 그 요청은 서버에 기록되었을 수 있습니다.';
  const el = id => document.querySelector(`#${id}`);
  const keyInput = el('auth-key');
  const applyKey = el('auth-apply');
  const clearKey = el('auth-clear');
  const keyState = el('auth-state');
  const sourceInput = el('source-id');
  const posSelect = el('pos-no');
  const billInput = el('bill-no');
  const storeOutput = el('store-cd');
  const categoryTabs = document.querySelector('.category-tabs');
  const drinks = el('receipt-drinks');
  const selectedBox = el('receipt-selected');
  const sendButton = el('receipt-send');
  const retryButton = el('receipt-retry');
  const statusText = el('receipt-status');
  const errorBox = el('receipt-error');
  const resultBox = el('receipt-result');

  let authKey = '';            // 메모리 전용. 저장·표시·기록하지 않는다.
  let side = shell.device;
  let category = 'HOT';
  let selected = null;
  let attempt = null;          // 직전에 만든 불변 요청
  let inFlight = false;
  let billNoDirty = false;     // 사용자가 직접 입력한 번호는 자동 변경하지 않는다
  let generation = 0;          // 화면 맥락 세대. 응답은 자기 세대에서만 표시한다.

  // 선택한 매장의 카탈로그. 준비 중(기기 미등록·매핑 없음·매장코드 미확인)이면 메뉴를 비우고 전송을 막는다.
  const site = () => shell.site;
  const receiptReady = () => shell.availability(shell.siteId, side, 'receipt').ready;
  function applySite() {
    storeOutput.textContent = site().storeCd || '미확인';
    sourceInput.value = site().sourceId || '';
  }
  applySite();

  const sideMenus = () => (receiptReady() ? site().devices[side].menus : [])
    .slice()
    .sort((a, b) => a.productCode.localeCompare(b.productCode));
  const businessDate = () => core.kstParts(new Date()).businessDate;

  function refreshBillNoDefault() {
    if (billNoDirty) return;
    billInput.value = core.nextBillNo(window.localStorage, businessDate(), posSelect.value);
  }

  /* 직전 성공 QR은 면/메뉴/모드/식별자 변경과 새 전송 시작 때 즉시 지운다. */
  function clearResult(keepRetry = false) {
    resultBox.hidden = true;
    resultBox.replaceChildren();
    if (!keepRetry) {
      errorBox.hidden = true;
      errorBox.replaceChildren();
      retryButton.hidden = true;
      attempt = null;
      statusText.textContent = '';
    }
  }

  /* 기기·모드·메뉴·식별자가 바뀌면 그 전에 보낸 요청의 응답은 지금 화면의 것이 아니다.
     요청 자체는 중단하지 않고(수락되었을 수 있으므로) 표시만 무효로 한다. */
  function invalidateContext() {
    generation += 1;
    clearResult();
    if (inFlight) statusText.textContent = STALE_NOTE;
  }

  function updateSendState() {
    const ready = Boolean(authKey) && Boolean(selected) && !inFlight && receiptReady();
    sendButton.disabled = !ready;
    retryButton.disabled = inFlight || !receiptReady();
    for (const node of [sourceInput, posSelect, billInput, keyInput, applyKey, clearKey]) node.disabled = inFlight;
    sourceInput.disabled = inFlight || !receiptReady();
    for (const node of drinks.children) node.disabled = inFlight;
    for (const node of categoryTabs.children) node.disabled = inFlight;
  }

  function renderCategories() {
    categoryTabs.replaceChildren();
    for (const name of ['HOT', 'ICE']) {
      const count = sideMenus().filter(item => item.category === name).length;
      const node = document.createElement('button');
      node.type = 'button';
      node.className = `category-tab${name === category ? ' active' : ''}`;
      node.textContent = `${name} ${count}종`;
      node.setAttribute('aria-pressed', String(name === category));
      node.addEventListener('click', () => {
        if (category === name) return;
        category = name;
        selected = null;
        invalidateContext();
        renderCategories();
        renderDrinks();
        renderSelected();
        updateSendState();
      });
      categoryTabs.append(node);
    }
  }

  function renderDrinks() {
    drinks.replaceChildren();
    if (!receiptReady()) {
      const state = shell.availability(shell.siteId, side, 'receipt');
      const panel = document.createElement('div');
      panel.className = 'blocked-panel';
      panel.textContent = `${site().name} ${side} 기기는 영수증 QR 준비 중입니다 (사유: ${state.reason}). 전송할 수 없습니다.`;
      drinks.append(panel);
      return;
    }
    for (const item of sideMenus().filter(menu => menu.category === category)) {
      const node = document.createElement('button');
      node.type = 'button';
      node.className = `drink${selected && selected.productCode === item.productCode ? ' active' : ''}`;
      node.dataset.productCode = item.productCode;
      node.textContent = `${item.name} · ${item.price.toLocaleString('ko-KR')}원`;
      node.addEventListener('click', () => {
        selected = item;
        invalidateContext();
        refreshBillNoDefault();
        renderDrinks();
        renderSelected();
        updateSendState();
      });
      drinks.append(node);
    }
  }

  function renderSelected() {
    selectedBox.replaceChildren();
    selectedBox.hidden = !selected;
    if (!selected) return;
    const rows = [
      ['메뉴', `${selected.category} ${selected.name}`],
      ['상품코드', selected.productCode],
      ['menuItemId', String(selected.menuItemId)],
      ['금액', `${selected.price.toLocaleString('ko-KR')}원`],
      ['기기', `${site().devices[side].name} (${side})`],
    ];
    selectedBox.append(definitionList(rows));
  }

  function definitionList(rows) {
    const list = document.createElement('dl');
    for (const [label, value] of rows) {
      const dt = document.createElement('dt'); dt.textContent = label;
      const dd = document.createElement('dd'); dd.textContent = value;
      list.append(dt, dd);
    }
    return list;
  }

  function renderQr(text) {
    const qr = window.qrcode(0, 'M');
    qr.addData(text);
    qr.make();
    const count = qr.getModuleCount();
    const margin = 4;
    const size = count + margin * 2;
    const svg = document.createElementNS(SVG_NS, 'svg');
    svg.setAttribute('viewBox', `0 0 ${size} ${size}`);
    svg.setAttribute('class', 'receipt-qr');
    svg.setAttribute('shape-rendering', 'crispEdges');
    svg.setAttribute('role', 'img');
    svg.setAttribute('aria-label', '영수증 QR');
    const background = document.createElementNS(SVG_NS, 'rect');
    background.setAttribute('width', String(size));
    background.setAttribute('height', String(size));
    background.setAttribute('fill', '#ffffff');
    svg.append(background);
    let path = '';
    for (let row = 0; row < count; row += 1) {
      for (let col = 0; col < count; col += 1) {
        if (qr.isDark(row, col)) path += `M${col + margin} ${row + margin}h1v1h-1z`;
      }
    }
    const modules = document.createElementNS(SVG_NS, 'path');
    modules.setAttribute('d', path);
    modules.setAttribute('fill', '#111111');
    svg.append(modules);
    return svg;
  }

  function showError(verdict) {
    errorBox.replaceChildren();
    const title = document.createElement('strong');
    title.textContent = verdict.status ? `전송 실패 (HTTP ${verdict.status})` : '전송 실패';
    const message = document.createElement('p');
    message.textContent = verdict.message;
    errorBox.append(title, message);
    if (verdict.code) {
      const code = document.createElement('p');
      code.textContent = `응답 코드: ${verdict.code}`;
      errorBox.append(code);
    }
    const note = document.createElement('p');
    note.textContent = '영수증 번호·거래시각·승인번호는 자동으로 바뀌지 않습니다. 같은 요청으로만 재시도합니다.';
    errorBox.append(note);
    errorBox.hidden = false;
    errorBox.dataset.kind = verdict.kind;
  }

  function showSuccess(verdict, sent) {
    resultBox.replaceChildren();
    const heading = document.createElement('strong');
    heading.textContent = '1회용 영수증 QR';
    const qr = renderQr(sent.qrPayload);
    const payload = document.createElement('code');
    payload.className = 'payload';
    payload.textContent = sent.qrPayload;
    const info = definitionList([
      ['응답 코드', verdict.code],
      ['HTTP', String(verdict.status)],
      ['매장/POS', `${sent.body.STORE_CD} / ${sent.body.POS_NO}`],
      ['영수증 번호', sent.body.BILL_NO],
      ['거래시각(KST)', sent.body.TRANSACTION_ID],
      ['승인번호', sent.body.APPROVAL_NUM],
      ['상품', `${sent.body.PRODUCT[0].PROD_NM} (${sent.body.PRODUCT[0].PROD_CD}) ${sent.body.PRODUCT[0].SALE_AMT.toLocaleString('ko-KR')}원`],
    ]);
    const note = document.createElement('p');
    note.textContent = '한 번만 사용할 수 있는 QR입니다. 다른 메뉴를 고르거나 모드를 바꾸면 사라집니다.';
    resultBox.append(heading, qr, payload, info, note);
    resultBox.hidden = false;
  }

  async function send(request, isRetry) {
    if (inFlight) return;
    inFlight = true;
    const requestGeneration = generation;
    updateSendState();
    statusText.textContent = isRetry ? '같은 요청 재전송 중…' : '전송 중…';
    let verdict;
    try {
      const response = await fetch(request.endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Kiosk-Source': request.sourceId,
          Authorization: `Bearer ${authKey}`,
        },
        body: request.serializedBody,
      });
      let data = null;
      let parsed = false;
      try {
        data = JSON.parse(await response.text());
        parsed = true;
      } catch (_) { /* 비JSON 응답은 불확실로 처리 */ }
      verdict = core.classifyResponse({ status: response.status, data, parsed });
    } catch (_) {
      verdict = core.classifyResponse({ networkError: true });
    }
    inFlight = false;
    // 응답이 도착하기 전에 맥락이 바뀌었으면 QR도 오류도 표시하지 않는다.
    if (requestGeneration !== generation) {
      statusText.textContent = STALE_NOTE;
      updateSendState();
      return;
    }
    statusText.textContent = verdict.ok ? '서버 수락됨' : '전송 실패';
    if (verdict.ok) {
      errorBox.hidden = true;
      errorBox.replaceChildren();
      retryButton.hidden = true;
      showSuccess(verdict, request);
    } else {
      clearResult(true);
      showError(verdict);
      retryButton.hidden = false;
    }
    updateSendState();
  }

  sendButton.addEventListener('click', () => {
    if (inFlight || !selected || !authKey || !receiptReady()) return;
    invalidateContext();
    refreshBillNoDefault();
    let request;
    try {
      request = core.buildAttempt({
        menu: selected,
        storeCd: site().storeCd,
        posNo: posSelect.value,
        billNo: billInput.value.trim(),
        sourceId: sourceInput.value,
        now: new Date(),
      });
    } catch (error) {
      showError({ kind: 'input', code: '', message: error.message, retryable: false });
      return;
    }
    attempt = request;
    core.markBillNoUsed(window.localStorage, request.businessDate, request.body.POS_NO, request.body.BILL_NO);
    billNoDirty = false;
    send(request, false);
  });

  retryButton.addEventListener('click', () => {
    if (!attempt || inFlight || !receiptReady()) return;
    send(attempt, true);
  });

  applyKey.addEventListener('click', () => {
    const value = keyInput.value.trim();
    if (!value) {
      keyState.textContent = '키 없음';
      return;
    }
    authKey = value;
    keyInput.value = '';
    keyState.textContent = '키 적용됨 (메모리 전용)';
    invalidateContext();
    updateSendState();
  });

  clearKey.addEventListener('click', () => {
    authKey = '';
    keyInput.value = '';
    keyState.textContent = '키 없음';
    invalidateContext();
    updateSendState();
  });

  keyInput.addEventListener('keydown', event => {
    if (event.key === 'Enter') { event.preventDefault(); applyKey.click(); }
  });

  billInput.addEventListener('input', () => {
    billInput.value = billInput.value.replace(/\D/g, '').slice(0, 4);
    billNoDirty = true;
    invalidateContext();
  });
  posSelect.addEventListener('change', () => { billNoDirty = false; invalidateContext(); refreshBillNoDefault(); });
  sourceInput.addEventListener('input', () => invalidateContext());

  document.addEventListener('side-change', event => {
    side = event.detail;
    selected = null;
    invalidateContext();
    applySite();
    posSelect.value = DEFAULT_POS[side] || '01';
    billNoDirty = false;
    refreshBillNoDefault();
    renderCategories();
    renderDrinks();
    renderSelected();
    updateSendState();
  });

  document.addEventListener('mode-change', () => {
    invalidateContext();
    refreshBillNoDefault();
    updateSendState();
  });

  posSelect.value = DEFAULT_POS[side] || '01';
  refreshBillNoDefault();
  renderCategories();
  renderDrinks();
  renderSelected();
  updateSendState();
  window.RECEIPT_MODE = {
    get hasKey() { return Boolean(authKey); },
    get attempt() { return attempt; },
    get inFlight() { return inFlight; },
  };
})();
