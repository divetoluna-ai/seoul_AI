# 잠깐 외부에 보여주기

인증키를 설정한 터미널에서 기존 Spring Boot 백엔드를 실행합니다(8080).

프론트엔드를 수정했다면 `frontend`에서 `npm run build`를 실행합니다.

프로젝트 루트의 새 터미널에서 공유용 서버를 실행합니다.

```powershell
node scripts/share-preview.mjs
```

다른 터미널에서 설치된 ngrok을 실행합니다.

```powershell
ngrok http http://127.0.0.1:4174
```

ngrok의 `Forwarding`에 표시되는 HTTPS 주소를 공유합니다. 이 서버는 `frontend/dist` 파일과 허용된 장소 조회·커뮤니티 API 경로를 제공합니다. 커뮤니티에서는 방문자가 프로필과 글을 만들고, 댓글·모임 참여·거래·대화를 이용할 수 있습니다.

공유 주소에서 카카오 로그인을 사용하려면 해당 HTTPS 주소에 `/api/auth/kakao/callback`을 붙여 카카오 앱의 리다이렉트 URI로 등록합니다. 백엔드 `.env`의 `KAKAO_LOGIN_REDIRECT_URI`에도 같은 값을 입력하고 백엔드를 재시작합니다. [카카오 로그인 설정](README.md#카카오-로그인-설정)

커뮤니티 데이터는 백엔드 실행 폴더의 `data/community.json`에 저장됩니다. 서버를 재시작해도 유지되며, 이 파일에는 개인 대화도 포함되므로 외부에 공유하지 마세요. 간편 프로필은 브라우저 쿠키에 연결되고 다른 기기 로그인이나 복구는 지원하지 않습니다. 자세한 범위는 `COMMUNITY.md`를 참고하세요.

공유하는 동안 컴퓨터와 백엔드·공유용 서버·ngrok을 켜두어야 합니다. 끝나면 ngrok 터미널에서 `Ctrl+C`를 눌러 외부 접속을 종료하고 공유용 서버도 종료합니다.
