# Bung Tracker — 백엔드 API 문서

배드민턴 벙(모임) 참석자 등록 및 입금 관리 서버.

## 기술 스택

- **Runtime**: Node.js + Express
- **DB**: Supabase (PostgreSQL)
- **인증**: `x-admin-key` 헤더 (관리자 전용 엔드포인트)

## 서버 정보

- 기본 포트: `3000`
- Base URL (로컬): `http://localhost:3000`

## 인증

관리자 전용 API는 요청 헤더에 아래를 포함해야 합니다.

```
x-admin-key: <ADMIN_KEY>
```

## 데이터 모델

### events (벙)

| 필드              | 타입        | 설명                         |
| ----------------- | ----------- | ---------------------------- |
| id                | integer     | PK                           |
| event_date        | date        | 벙 날짜 (YYYY-MM-DD, unique) |
| amount_per_person | integer     | 1인당 참가비 (원)            |
| created_at        | timestamptz | 생성 시각                    |

### event_slots (타임슬롯)

| 필드      | 타입    | 설명                             |
| --------- | ------- | -------------------------------- |
| id        | integer | PK                               |
| event_id  | integer | FK → events.id                   |
| slot_time | varchar | 시작 시각 (예: "10:30", "12:00") |
| capacity  | integer | 정원                             |

### attendees (참석자)

| 필드          | 타입        | 설명                        |
| ------------- | ----------- | --------------------------- |
| id            | integer     | PK                          |
| event_slot_id | integer     | FK → event_slots.id         |
| name          | text        | 참석자 이름                 |
| payment_id    | integer     | FK → payments.id (nullable) |
| registered_at | timestamptz | 등록 시각                   |

### payments (입금 내역)

| 필드         | 타입        | 설명                                             |
| ------------ | ----------- | ------------------------------------------------ |
| id           | integer     | PK                                               |
| raw_content  | text        | Tasker에서 수신한 원본 문자열                    |
| amount       | integer     | 입금액 (원)                                      |
| parsed_names | text[]      | 파싱된 이름 목록                                 |
| parsed_dates | text[]      | 파싱된 날짜 목록                                 |
| status       | enum        | `pending` \| `assigned` \| `partial` \| `failed` |
| fail_reason  | text        | 실패 사유 (nullable)                             |
| created_at   | timestamptz | 수신 시각                                        |

**payment status 의미**

- `pending`: 처리 중
- `assigned`: 전원 배정 완료
- `partial`: 일부만 배정됨 (만석 등)
- `failed`: 파싱 실패·금액 불일치·벙 없음 등

---

## API 엔드포인트

### 벙 조회 (공개)

#### `GET /events`

전체 벙 목록 (슬롯 현황 포함, 참석자 이름 미포함)

**응답**

```json
{
  "success": true,
  "events": [
    {
      "id": 1,
      "event_date": "2026-04-17",
      "amount_per_person": 1500,
      "created_at": "2026-04-14 10:00:00",
      "slots": [
        { "slot_time": "10:30", "capacity": 10, "count": 7, "remaining": 3 },
        { "slot_time": "12:00", "capacity": 10, "count": 2, "remaining": 8 }
      ]
    }
  ]
}
```

#### `GET /events/:date`

특정 날짜 벙 상세 (슬롯별 참석자 이름 포함)

**파라미터**: `date` — YYYY-MM-DD

**응답**

```json
{
  "event_date": "2026-04-17",
  "amount_per_person": 1500,
  "total_attendees": 9,
  "slots": [
    {
      "slot_time": "10:30",
      "capacity": 10,
      "count": 7,
      "remaining": 3,
      "attendees": [
        { "name": "홍길동", "registered_at": "2026-04-14 09:00:00" }
      ]
    }
  ]
}
```

---

### 벙 관리 (관리자)

#### `POST /events`

벙 생성

**Body**

```json
{
  "event_date": "2026-04-17",
  "amount_per_person": 1500,
  "slots": [
    { "slot_time": "10:30", "capacity": 10 },
    { "slot_time": "12:00", "capacity": 10 }
  ]
}
```

**응답** `201`

````json
{
  "success": true,
  "message": "벙이 생성되었습니다.",
  "event": { "id": 1, "event_date": "2026-04-17", "amount_per_person": 1500, "slots": [...] }
}
```f

**에러**

- `400` — 필드 누락 또는 날짜 형식 오류
- `409` — 해당 날짜에 벙이 이미 존재

#### `DELETE /events/:date`

벙 삭제 (슬롯·참석자 cascade 삭제)

**응답** `200`

```json
{ "success": true, "message": "2026-04-17 벙이 삭제되었습니다." }
````

---

### 참석자 직접 관리 (관리자)

#### `POST /events/:date/attendees`

특정 벙에 참석자 직접 추가

**Body**

```json
{
  "names": ["홍길동", "김철수"],
  "slot_time": "10:30"
}
```

- `slot_time` 생략 시 빈 슬롯 자동 배정
- `slot_time` 지정 시 정원 초과도 허용 (관리자 권한)

**응답** `201`

```json
{
  "success": true,
  "message": "✅ 홍길동 10:30 등록 완료\n✅ 김철수 10:30 등록 완료",
  "results": [
    { "name": "홍길동", "status": "ok", "slot_time": "10:30" },
    { "name": "김철수", "status": "ok", "slot_time": "10:30" }
  ]
}
```

**result status 값**

- `ok`: 신규 등록 성공
- `duplicate`: 이미 등록됨
- `full`: 빈 슬롯 없음 (자동 배정 시)

#### `DELETE /events/:date/attendees/:name`

특정 참석자 제거 (`name`은 URL 인코딩)

**응답** `200`

```json
{
  "success": true,
  "message": "홍길동님의 2026-04-17 벙 등록이 취소되었습니다."
}
```

---

### 입금 처리

#### `POST /payment`

Tasker에서 입금 알림 수신. 파싱·검증·슬롯 배정을 자동으로 처리하며 모든 수신 내역을 payments에 기록한다.

**Body**

```json
{ "content": "홍길동 김철수 0417", "amount": 3000 }
```

- `content` 파싱 규칙: 공백 구분, 날짜 패턴(`YYYY-MM-DD`, `M/DD`, `MMDD` 등)은 날짜로, 나머지는 이름으로 분류
- 금액 검증: `amount_per_person × 이름수 × 날짜수`와 일치해야 함

**응답** `201` (성공)

```json
{
  "success": true,
  "payment_id": 5,
  "message": "✅ 홍길동 2026-04-17 10:30 등록 완료\n✅ 김철수 2026-04-17 10:30 등록 완료",
  "results": [
    {
      "name": "홍길동",
      "date": "2026-04-17",
      "status": "ok",
      "slot_time": "10:30"
    }
  ]
}
```

**응답** `422` (파싱 실패)

```json
{
  "success": false,
  "payment_id": 3,
  "message": "파싱 실패: 날짜을 찾을 수 없습니다. 관리자가 수동 배정할 수 있습니다."
}
```

---

### 입금 내역 관리 (관리자)

#### `GET /payments`

입금 내역 목록

**Query**

- `status` — `pending` | `assigned` | `partial` | `failed` (생략 시 전체)
- `limit` — 기본 50
- `offset` — 기본 0

**응답**

```json
{
  "total": 42,
  "limit": 50,
  "offset": 0,
  "payments": [
    {
      "id": 3,
      "raw_content": "홍길동사월십칠일",
      "amount": 1500,
      "parsed_names": null,
      "parsed_dates": null,
      "status": "failed",
      "fail_reason": "파싱 실패 — 날짜을 찾을 수 없습니다.",
      "created_at": "2026-04-14 09:30:00"
    }
  ]
}
```

#### `POST /payments/:id/assign`

파싱 실패·금액 불일치 등 미배정 입금을 관리자가 수동으로 배정.
`names × dates` 전체 조합을 배정하며 이미 배정된 조합은 건너뛴다.

**Body**

```json
{
  "names": ["홍길동", "김철수"],
  "dates": ["2026-04-17", "2026-04-24"]
}
```

**응답**

```json
{
  "success": true,
  "payment_id": 3,
  "message": "✅ 홍길동 2026-04-17 10:30 등록 완료\n...",
  "results": [...]
}
```

**에러**

- `404` — payment를 찾을 수 없음
- `409` — 이미 완전히 배정된 입금
- `400` — 금액 불일치 또는 벙 없음

---

## 공통 에러 응답

```json
{ "success": false, "message": "오류 설명" }
```

| 상태 코드 | 의미                                               |
| --------- | -------------------------------------------------- |
| `400`     | 잘못된 요청 (필드 누락, 형식 오류, 금액 불일치 등) |
| `403`     | 관리자 인증 실패                                   |
| `404`     | 리소스를 찾을 수 없음                              |
| `409`     | 중복 또는 충돌                                     |
| `422`     | 파싱 실패                                          |
| `500`     | 서버 내부 오류                                     |

## 프로젝트 구조

```
bung-tracker/
├── server.js           # 앱 진입점
├── parseContent.js     # 입금 문자열 파서
├── lib/
│   ├── supabase.js     # Supabase 클라이언트
│   ├── middleware.js   # requireAdmin 미들웨어
│   └── slots.js        # 슬롯 배정 로직
└── routes/
    ├── events.js       # 벙·참석자 라우터
    └── payments.js     # 입금 라우터
```
