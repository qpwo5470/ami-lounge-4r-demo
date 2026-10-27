# 영수증 QR 모드(실 전송) 구현 계획

대상 이슈: [ami-lounge-4r-demo#1](https://github.com/qpwo5470/ami-lounge-4r-demo/issues/1) · 서버 계약: qpwo5470/408d_web#103

이 문서는 코드 작성 전에 작성한 계획이며, 결과는 `docs/RESUME.md`에 기록한다.

## 범위

같은 정적 Pages 사이트에 두 번째 모드를 추가한다.

1. `DEMO`(기존, 기본값): 무료 반복 데모 QR. UI/동작/`qr/*.svg` 29개를 그대로 유지한다. 자산은 바이트 동일.
2. `RECEIPT`(신규): 실제 운영 `receiveKioskSale`에 키오스크 v3와 동일한 정상 인증 POST를 보내고, 서버가 `ACCEPTED` 또는 `ALREADY_RECEIVED`로 응답한 뒤에만 1회용 영수증 QR을 로컬에서 생성한다.

새 관리자 엔드포인트, 가짜 우회, Firestore 직접 접근, 테스트 엔드포인트는 사용하지 않는다. 서버 코드 변경은 이 저장소 밖(루트에서 Pages origin CORS 허용)에서 처리한다.

## 요청 계약

- `POST https://asia-northeast3-cuppy-408d.cloudfunctions.net/receiveKioskSale/receiveKioskSale`
- 헤더: `Content-Type: application/json`, `X-Kiosk-Source: <sourceId>`(기본 `kis-N61605`, 일반 텍스트로 수정 가능), `Authorization: Bearer <사용자 입력 키>`
- 본문(불변 1건):

```
STORE_CD        N61605
POS_NO          01 | 02        (기본 L=01, R=02)
BILL_NO         4자리           (기본 9000..9999 고범위 카운터, 화면에서 수정 가능)
TRANSACTION_ID  YYYYMMDD-HH:MM:SS:cc   (KST, cc=1/100초)
APPROVAL_NUM    DEMO- 접두 합성 식별자
PAYMENT_METHOD  CARD
PRODUCT[0]      PAY_SEQ 01, PROD_CD/MAP_PROD_CD = productCode, PROD_NM = name,
                TAX_YN Y, SALE_AMT = price,
                QR_PAYLOAD = STORE_CD|POS_NO|KST YYYYMMDD|BILL_NO|01|productCode
```

합계 필드는 작업 지시에 포함되지 않아 넣지 않는다(필요 시 코디네이터가 #103 기준으로 추가 지시). 메뉴 값(`menuItemId`, `name`, `category`, `price`, `productCode`)은 `receipt-catalog.json`의 **선택한 L/R 쪽 값을 그대로** 사용한다. 이 카탈로그가 현재 판매중 29종의 검증 기준이므로 영수증 모드의 메뉴 목록도 카탈로그에서 직접 만든다(기존 `menu.js`의 표기 2건이 카탈로그와 다르므로 데모 모드만 `menu.js`를 계속 사용).

## 키 취급

- `type=password` 입력으로만 받고 메모리 변수에만 보관한다. 적용 후 입력 DOM 값을 지운다.
- 저장/프리필/로그/화면표시/스크린샷 금지. `localStorage`에는 비밀이 아닌 값(영수증 카운터, sourceId, POS, 모드)만 넣는다.
- 같은 페이지 안에서 메뉴/카테고리/면(L/R)을 바꿔도 키는 유지된다. 새로고침하면 다시 입력한다.

## 식별자와 재시도 규칙

- "전송" 1회 = 불변 attempt 1개. 본문/시각/QR 페이로드를 만든 뒤 변경하지 않는다.
- 네트워크 오류·503 재시도는 **완전히 같은 본문**을 다시 보낸다. 실패해도 BILL_NO/TRANSACTION_ID/APPROVAL_NUM을 자동 변경하지 않는다.
- 409(중복)는 화면에 그대로 오류로 노출한다. 자동 재할당 없음.
- 전송 중에는 버튼을 비활성화해 중복 클릭을 막는다.
- 401/400/409/503/네트워크 불확실, 그리고 2xx라도 응답 코드가 수락이 아니면 QR을 만들지 않는다.
- 면/메뉴/모드/POS/영수증번호/sourceId 변경, 새 전송 시작 시 직전 성공 QR을 즉시 지운다.

## 영수증 번호 기본값

영업일(KST)·POS별로 `localStorage`에 마지막 할당값을 두고 9000..9999에서 다음 값을 기본 제시한다(실제 키오스크 영수증 번호와 겹치지 않게 고범위 사용). 사용자가 직접 수정 가능하며 자동 변경은 새 attempt를 만들 때만 한다.

## QR 생성

- 로컬 vendoring: `vendor/qrcode-generator/qrcode.js` (qrcode-generator 2.0.4, MIT, Kazuhiko Arase). CDN/외부 요청 없음. 직접 QR 인코딩 구현하지 않음.
- 모듈 비트에서 `document.createElementNS`로 SVG를 만든다(`innerHTML` 미사용).
- CSP: `script-src 'self'`, `connect-src`는 수신 엔드포인트 origin만, `img-src 'self'`, `default-src 'none'`.

## 화면 문구

영수증 모드는 "운영 판매/교환권 기록이 실제로 생성되며 카드 결제(실제 과금)는 발생하지 않는다", "무료 반복 데모와 다른 1회용"임을 명시한다.

## 테스트

- Node: `tests/receipt-core.test.mjs` — 계약 필드, KST 날짜/시각 포맷, 4자리 영수증, QR 페이로드, 불변 재시도 본문 동일성, 응답 분류(수락/오류), 카탈로그 29종 L/R 매핑.
- 브라우저(Playwright, fetch 모킹 `page.route`): 영수증 모드 성공/401/409/503/네트워크오류 경로, QR 미생성, stale QR 제거, 이중 클릭 방지, 키 미저장, 그리고 기존 DEMO 경로 회귀.
- 실제 운영 엔드포인트로의 fetch는 테스트에서 수행하지 않는다. 배포/스모크는 코디네이터가 담당.
