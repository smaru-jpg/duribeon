# 두리번 🐾 — 충남대학교 대덕캠퍼스 길안내 챗봇

충남대학교 대덕캠퍼스의 건물·호실·시설을 자연어로 검색하고 길을 안내해주는 웹 챗봇입니다.

`정문에서 인문대 가는 길`, `523호`, `*** 교수님 연구실`처럼 편하게 입력하면 목적지를 찾아 지도와 함께 안내합니다.

## 🌐 바로 사용하기

https://duribeon.vercel.app

PC와 모바일 웹 브라우저에서 사용할 수 있습니다.

## 주요 기능

- 자연어 기반 건물·호실·시설 검색
- 출발지와 목적지 인식
- 교내 보행 경로 안내
- Kakao Map을 이용한 위치 표시
- 건물 별칭 및 줄임말 검색

## 사용 예시

- `정문에서 인문대 가는 길`
- `공과대학 4호관 메카트로닉스공학과 학생회실 가고싶어`
- `523호`
- `박진성 교수님 연구실`
- `캡스톤 제작실`
- `비 와서 실내로`

## 로컬에서 실행하기

### 1. 준비

[Node.js](https://nodejs.org) LTS 버전이 필요합니다.

### 2. 실행

프로젝트 폴더에서 터미널을 열고 아래 명령어를 실행합니다.

```bash
npm install
npm run dev
```

실행되면 브라우저에서 두리번이 열립니다.

> 브라우저가 자동으로 열리지 않는 경우 터미널에 표시되는 Local 주소로 접속합니다.

`npm install`은 처음 프로젝트를 실행할 때 필요하며, 이후에는 보통 아래 명령어만 실행하면 됩니다.

```bash
npm run dev
```

## Kakao Map API 설정

Kakao Developers에서 발급받은 **JavaScript Key**를 사용합니다.

프로젝트 루트의 `.env` 파일에 다음과 같이 설정합니다.

```env
VITE_KAKAO_MAP_KEY=발급받은_JavaScript_키
```

`.env` 파일은 `.gitignore`에 등록되어 있어 GitHub에는 업로드되지 않습니다.

## 폴더 구조

```text
duribeon/
├── index.html
├── package.json
├── vite.config.js
└── src/
    ├── main.jsx
    ├── CNUNavigator.jsx
    └── campusGraph.js
```

- `main.jsx` : React 실행 진입점
- `CNUNavigator.jsx` : 챗봇 로직 및 UI
- `campusGraph.js` : 캠퍼스 건물 및 경로 데이터

## 데이터 수정하기

`src/CNUNavigator.jsx` 파일 상단의 다음 부분을 수정하면 됩니다.

- `BUILDINGS` : 건물·호실 목록 (공대 4호관 호실은 안내판 기준으로 입력됨)
- `ORIGINS` : 출발 가능 지점
- `NODES` / `EDGES` : 보행로(약도 경로) 정보
- `SYNONYM` : 줄임말 사전 (예: 공대 → 공과대학)

## 참고

자연어 이해는 규칙·점수 기반 키워드 파서입니다.  
실제 서비스에서는 LLM 임베딩 검색으로 확장할 수 있습니다.

## 기술 스택

React · JavaScript · Vite · Kakao Maps · GitHub · Vercel
