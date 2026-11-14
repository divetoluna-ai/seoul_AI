# 댕댕여지도 · Pet Tour

반려동물과 함께 갈 장소를 찾고 여행 코스를 만드는 웹 앱입니다. 장소 검색·상세 지도·카카오맵 사진 보완·사진 우선 정렬·즐겨찾기·자동차 경로·코스 공유 커뮤니티·카카오 로그인을 제공합니다.

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
COMMUNITY_STORE=./data/course-community.json
AUTH_MEMBERS_FILE=./data/members.json
AUTH_SESSIONS_FILE=./data/auth-sessions.json
```

| 변수 | 용도 | 기본값 / 필요 여부 |
| --- | --- | --- |
| `TOUR_API_KEY` | 한국관광공사 반려동물 동반여행 API `KorPetTourService2` 인증키 | 선택. 비워 두면 포함된 CSV·XLSX 자료로 실행됩니다. 관광공사 사진과 자료를 추가하려면 필요합니다. |
| `PORT` | 백엔드 포트 | `8080`. 변경하면 `frontend/vite.config.ts`의 프록시 주소와 공유 서버의 백엔드 포트도 맞춰야 합니다. |
| `KAKAO_PHOTOS_ENABLED` | 카카오맵 대표 사진 수집·캐시 사용 | `true`. `false`로 비활성화할 수 있습니다. |
| `KAKAO_PHOTOS_CACHE_FILE` | 수집한 사진 URL·출처 캐시 파일 | `./data/kakao-photos.json` |
| `KAKAO_PHOTOS_MIN_INTERVAL_MS` | 서버의 사진 수집 요청 시작 간격 | `1100`밀리초 |
| `COMMUNITY_STORE` | 여행자 프로필·공유 코스·좋아요·포인트 저장 파일 | `./data/course-community.json` |
| `AUTH_MEMBERS_FILE` | 카카오 회원 정보 JSON 파일 | `./data/members.json` |
| `AUTH_SESSIONS_FILE` | 로그인 세션·진행 중인 인증 요청 JSON 파일 | `./data/auth-sessions.json` |

백엔드는 실행 위치가 프로젝트 루트 또는 `backend`일 때 `.env`를 읽습니다. 같은 이름의 운영체제 환경변수가 있으면 그 값이 우선합니다. 저장 경로는 백엔드 프로세스의 실행 폴더를 기준으로 해석됩니다. 설정 변경 후 백엔드를 재시작합니다.

인증키는 [공공데이터포털](https://www.data.go.kr/)에서 `한국관광공사 반려동물 동반여행 서비스`를 찾아 활용 신청 후 발급받습니다. 일반 인증키의 디코딩 값과 인코딩 값 모두 처리합니다.

### 카카오 로그인 설정

1. [카카오디벨로퍼스](https://developers.kakao.com/console/app)에서 앱을 선택하고 **카카오 로그인 → 사용 설정**을 켭니다.
2. **앱 → 플랫폼 키 → REST API 키**에서 해당 키에 리다이렉트 URI를 등록합니다. 로컬 기본값은 `http://localhost:5173/api/auth/kakao/callback`입니다. 공개 주소로 공유할 때는 외부 HTTPS 주소의 `/api/auth/kakao/callback`을 등록하고 아래 값도 동일하게 지정합니다.
3. 같은 REST API 키의 클라이언트 시크릿이 활성화되어 있으면 그 값을 함께 입력합니다. 카카오 닉네임을 표시하려면 **카카오 로그인 → 동의항목**에서 닉네임을 설정합니다. 제공받은 닉네임이 없으면 `카카오 회원`으로 표시합니다. [카카오 로그인 설정 가이드](https://developers.kakao.com/docs/ko/kakaologin/prerequisite)

`backend/.env`에 다음 값을 추가한 뒤 백엔드를 재시작합니다.

```dotenv
KAKAO_LOGIN_REST_API_KEY=발급받은_카카오_REST_API_키
KAKAO_LOGIN_CLIENT_SECRET=해당_REST_API_키의_클라이언트_시크릿
KAKAO_LOGIN_REDIRECT_URI=http://localhost:5173/api/auth/kakao/callback
```

리다이렉트 URI에 지정한 사이트 주소로 접속해 상단의 **로그인 → 카카오 로그인**을 선택합니다. 첫 로그인 시 회원 계정이 생성되고, 이후 같은 카카오 계정으로 기존 회원 계정에 로그인합니다. 회원 정보는 `AUTH_MEMBERS_FILE`로 지정하는 파일에 저장됩니다(기본 `./data/members.json`). 로그인 세션은 `AUTH_SESSIONS_FILE`로 지정하는 JSON 파일에 저장됩니다(기본 `./data/auth-sessions.json`). 같은 파일과 브라우저 쿠키를 유지하면 서버 재시작 후에도 로그인 상태가 복원됩니다. 로그인은 발급 후 12시간 유효하고, 로그아웃하면 JSON에서도 해당 세션이 삭제되어 재시작 후 되살아나지 않습니다. 진행 중인 카카오 인증 요청도 최대 10분 동안 파일에 저장하고 한 번 사용한 요청은 즉시 삭제합니다. 기존 메모리 세션은 자동 이전되지 않으므로 업데이트 직후 한 번 다시 로그인해야 합니다. 커뮤니티 프로필과 브라우저에 저장된 즐겨찾기·여행 코스는 각각 기존 저장 방식을 사용합니다.

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

공유 서버는 **http://127.0.0.1:4174**에서 빌드 파일과 허용된 API를 제공합니다. Tailscale Serve 등에서 이 주소로 프록시하고, 생성된 HTTPS 주소를 카카오 JavaScript SDK 도메인에 추가합니다. 코스 공유 API와 사진 수집 요청도 같은 주소로 전달됩니다. 단순 정적 파일 서버만 사용하면 `/api`가 연결되지 않습니다.

Vite 개발 서버는 기본적으로 로컬에서만 접속합니다. 외부 공유 시 위 공유 서버를 프록시하는 방식을 사용합니다. 현재 위치 기능은 HTTPS 또는 localhost에서 사용할 수 있습니다. 자세한 임시 공유 절차는 [SHARE.md](SHARE.md)를 참고하세요.

## 데이터와 저장 파일

- 원본 CSV·XLSX·추가 동반 가능 CSV, 정제된 13,283곳의 로컬 자료와 정제 스크립트를 포함합니다. 관광공사 자료는 인증키가 있으면 조회 시 통합합니다.
- 기본 정렬은 **사진 있는 장소 우선**입니다. 카카오맵 사진은 같은 업체로 확인된 장소의 대표 사진 **1장**을 보완하며, 화면에 보이는 장소부터 수집합니다. 수집 URL은 7일간 캐시합니다.
- 프로필·공유 코스가 저장되는 `backend/data/course-community.json`, 사진 수집 캐시, 실제 `.env`, 빌드 결과와 `node_modules`는 저장소에 포함하지 않습니다. 다른 실행 환경에서는 필요한 저장 파일이 자동 생성됩니다.
- 즐겨찾기와 여행 코스는 각 브라우저의 로컬 저장소에 저장합니다. 공유 커뮤니티는 단일 백엔드의 JSON 파일을 사용합니다. 여러 사람이 같은 코스를 보려면 같은 서버 주소에 접속해야 합니다.

### JSON 저장 방식

| 데이터 | 기본 파일 (`backend`에서 실행 시) |
| --- | --- |
| 공유 게시글·코스·여행자 프로필·좋아요·포인트 | `backend/data/course-community.json` |
| 카카오 회원 식별자와 닉네임 | `backend/data/members.json` |
| 로그인 세션·유효기간·진행 중인 인증 요청 | `backend/data/auth-sessions.json` |

필요한 파일은 첫 저장 시 자동 생성됩니다. 읽기 성능을 위해 메모리에 올려두지만 변경은 응답 전에 JSON 파일에 저장하며, 재시작하면 파일에서 복원합니다. 저장은 임시 파일을 작성한 후 교체하며, 파일 쓰기가 실패하면 해당 변경을 완료 처리하지 않습니다. 잘못된 JSON은 빈 데이터로 덮어쓰지 않고 시작 단계에서 오류를 표시합니다.

로그인 쿠키 원문은 브라우저에만 두고 JSON에는 SHA-256 해시와 회원 ID·만료 시각을 저장합니다. 카카오 비밀번호·액세스 토큰은 저장하지 않습니다. 인증 대기 중인 PKCE 검증값은 인증 완료 또는 다음 저장 시 만료 정리됩니다. `data` 폴더는 개인정보가 포함된 서버 전용 파일이며 Git과 외부 공개 경로에서 제외합니다. 백업·복원할 때 세 파일을 함께 보관하고, **한 백엔드 프로세스에서만 사용**합니다. 여러 서버가 같은 JSON을 동시에 수정하는 구성은 지원하지 않습니다.

기능별 설명: [장소 데이터](DATA.md) · [지도와 여행 코스](ROUTES.md) · [커뮤니티](COMMUNITY.md).
