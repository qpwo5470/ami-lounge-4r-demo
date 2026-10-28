# 포병여단 L/R 데모 QR 복구

요청/검증 기준: [408d#291](https://github.com/qpwo5470/408d/issues/291).

같은 29개 무료 반복 DEMO QR을 포병여단 L/R 두 기기에서 사용한다. 각 기기의 현재 판매중 메뉴는 HOT13/ICE16이며, 일반 아메리카노만 L(고소)/R(산미)를 표시한다. 다른 메뉴에서 원두 표기를 제거한다. 영수증 QR 및 관리자 QR은 별개다.

## 역할과 계획

- 이 저장소: L/R 선택과 현재 메뉴 이름 안내, 기존 QR 이미지/토큰 보존, 모바일 선택/뒤로가기/QR 경로 검증. 기존 GitHub Pages URL 유지. 앱 준비 전 배포하지 않는다.
- 앱/기기: 기존 담당 Codex 작업 `아미라운지 메뉴 QR 수정`에서 최신 앱 기능 보존, 양쪽29개 데모 바인딩 및 재로드 검증. 앱/기기 변경은 이 저장소에 포함하지 않는다.
- 실제 스캔 및 물리 제조는 사용자 현장에서 확인하며 웹페이지 열림/QR 해독만으로 제조 성공을 주장하지 않는다.

## 확인 및 재개

정적 사이트로 빌드 의존성 없음. `python3 -m http.server 8766` 후 브라우저에서 L/R × HOT/ICE 선택, 메뉴29개, 뒤로가기, SVG29개 로딩을 확인한다. QR 원본은 `qr/drink-01.svg`부터29개이며 변경하지 않는다. 기능 테스트나 브라우저 도구는 개발 환경에 설치된 것을 사용하고 사이트에 새 의존성을 추가하지 않는다.

현재 단계: 페이지 수정 준비. 배포와 기기 상태는 완료 후 여기에 갱신한다. APK/원본 설정/비공개 토큰 대응안은 이 저장소에 없으며 현장 담당에게서 안전하게 재취득해야 한다. 공개 QR SVG 자체는 기존과 동일한 무료 음료용 코드다.

## Page implementation and local QA complete
- L/R picker (default L; ?device=R supported), exact Americano roast label, same QR29 assets. No token changes.
- Node syntax / git diff --check passed. Installed Chrome via Playwright: 58 side/category/drink/QR/back paths passed, HOT13+ICE16 each. QR image loading passed, mobile360x800 device switch and800x360 layout have no horizontal overflow; no browser page errors.
- Existing SVG29 payloads were separately decoded by native Vision before this change. No scanner input or manufacture sent.
- Await assigned app/device restoration evidence before pushing main (GitHub Pages auto-publishes).

## Release readiness verified
- Both exact target devices independently read back at1.0.44(9)-DEMO-ARMY, SHA256b81b606d23380eff57cbecf05d613ac9d57db3950d272cfea7753fbd40993443. Each existing29 QR tokens matches current local menu PK and name/47recipe-field fingerprint. L additional8 codes preserved byte-for-value. Both foreground OrderActivity.
- App owner reported all2490 executed unit tests passed (20 skipped), latest-field methods/classes and signer preserved, DB/schema/data and device connectivity verified. ADB install response loss was checked by installed version/hash instead of blindly repeated.
- Local page QA and independent device readback summary: verification-20261027.json. Private device backups/APK binaries are not in this repository.
- This release retains the original29 SVG files/token values and existing Pages URL. GitHub Pages publishes main/root. Live deployment evidence will be recorded in issue291 after push. Actual field scanner/physical manufacture remains unexecuted by automation.

## 실제 영수증 QR 모드 추가 (2026-10-27)

요청: [ami-lounge-4r-demo#1](https://github.com/qpwo5470/ami-lounge-4r-demo/issues/1) · 서버 계약: qpwo5470/408d_web#103 · 계획: `docs/receipt-mode-plan.md`.

- 같은 페이지에 모드 2개. `무료 반복 데모 QR`(기본)은 기존 화면/흐름 그대로이고 `qr/*.svg` 29개와 `menu.js`는 HEAD 대비 변경 없음(`git diff --quiet HEAD -- qr menu.js` 통과).
- `실제 영수증 QR` 모드는 키오스크 v3와 동일한 정상 인증 POST를 운영 엔드포인트(`receiveKioskSale/receiveKioskSale`)로 보내고, 서버 응답이 `ACCEPTED`/`ALREADY_RECEIVED`일 때만 1회용 QR을 로컬에서 만든다. 새 관리자 엔드포인트·우회·Firestore 직접 접근·테스트 엔드포인트 없음. 서버/CORS 변경은 이 저장소 밖.
- 본문: `STORE_CD/POS_NO/BILL_NO(4자리)/TRANSACTION_ID(KST YYYYMMDD-HH:MM:SS:cc)/APPROVAL_NUM(DEMO- 합성)/PAYMENT_METHOD CARD/PRODUCT[1]{PAY_SEQ 01, PROD_CD, PROD_NM, MAP_PROD_CD, TAX_YN Y, SALE_AMT, QR_PAYLOAD}`. 합계 필드는 지시에 없어 넣지 않았다(필요 시 #103 기준으로 추가 지시 필요).
- 메뉴 값은 `receipt-catalog.json`(L/R 각 29종, HOT13/ICE16)에서 선택한 면의 `menuItemId/name/price/productCode`를 그대로 쓴다. CSP `connect-src`가 수신 엔드포인트만 허용하므로 fetch 대신 `node tools/build-catalog.mjs`로 만든 `receipt-catalog.js`를 싣고, 테스트가 원본 JSON과 동기 여부를 검사한다.
- 인증 키는 password 입력 → 메모리 변수에만 보관(적용 후 입력값 삭제). 저장소/소스/로그/DOM 어디에도 남기지 않으며 프리필도 없다. 같은 페이지에서 면·카테고리·메뉴를 바꿔도 유지된다. `localStorage`에는 영업일·POS별 영수증 번호 카운터(9000~9999)만 저장한다.
- 전송 1회 = 불변 attempt. 네트워크/503 재시도는 같은 본문·시각·승인번호·QR 페이로드를 그대로 재전송하고, 409를 포함한 어떤 실패에서도 식별자를 자동 변경하지 않는다. 전송 중 버튼 비활성화로 중복 클릭을 막고, 401/400/409/503/비JSON/네트워크 오류에서는 QR을 만들지 않는다. 면·메뉴·모드·POS·영수증번호·소스ID 변경과 새 전송 시작 시 직전 QR을 즉시 지운다.
- QR 생성은 vendoring한 `vendor/qrcode-generator/qrcode.js`(qrcode-generator 2.0.4, MIT, sha256 79ec86f8…f791c)로 하고 SVG는 DOM API로 만든다. CDN·외부 요청 없음.

### 검증 결과 (로컬)

- `node --test "tests/*.test.mjs"`: 31개 전부 통과(계약 필드/KST 날짜넘김/4자리 영수증/카운터/불변 재시도/응답 분류/카탈로그 29종 + 브라우저 17종).
- 브라우저 테스트는 설치된 Chrome 156 + `playwright-core`(로컬 `.devtools/`, 커밋 제외)로 돌리며 fetch는 전부 모킹한다. Chrome을 `--host-resolver-rules=MAP * 0.0.0.0, EXCLUDE 127.0.0.1`로 띄워 운영 엔드포인트로 실제 요청이 나가는 것이 구조적으로 불가능하게 했다. **운영 서버로의 실제 호출은 없었다.**
- 성공 화면의 SVG QR을 독립 디코더(jsQR)로 읽어 `N61605|01|YYYYMMDD|9xxx|01|상품코드`와 일치함을 확인했다. 실제 스캐너/제조 확인은 현장 몫이다.
- `node --check` 전 스크립트 통과, `git diff --check` 통과, 모바일390/데스크톱1200 가로 오버플로 없음(스크린샷은 로컬 `.devtools/`에만 두고 커밋하지 않음, 테스트 키는 가짜 값).
- 배포/운영 수신 스모크는 코디네이터 몫. 이 작업에서는 push·배포·기기 조작·운영 쓰기를 하지 않았다.

### 지연 응답(stale) 수정 — 루트 브라우저 QA 지적 반영

루트 QA(`browser-qa.cjs`, 실제 Chrome·모킹 API)에서 하나가 실패했다: 전송 중(650ms 지연 성공) `#device`를 R→L로 바꾸면, 응답 도착 시 L이 선택된 화면에 **이전 R 요청의 QR**이 표시됐다. 원인은 `updateSendState()`가 공용 기기 선택/모드 탭은 잠그지 않는데, `send()`가 await 이후 맥락 무효화 여부와 무관하게 결과를 그렸기 때문이다.

- 수정: 화면 맥락 세대 카운터(`generation`)를 두고, 기기·모드·카테고리·메뉴·POS·영수증번호·소스ID·키 변경과 새 전송 시작에서 `invalidateContext()`로 세대를 올린다. `send()`는 시작 시 세대를 붙잡고, 응답 후 세대가 달라졌으면 QR도 오류도 그리지 않고 "이전 요청의 결과는 표시하지 않습니다(서버에 기록되었을 수 있음)" 안내만 남긴다.
- 진행 중 요청을 abort하거나 자동 재전송하지 않는다(수락되었을 수 있는 판매를 조용히 다시 보내지 않기 위함). 재시도는 맥락이 그대로일 때만 같은 불변 본문으로 가능하고, 맥락이 바뀌면 재시도 버튼이 사라진다. 본문 재생성 없음, 자동 재시도 없음, 401/400/409/503 뒤 QR 없음은 그대로다.
- 맥락이 바뀌어도 이전 요청이 끝날 때까지 전송 버튼은 계속 잠겨 이중 전송이 생기지 않는다.
- 회귀 테스트 추가: 전송 중 기기 변경 / 모드 변경 후 복귀 각각에서 지연 성공이 표시되지 않고 요청은 1건만 나가며, 지연 503도 오류 박스가 뜨지 않음, 맥락 유지 시 재시도가 같은 본문을 쓰는지까지 확인한다.
- `node --test "tests/*.test.mjs"`: 35개 전부 통과(연속 2회 동일). 데모 QR 이미지 검사는 `decode()` 대기로 바꿔 깜빡임을 없앴다. 운영 호출은 여전히 0건(Chrome DNS를 로컬로 고정). UI 문구/구조 변경은 상태 안내문 외에 없음.

## 다매장 지원 (2026-10-28)

- 화면: `매장`(6곳) + `사용할 기기`(L/R) 선택. 문구의 "포병여단" 하드코딩 제거(배지·제목·QR 안내가 선택 매장 이름을 따름). URL `?site=<id>&device=L|R`, 선택을 바꾸면 URL도 갱신. `?device=R`만 있는 기존 링크와 알 수 없는 site는 기본 매장(포병여단).
- 카탈로그: `receipt-catalog.json` schemaVersion 2 = `sites[]{id,name,storeCd,sourceId,devices{L|R: null | {id,name,roast,blocked{demo,receipt},menus[]}}}`. 생성: `node tools/fetch-catalog.mjs && node tools/build-catalog.mjs` (사용자 gcloud 토큰, Firestore 읽기 전용; kioskSalesSources는 enabled·allowedStores만 마스크로 요청). 매장 이름·데모 QR 연결 여부는 서버에 없어 `tools/sites.json`에서 관리.
- 준비 중 규칙: 기기 미등록 → 양쪽 모드 차단. 영수증 QR은 소스(kis-매장코드, enabled) 확인 + 표시 메뉴 중 매핑 29개 이상일 때만. 데모 QR은 `sites.json`의 `demoQr[side]`가 true(기기 앱에 DEMO_ 토큰 연결 확인)일 때만. 차단 시 QR·전송 모두 막고 사유 표시.
- 2026-10-28 생성 결과: 포병여단 L/R 데모·영수증 가능(N61605). 17대대 L/R 영수증 가능(N61742, 29매핑), 데모 QR 기기 연결 없음. 공병대대 N61766(기기 매핑의 STORE_CD 근거, kioskSales 6건) 매핑 2/29라 준비 중. 15여단·15여단 1대대·58대대 기기 미등록(N61649·N61745·N61747 중 어느 매장인지 미확인).
- 서버 가격 반영: 카라멜초코라떼 HOT(AL013H) 2300→2500 (포병여단 L/R).
- 17대대 데모 QR: 기기 prefs에 `local_demo_qr.xml` 없음(읽기 전용 확인). 연결은 지금까지 관리 화면/정식 도구가 아닌 run-as prefs 직접 쓰기(offline-demo setup.py, #291 복구)로만 만들어졌으므로 이번엔 적용하지 않음. 메뉴 id·이름·레시피는 포병여단과 같아 같은 29 토큰 재사용이 지문상 가능.
- 테스트: `node --test "tests/*.test.mjs"` 52개 통과(매장 전환, 준비 중 차단 4종, URL 파라미터, 카탈로그 스키마, 17대대 영수증 본문 N61742, 모바일 360/800 오버플로 없음). 운영 호출 0(모킹 + DNS 차단).

### 17대대 데모 QR 연결 (2026-10-28, 사용자 승인)

- 방식: #291/offline-demo와 같은 `run-as`로 `shared_prefs/local_demo_qr.xml` 작성(schemaVersion 2, enabled, device_id=해당 기기, 새 revision_id, parent 없음). 같은 29개 토큰 재사용, 지문은 기기 Room 메뉴 기준 `sha256(originalId␟categoryId␟name␟recipe…)`(포병여단 R 백업 prefs 29/29로 계산식 검증).
- 17대대 L(de8aface…): 29/29 연결, 아메리카노는 고소 메뉴. 백업 `~/408d-army-display/install-backup-17-L-20261028-201338/`. 앱 재시작 후 OrderActivity 대기 화면, FATAL 없음. → 사이트 데모 사용 켬.
- 17대대 R(b250e466…): 29/29 지문 계산 완료·백업 `install-backup-17-R-20261028-201553/`, 그러나 기기가 관리자 하드웨어 테스트(IceRush 모니터링) 화면이라 쓰기 보류. 사이트 R 데모는 준비 중 유지.
