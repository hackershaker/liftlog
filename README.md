# LiftLog Personal PWA

Hevy 스타일의 개인용 운동 기록 PWA MVP입니다.

## 구현된 기능
- 세트 체크 방식 운동 기록
- 중량+reps / 시간 / 시간+거리 운동 타입
- 루틴 무제한 생성
- 루틴별 세트 수, 목표 reps, 세트 휴식, 운동 사이 휴식 설정
- 기본 휴식시간 설정 (초기값: 세트 45초 / 운동 60초)
- 세트 완료 시 휴식 타이머
- 총 운동 Volume (중량 × reps 합계)
- 주간/월간 운동 횟수
- 최근 8주 운동 횟수 그래프
- 근육 부위별 운동량 (주동근 + 보조근 가중치)
- 운동 종료 후 기록 수정/삭제
- 커스텀 운동 생성
- JSON 백업/복원
- Hevy CSV 가져오기 베타
- 오프라인 캐시용 Service Worker

## iPhone에서 앱처럼 설치
PWA 설치에는 HTTPS로 호스팅된 주소가 필요합니다.

1. 이 폴더를 GitHub Pages, Cloudflare Pages, Netlify, Vercel 같은 정적 호스팅에 올립니다.
2. iPhone Safari에서 해당 주소를 엽니다.
3. 공유 버튼 → "홈 화면에 추가"를 선택합니다.
4. 홈 화면의 LiftLog 아이콘으로 실행합니다.

## 데이터 주의
운동 기록은 브라우저 로컬 저장소(localStorage)에 보관됩니다.
중요한 기록은 Settings > JSON 백업 내보내기로 주기적으로 백업하세요.

## Hevy 데이터 이전
Settings > Hevy CSV 가져오기 (베타)를 사용할 수 있습니다.
CSV 형식에 따라 열 이름이 다르면 자동 인식이 실패할 수 있습니다.
그 경우 실제 Hevy export CSV를 기준으로 importer를 맞추는 것이 가장 안전합니다.
