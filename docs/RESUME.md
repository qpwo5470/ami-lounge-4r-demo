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
