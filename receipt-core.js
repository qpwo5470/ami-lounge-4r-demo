/* 영수증 QR 모드 공통 로직. 브라우저(window.RECEIPT_CORE)와 Node(module.exports) 양쪽에서 쓴다.
   비밀 값(인증 키)은 이 파일에서 다루지 않는다. 본문/식별자 생성과 응답 분류만 담당한다. */
(root => {
  'use strict';
  const ENDPOINT = 'https://asia-northeast3-cuppy-408d.cloudfunctions.net/receiveKioskSale/receiveKioskSale';
  const BILL_NO_MIN = 9000;
  const BILL_NO_MAX = 9999;
  const ACCEPTED_CODES = ['ACCEPTED', 'ALREADY_RECEIVED'];
  const KST_OFFSET_MS = 9 * 60 * 60 * 1000;
  const pad = (value, size) => String(value).padStart(size, '0');

  /* KST 기준 영업일/시각 조각. Date 객체는 UTC 밀리초만 쓰므로 실행 환경 타임존과 무관하다. */
  function kstParts(now) {
    const kst = new Date(now.getTime() + KST_OFFSET_MS);
    const businessDate = `${kst.getUTCFullYear()}${pad(kst.getUTCMonth() + 1, 2)}${pad(kst.getUTCDate(), 2)}`;
    const hh = pad(kst.getUTCHours(), 2);
    const mm = pad(kst.getUTCMinutes(), 2);
    const ss = pad(kst.getUTCSeconds(), 2);
    const cc = pad(Math.floor(kst.getUTCMilliseconds() / 10), 2);
    return { businessDate, hh, mm, ss, cc };
  }

  const formatTransactionId = parts => `${parts.businessDate}-${parts.hh}:${parts.mm}:${parts.ss}:${parts.cc}`;

  /* DEMO- 접두 합성 승인번호. 실제 카드 승인번호가 아니며 attempt 시각에서 결정된다. */
  const buildApprovalNum = parts =>
    `DEMO-${parts.businessDate.slice(2)}${parts.hh}${parts.mm}${parts.ss}${parts.cc}`;

  const buildQrPayload = ({ storeCd, posNo, businessDate, billNo, paySeq, productCode }) =>
    [storeCd, posNo, businessDate, billNo, paySeq, productCode].join('|');

  function validate({ storeCd, posNo, billNo, sourceId, menu }) {
    const errors = [];
    if (!/^[A-Z0-9]+$/.test(String(storeCd || ''))) errors.push('매장 코드가 올바르지 않습니다.');
    if (!/^\d{2}$/.test(String(posNo || ''))) errors.push('POS 번호는 2자리입니다.');
    if (!/^\d{4}$/.test(String(billNo || ''))) errors.push('영수증 번호는 4자리 숫자입니다.');
    if (!String(sourceId || '').trim()) errors.push('소스 ID를 입력해 주세요.');
    if (!menu || !menu.productCode || !menu.name || !(menu.price > 0)) errors.push('메뉴를 선택해 주세요.');
    return errors;
  }

  /* 전송 1회 = 불변 attempt 1개. 재시도는 이 결과를 그대로 다시 쓴다. */
  function buildAttempt({ menu, storeCd, posNo, billNo, sourceId, now }) {
    const errors = validate({ storeCd, posNo, billNo, sourceId, menu });
    if (errors.length) throw new Error(errors.join(' '));
    const parts = kstParts(now || new Date());
    const paySeq = '01';
    const qrPayload = buildQrPayload({
      storeCd, posNo, businessDate: parts.businessDate, billNo, paySeq, productCode: menu.productCode,
    });
    const body = {
      STORE_CD: storeCd,
      POS_NO: posNo,
      BILL_NO: billNo,
      TRANSACTION_ID: formatTransactionId(parts),
      APPROVAL_NUM: buildApprovalNum(parts),
      PAYMENT_METHOD: 'CARD',
      PRODUCT: [{
        PAY_SEQ: paySeq,
        PROD_CD: menu.productCode,
        PROD_NM: menu.name,
        MAP_PROD_CD: menu.productCode,
        TAX_YN: 'Y',
        SALE_AMT: menu.price,
        QR_PAYLOAD: qrPayload,
      }],
    };
    return Object.freeze({
      endpoint: ENDPOINT,
      sourceId: String(sourceId).trim(),
      businessDate: parts.businessDate,
      qrPayload,
      menuItemId: menu.menuItemId,
      serializedBody: JSON.stringify(body),
      body: Object.freeze(body),
    });
  }

  /* 응답 코드 추출: 서버가 code/status/result 중 무엇으로 주더라도 수락 여부만 본다. */
  function extractCode(data) {
    if (!data || typeof data !== 'object') return '';
    for (const key of ['code', 'status', 'result', 'resultCode', 'message']) {
      const value = data[key];
      if (typeof value === 'string' && value.trim()) return value.trim().toUpperCase();
    }
    return '';
  }

  function classifyResponse({ networkError, status, data, parsed }) {
    if (networkError) {
      return { ok: false, kind: 'network', code: '', retryable: true, message: '네트워크 오류로 결과를 알 수 없습니다. 같은 요청을 다시 보낼 수 있습니다.' };
    }
    const code = extractCode(data);
    if (status === 401 || status === 403) {
      return { ok: false, kind: 'auth', code, status, retryable: true, message: '인증 실패(401/403). 키를 확인한 뒤 같은 요청을 다시 보내세요.' };
    }
    if (status === 409) {
      return { ok: false, kind: 'conflict', code, status, retryable: true, message: '영수증 번호 중복(409). 번호는 자동 변경하지 않습니다. 직접 확인해 주세요.' };
    }
    if (status === 400 || status === 422) {
      return { ok: false, kind: 'bad_request', code, status, retryable: true, message: '요청이 거부되었습니다(400). 본문 값을 확인해 주세요.' };
    }
    if (status >= 500) {
      return { ok: false, kind: 'server', code, status, retryable: true, message: '서버 오류(5xx). 같은 본문으로 재시도할 수 있습니다.' };
    }
    if (status < 200 || status >= 300) {
      return { ok: false, kind: 'http', code, status, retryable: true, message: `처리되지 않았습니다(HTTP ${status}).` };
    }
    if (!parsed) {
      return { ok: false, kind: 'ambiguous', code, status, retryable: true, message: '응답을 해석할 수 없어 수락 여부가 불확실합니다. QR을 만들지 않습니다.' };
    }
    if (ACCEPTED_CODES.includes(code)) {
      return { ok: true, kind: 'accepted', code, status, retryable: false, message: '서버가 수락했습니다.' };
    }
    return { ok: false, kind: 'rejected', code, status, retryable: true, message: `서버가 수락하지 않았습니다(${code || '코드 없음'}).` };
  }

  /* 영업일/POS별 영수증 번호 카운터. 비밀이 아닌 값만 저장한다. */
  const counterKey = (businessDate, posNo) => `receipt-mode:billno:${businessDate}:${posNo}`;

  function nextBillNo(storage, businessDate, posNo) {
    let last = NaN;
    try {
      last = parseInt(storage.getItem(counterKey(businessDate, posNo)), 10);
    } catch (_) { /* 저장소 접근 불가 시 범위 시작값 사용 */ }
    const candidate = Number.isFinite(last) ? last + 1 : BILL_NO_MIN;
    return pad(Math.min(Math.max(candidate, BILL_NO_MIN), BILL_NO_MAX), 4);
  }

  function markBillNoUsed(storage, businessDate, posNo, billNo) {
    const used = parseInt(billNo, 10);
    if (!Number.isFinite(used)) return;
    try {
      const last = parseInt(storage.getItem(counterKey(businessDate, posNo)), 10);
      const next = Number.isFinite(last) ? Math.max(last, used) : used;
      storage.setItem(counterKey(businessDate, posNo), String(next));
    } catch (_) { /* 저장 실패는 전송을 막지 않는다 */ }
  }

  const api = {
    ENDPOINT, BILL_NO_MIN, BILL_NO_MAX, ACCEPTED_CODES,
    kstParts, formatTransactionId, buildApprovalNum, buildQrPayload,
    validate, buildAttempt, extractCode, classifyResponse,
    counterKey, nextBillNo, markBillNoUsed,
  };
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.RECEIPT_CORE = api;
})(typeof window === 'object' ? window : null);
