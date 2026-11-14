# 댕댕여지도 · Pet Tour

반려동물과 함께 갈 장소를 찾고 여행 코스를 만드는 웹 앱입니다. 장소 검색·상세 지도·카카오맵 사진 보완·사진 우선 정렬·즐겨찾기·자동차 경로·동네 커뮤니티를 제공합니다.

## 필요한 프로그램

- **JDK 25**: `java --version`으로 확인합니다. `JAVA_HOME`을 설정한다면 JDK 25 설치 폴더를 지정합니다.
- **Node.js 24 LTS와 npm**: `node --version`, `npm --version`으로 확인합니다.
- **Git**: 소스를 내려받을 때 사용합니다.
- Gradle은 `backend`의 Wrapper로 실행하므로 별도 설치하지 않아도 됩니다. 별도 DB는 필요하지 않습니다.
- Python 3.10 이상은 원본 자료를 다시 정제할 때만 필요합니다. 정제된 데이터가 포함되어 있어 일반 실행에는 필요 없습니다.

## 처음 실행하기 · Windows PowerShell

```powershell
git clone https://github.com/sang-uk-jang/seoul_AI.git
cd seoul_AI
Copy-Item backend/.env.example backend/.env
Copy-Item frontend/.env.example frontend/.env.local
```

복사한 두 파일에 아래 환경변수의 키를 입력합니다. 실제 키를 넣은 파일은 Git에서 제외됩니다. 각 실행자는 자신의 키를 설정합니다.

터미널 1에서 백엔드를 실행합니다.

```powershell
cd backend
.\gradlew.bat bootRun
```

터미널 2에서는 프로젝트 루트에서 프런트엔드를 실행합니다.

```powershell
cd frontend
npm ci
npm run dev
```

브라우저에서 **http://localhost:5173** 또는 **http://127.0.0.1:5173**에 접속합니다. 백엔드는 기본 **http://localhost:8080**이며 프런트엔드가 `/api` 요청을 전달합니다. 처음 실행할 때 의존성을 다운로드하므로 시간이 걸릴 수 있습니다.

macOS/Linux에서는 `Copy-Item` 대신 `cp`, 백엔드 실행은 `cd backend` 후 `./gradlew bootRun`을 사용합니다.

## 환경변수

### `backend/.env`

```dotenv
TOUR_API_KEY=발급받은_한국관광공사_API_인증키
PORT=8080
KAKAO_PHOTOS_ENABLED=true
KAKAO_PHOTOS_CACHE_FILE=./data/kakao-photos.json
KAKAO_PHOTOS_MIN_INTERVAL_MS=1100
COMMUNITY_STORE=./data/community.json
```

| 변수 | 용도 | 기본값 / 필요 여부 |
| --- | --- | --- |
| `TOUR_API_KEY` | 한국관광공사 반려동물 동반여행 API `KorPetTourService2` 인증키 | 선택. 비워 두면 포함된 CSV·XLSX 자료로 실행됩니다. 관광공사 사진과 자료를 추가하려면 필요합니다. |
| `PORT` | 백엔드 포트 | `8080`. 변경하면 `frontend/vite.config.ts`의 프록시 주소와 공유 서버의 백엔드 포트도 맞춰야 합니다. |
| `KAKAO_PHOTOS_ENABLED` | 카카오맵 대표 사진 수집·캐시 사용 | `true`. `false`로 비활성화할 수 있습니다. |
| `KAKAO_PHOTOS_CACHE_FILE` | 수집한 사진 URL·출처 캐시 파일 | `./data/kakao-photos.json` |
| `KAKAO_PHOTOS_MIN_INTERVAL_MS` | 서버의 사진 수집 요청 시작 간격 | `1100`밀리초 |
| `COMMUNITY_STORE` | 커뮤니티 프로필·게시글·댓글·대화 저장 파일 | `./data/community.json` |

백엔드는 실행 위치가 프로젝트 루트 또는 `backend`일 때 `.env`를 읽습니다. 같은 이름의 운영체제 환경변수가 있으면 그 값이 우선합니다. 저장 경로는 백엔드 프로세스의 실행 폴더를 기준으로 해석됩니다. 설정 변경 후 백엔드를 재시작합니다.

인증키는 [공공데이터포털](https://www.data.go.kr/)에서 `한국관광공사 반려동물 동반여행 서비스`를 찾아 활용 신청 후 발급받습니다. 일반 인증키의 디코딩 값과 인코딩 값 모두 처리합니다.

### `frontend/.env.local`

```dotenv
VITE_KAKAO_MAP_APP_KEY=발급받은_카카오_JavaScript_키
VITE_ROUTING_BASE_URL=https://router.project-osrm.org
```

| 변수 | 용도 | 기본값 / 필요 여부 |
| --- | --- | --- |
| `VITE_KAKAO_MAP_APP_KEY` | 카카오 일반지도·주소 검색·사진 수집용 장소 검색 | 해당 기능을 이용하려면 필요합니다. **JavaScript 키**를 사용합니다. REST API 키는 필요하지 않습니다. |
| `VITE_ROUTING_BASE_URL` | OSRM 호환 자동차 경로 서버 | `https://router.project-osrm.org`. 운영 트래픽에는 전용 서버를 설정합니다. |

키가 없어도 로컬 장소 목록과 커뮤니티는 실행할 수 있습니다. 지도·주소 조회·새 카카오맵 사진 검색은 키 설정 후 사용할 수 있습니다. `VITE_` 변수는 브라우저 번들에 포함되므로 서버용 비밀키를 넣지 않습니다.

[Kakao Developers](https://developers.kakao.com/)에서 앱을 만들고 JavaScript 키를 발급받습니다. 카카오맵 사용 설정을 활성화하고 해당 키의 JavaScript SDK 도메인에 다음 주소를 등록합니다.

```text
http://localhost:5173
http://127.0.0.1:5173
```

다른 포트·Tailscale 주소·배포 도메인으로 접속하면 **실제로 브라우저에 입력하는 주소의 프로토콜·호스트·포트**를 추가합니다. 주소가 정해지기 전에는 로컬 주소만 등록해도 됩니다. 상세 설정은 [카카오 지도 Web 가이드](https://apis.map.kakao.com/web/guide/)를 참고하세요.

프런트엔드 환경변수 변경 후 개발 서버를 재시작합니다. 빌드 파일을 공유 중이면 `npm run build`도 다시 실행합니다.

## 테스트와 빌드

백엔드:

```powershell
cd backend
.\gradlew.bat test
.\gradlew.bat bootJar
```

프런트엔드:

```powershell
cd frontend
npm test
npm run build
```

프런트엔드 빌드 결과는 `frontend/dist`, 백엔드 실행 JAR는 `backend/build/libs`에 생성됩니다. 일반 테스트는 외부 카카오 페이지를 수집하지 않습니다. 실제 공개 페이지 수집 확인은 별도로 `PET_TOUR_LIVE_PHOTO_TEST=true`를 설정한 뒤 백엔드 테스트를 실행합니다.

## Tailscale 등으로 공유하기

백엔드를 8080 포트로 실행하고 프런트엔드를 빌드한 뒤 프로젝트 루트에서 다음 명령을 실행합니다.

```powershell
node scripts/share-preview.mjs
```

공유 서버는 **http://127.0.0.1:4174**에서 빌드 파일과 허용된 API를 제공합니다. Tailscale Serve 등에서 이 주소로 프록시하고, 생성된 HTTPS 주소를 카카오 JavaScript SDK 도메인에 추가합니다. 커뮤니티 API와 사진 수집 요청도 같은 주소로 전달됩니다. 단순 정적 파일 서버만 사용하면 `/api`가 연결되지 않습니다.

Vite 개발 서버는 기본적으로 로컬에서만 접속합니다. 외부 공유 시 위 공유 서버를 프록시하는 방식을 사용합니다. 현재 위치 기능은 HTTPS 또는 localhost에서 사용할 수 있습니다. 자세한 임시 공유 절차는 [SHARE.md](SHARE.md)를 참고하세요.

## 3D 아바타 스튜디오

상단 **3D 아바타** 탭을 열면 선택한 품종·모델의 실제 GLB 모델을 바로 표시합니다. 강아지·고양이 선택 후 품종·모델 메뉴에서 각각 다른 GLB를 선택합니다. 현재 말티즈, 골든 리트리버, 믹스견, 버니즈 마운틴 독 강아지, 태비 믹스, 스핑크스, 칼리코 믹스 아기 고양이를 포함합니다. 태비·칼리코는 품종이 아닌 모색이므로 믹스로 표기합니다. 이름·크기·방향과 옷장·공간 꾸미기를 제공합니다. 옷장에는 모델별 자세에 맞춘 피팅과 옷 품·길이·몸과의 여유 조절이 있으며 모델 변경 시 기본 핏으로 돌아옵니다. 별도의 모드 선택은 없으며 기존 저장본도 실제 모델로 불러옵니다.

공간 꾸미기에서 벽·바닥·러그 색상과 가구 배치를 바꿉니다. **디자인 저장**은 현재 브라우저에 저장하며, **이미지**는 현재 시점의 PNG를 내려받습니다.

모델과 4K 텍스처는 `frontend/public/models/realistic`에 포함하며 Grab3D의 CC0 라이선스와 AI 제작 출처를 함께 보관합니다. 모델 파일은 각각 약 16~31MB이며 선택한 파일만 불러옵니다. 첫 로딩에는 시간이 걸릴 수 있습니다. 옷장은 어도러블독 상품 10종(색상 옵션 포함)을 참고한 피팅 미리보기입니다.

말티즈·골든 리트리버는 Objaverse에서 로그인 없이 받은 CC BY 4.0 원본에 직접 16개 뼈대와 스킨 가중치를 추가한 모델입니다. 걷기·앉기·엎드리기, 각 자세에서 쉬기·다시 일어나기의 8개 클립을 생성합니다. 사용자가 자세를 고정하지 않아도 자동으로 상태를 전환하고 가구를 피해서 이동합니다. 움직이는 모델은 방 전체를 보는 시점으로 열립니다. 말티즈 원본의 분홍 털 재질은 흰색으로 보정했으며 제작자·원본·수정 사항을 UI와 라이선스 파일에 표기합니다.

옷 본체와 테두리·소매도 몸의 뼈대 가중치를 전달받아 함께 변형됩니다. 말티즈는 털 카드와 몸통을 분리해서 피팅하며 옷 아래의 털을 눌러 돌출을 줄입니다. 옷 품·길이·몸과의 여유를 조절할 수 있고, 길이를 바꾸어도 어깨 구멍은 몸 위치를 유지합니다. 자동 리깅이므로 극단적인 핏과 일부 자세에서 완전한 무관통을 보장하지는 않습니다.

현재 총 7개 모델 중 위 2개가 자동 동작을 지원하며 기존 Grab3D 5개는 정적 모델입니다. 요청한 포메라니안·푸들·러시안 블루·랙돌은 아직 추가하지 못했습니다. Objaverse 전체 160개 메타데이터 묶음과 공개 마켓을 조사했지만 적합한 원본을 확보하지 못했습니다. 푸들 후보는 기본 의상이 붙어 있었고, 고양이 후보에는 상반신만 있는 모델·장난감·의인화 모델이 포함되어 있어 적용하지 않았습니다. [무료 에셋 조사 기록](frontend/public/models/realistic/FREE-ASSET-RESEARCH.md)에 설치 여부와 남은 작업을 구분합니다.

## 데이터와 저장 파일

- 원본 CSV·XLSX, 정제된 11,047곳의 로컬 자료와 정제 스크립트를 포함합니다. 관광공사 자료는 인증키가 있으면 조회 시 통합합니다.
- 기본 정렬은 **사진 있는 장소 우선**입니다. 카카오맵 사진은 같은 업체로 확인된 장소의 대표 사진 **1장**을 보완하며, 화면에 보이는 장소부터 수집합니다. 수집 URL은 7일간 캐시합니다.
- 개인 대화가 포함되는 `backend/data/community.json`, 사진 수집 캐시, 실제 `.env`, 빌드 결과와 `node_modules`는 저장소에 포함하지 않습니다. 다른 실행 환경에서는 필요한 저장 파일이 자동 생성됩니다.
- 즐겨찾기와 여행 코스는 각 브라우저의 로컬 저장소에 저장합니다. 커뮤니티는 단일 백엔드의 JSON 파일을 사용합니다.

기능별 설명: [장소 데이터](DATA.md) · [지도와 여행 코스](ROUTES.md) · [커뮤니티](COMMUNITY.md).
