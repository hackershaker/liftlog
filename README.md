# Liftlog

기기 안에 운동 기록을 저장하는 피트니스 트래커입니다.

[앱 열기](https://hackershaker.github.io/liftlog/)

## 주요 기능

- 이름을 자유롭게 지정하는 운동 루틴 생성·수정·삭제
- 세트별 반복 횟수, 기본 중량, 세트·운동 사이 휴식 시간 설정
- 진행 중인 운동 재개 또는 기록 없이 취소
- 실시간 운동 시간 표시와 완료 기록 저장
- 상단 고정 휴식 타이머와 완료 알림음
- 체중, 신체 치수, 개인 최고 기록, 맨몸 운동 기술 추적
- 다크·라이트 테마와 홈 화면에 추가할 수 있는 PWA
- JSON 백업 내보내기·가져오기

## 데이터 저장

프로필·루틴·운동 기록은 브라우저의 localStorage에 저장합니다. 계정이나 서버 저장소가 없으며 기기 간 자동 동기화는 지원하지 않습니다. 사이트 데이터를 삭제하면 기록이 사라질 수 있으므로 설정에서 JSON 백업을 내보내세요.

휴식 알림음은 운동 화면을 열어둔 상태에서 사용하세요. Test Sound로 소리를 활성화하고 확인할 수 있습니다.

## 로컬 실행

```bash
git clone https://github.com/hackershaker/liftlog.git
cd liftlog
npm ci
npm run dev
```

개발 서버 주소: http://localhost:5173/liftlog/

Windows PowerShell에서 실행 정책으로 npm 실행이 차단되면 npm.cmd를 사용하세요.

## 테스트·빌드

```bash
npm test
npm run build
```

빌드 결과는 dist/에 생성됩니다. 현재 Vite의 배포 기본 경로는 /liftlog/입니다.

## GitHub Pages 배포

```bash
npm run build
git add dist
git commit -m "Update deployed app" --only -- dist
git subtree push --prefix dist origin gh-pages
```

GitHub Pages는 gh-pages 브랜치의 루트 폴더를 배포하도록 설정합니다.

## 사용 기술

React, TypeScript, Vite, Tailwind CSS, Recharts, Zod, Workbox.

## 라이선스

MIT. 원본 코드의 저작권 및 라이선스 고지는 [LICENSE](LICENSE)에 보존되어 있습니다.
