# CHEEZE 보안 모델

> 최종 업데이트: 2026-04-17

## 목차

1. [보안 아키텍처 계층도](#1-보안-아키텍처-계층도)
2. [인증/인가 흐름](#2-인증인가-흐름)
3. [토큰 시스템](#3-토큰-시스템)
4. [감사 로그](#4-감사-로그)
5. [네트워크 접근 제어](#5-네트워크-접근-제어)
6. [관리자 페이지 보안](#6-관리자-페이지-보안)
7. [알려진 보안 고려사항](#7-알려진-보안-고려사항)

---

## 1. 보안 아키텍처 계층도

```
[인터넷/사용자]
       │
       ▼
┌─────────────────────────────────────────┐
│  Cloudflare CDN                         │
│  - DDoS 방어                            │
│  - HTTPS 종단 (TLS 인증서 관리)         │
│  - Cloudflare Tunnel (원본 IP 숨김)     │
└─────────────────────────────────────────┘
       │
       ▼
┌─────────────────────────────────────────┐
│  Gateway LXC — Nginx (리버스 프록시)    │
│  - Rate limit: 상태 30r/m              │
│  - Rate limit: 액션 5r/m (POST만)      │
│  - /admin.html, /api/control/admin/     │
│    → 404 반환 (공개 사이트에서 차단)    │
└─────────────────────────────────────────┘
       │
       ▼
┌─────────────────────────────────────────┐
│  Portal API (cheeze-portal-api.py)      │
│  - 공개 파사드 (포트 11437, 127.0.0.1) │
│  - X-Cheeze-Control-Token 검증         │
│  - 토큰 레지스트리 기반 인가            │
│  - 감사 로그 기록                       │
│  - IP 라벨 매핑                         │
│  - 서비스별 시간 제한                   │
└─────────────────────────────────────────┘
       │  X-Cheeze-Internal-Token
       ▼
┌─────────────────────────────────────────┐
│  Control API (cheeze-control-api.py)    │
│  - 내부 전용 (포트 11436, 127.0.0.1)   │
│  - 공유 시크릿으로 Portal API 인증      │
│  - WOL, 서비스 시작/중지 실행           │
└─────────────────────────────────────────┘
       │  Tailscale VPN
       ▼
┌─────────────────────────────────────────┐
│  Backend Agent (cheeze-backend-agent.py)│
│  - Windows 홈 PC                        │
│  - Tailscale 신뢰 네트워크만 접근       │
│  - 별도 인증 없음 (네트워크 레벨 신뢰) │
└─────────────────────────────────────────┘
```

---

## 2. 인증/인가 흐름

### 2.1 공개 상태 조회 (인증 불필요)

```
클라이언트 → GET /api/control/status/{service_id}
           → Portal API → Control API → 상태 반환
```

- 토큰 없이 누구나 서비스 상태를 조회할 수 있음
- Rate limit: 30r/m (Nginx)

### 2.2 서비스 제어 액션 (토큰 필요)

```
클라이언트 → POST /api/control/action/{service_id}/{action}
             헤더: X-Cheeze-Control-Token: <raw_token>
           → Portal API
               1. 토큰 레지스트리에서 SHA-256 해시 비교 (hmac.compare_digest)
               2. 역할(role) 확인
               3. allowed_services 스코프 확인
               4. allowed_actions 스코프 확인
               5. 만료(expires_at) 확인
               6. 폐기(revoked_at) 확인
               7. 시간 제한 확인 (SERVICE_TIME_RESTRICTIONS)
           → 통과 시 Control API로 포워딩 (X-Cheeze-Internal-Token 추가)
           → 감사 로그 기록 (성공/실패 모두)
```

- Rate limit: 5r/m (Nginx, POST만)

### 2.3 관리자 API (이중 인증)

```
관리자 → Tailscale IP(100.75.209.83)로 접근
       → admin.html 로드 (Tailscale IP 전용 location block)
       → 관리자 토큰으로 /api/control/admin/* 요청
```

---

## 3. 토큰 시스템

### 3.1 토큰 구조

토큰 레지스트리는 JSON 파일로 관리됩니다 (`/opt/cheeze-control/portal-control-tokens.json`).

```json
{
  "tokens": [
    {
      "token_id": "고유 식별자 (예: friend-001)",
      "label": "사람이 읽을 수 있는 설명 (예: 친구 A)",
      "role": "admin 또는 friend",
      "token_hash": "SHA-256 헥스 다이제스트 (실제 토큰값 미저장)",
      "allowed_services": ["*"] ,
      "allowed_actions": ["start", "stop"],
      "expires_at": "2026-12-31T23:59:59+09:00 또는 null",
      "revoked_at": "폐기 시각 또는 null"
    }
  ]
}
```

**필드 설명:**

| 필드 | 타입 | 설명 |
|------|------|------|
| `token_id` | string | 레지스트리 내 고유 식별자 |
| `label` | string | 감사 로그에 표시되는 설명 |
| `role` | `admin` \| `friend` | 역할 (현재 스코프 제어에 사용) |
| `token_hash` | string | 실제 토큰의 SHA-256 해시 (원본 미저장) |
| `allowed_services` | array | 허용된 서비스 ID 목록. `["*"]`이면 전체 허용 |
| `allowed_actions` | array | 허용된 액션 목록. `["*"]`이면 전체 허용 |
| `expires_at` | ISO8601 \| null | 만료 시각. null이면 무기한 |
| `revoked_at` | ISO8601 \| null | 폐기 시각. null이면 유효 |

### 3.2 토큰 생성

`/var/www/home/deploy/gateway/generate-control-token.py` 스크립트를 사용합니다.

```bash
# Gateway 서버에서 실행
cd /opt/cheeze-control
python3 /var/www/home/deploy/gateway/generate-control-token.py
```

- 스크립트가 무작위 토큰 문자열과 SHA-256 해시를 출력
- **원본 토큰값**은 생성 시에만 확인 가능 (레지스트리에는 해시만 저장)
- 생성된 해시를 `portal-control-tokens.json`에 추가

### 3.3 토큰 검증 로직

```python
# 0. 레거시 환경변수 토큰 먼저 확인 (CHEEZE_PORTAL_CONTROL_TOKEN)
if CONTROL_ACTION_TOKEN and hmac.compare_digest(supplied, CONTROL_ACTION_TOKEN):
    → 허용 (admin 권한, 전체 서비스/액션 허용)

# 1. 레지스트리 로드
tokens = load_token_registry()

# 2. 해시 비교 (타이밍 공격 방지: hmac.compare_digest 사용)
for record in tokens:
    if hmac.compare_digest(sha256_hex(raw_token), record["token_hash"]):
        matched = record
        break

# 3. 폐기/만료 확인
if matched["revoked_at"] is not None:
    → 거부

if matched["expires_at"] and parse_datetime(matched["expires_at"]) < now_utc():
    → 거부

# 4. 스코프 확인
if not scope_matches(action, matched["allowed_actions"]):
    → 거부
if not scope_matches(service_id, matched["allowed_services"]):
    → 거부
```

### 3.4 토큰 폐기

레지스트리 파일에서 해당 토큰의 `revoked_at` 필드에 현재 시각을 기록합니다.

```json
{
  "revoked_at": "2026-04-17T10:00:00+09:00"
}
```

폐기된 토큰은 레지스트리에 기록으로 남습니다 (감사 목적). 완전 삭제는 하지 않는 것을 권장합니다.

### 3.5 서비스별 시간 제한

특정 서비스는 시작 가능 시간대가 제한됩니다 (`cheeze-portal-api.py` 내 `SERVICE_TIME_RESTRICTIONS`):

| 서비스 | 차단 시간대 (KST) | 허용 시간대 |
|--------|------------------|------------|
| minecraft-cobbleverse | 01:00 ~ 10:00 | 10:00 ~ 01:00 |

---

## 4. 감사 로그

### 4.1 위치

```
/opt/cheeze-control/portal-control-audit.log
```

JSON Lines 형식 (한 줄 = 한 이벤트).

### 4.2 로그 구조

```json
{
  "timestamp": "2026-04-17T01:23:45.678901+00:00",
  "service_id": "minecraft-cobbleverse",
  "action": "start",
  "result": "forwarded",
  "status_code": 200,
  "token_id": "friend-001",
  "token_label": "친구 A",
  "token_role": "admin",
  "remote_ip": "1.2.3.4",
  "user_agent": "Mozilla/5.0 ...",
  "error": null
}
```

**result 값:**

| 값 | 의미 |
|----|------|
| `forwarded` | Control API로 요청 포워딩 성공 (2xx~4xx 응답) |
| `rejected` | 인증 실패, 스코프 거부, 시간 제한 등으로 차단 |
| `failed` | Control API가 5xx 오류 반환 |
| `error` | Control API 연결 자체 실패 (예외 발생) |

### 4.3 IP 라벨

관리자 페이지에서 IP 주소에 사람이 읽을 수 있는 이름을 매핑할 수 있습니다.

- 저장 위치: `/opt/cheeze-control/portal-ip-labels.json`
- 형식: `{ "1.2.3.4": "집", "5.6.7.8": "회사" }`
- IP 라벨 매핑은 감사 로그 자체에는 포함되지 않으며, **관리자 페이지(`admin.html`)에서 클라이언트 사이드로 적용**됩니다.
  감사 로그의 `remote_ip` 필드를 `/opt/cheeze-control/portal-ip-labels.json`과 대조하여 표시 이름을 렌더링합니다.

---

## 5. 네트워크 접근 제어

### 5.1 Cloudflare

- 모든 공개 트래픽은 Cloudflare를 통과
- Cloudflare Tunnel로 원본 서버 IP 비공개
- DDoS 방어, HTTPS 강제
- `CF-Connecting-IP` 헤더로 실제 클라이언트 IP 전달

### 5.2 Nginx Rate Limit

```nginx
# 상태 조회
limit_req_zone $binary_remote_addr zone=cheeze_status:10m rate=30r/m;

# 액션 (POST만 적용)
limit_req_zone $binary_remote_addr zone=cheeze_action:10m rate=5r/m;
```

### 5.3 공개 사이트 차단 설정

```nginx
# 공개 사이트에서 관리자 경로 완전 숨김
location = /admin.html { return 404; }
location ^~ /api/control/admin/ { return 404; }
```

### 5.4 Tailscale (내부 네트워크)

- Control API → Backend Agent 통신은 Tailscale VPN으로만
- Tailscale CIDR: `100.64.0.0/10`
- 관리자 페이지 접근: Tailscale IP `100.75.209.83` 전용
- Nextcloud admin: `<비공개 경로>` 경로는 Tailscale CIDR만 허용

### 5.5 내부 서비스 간 인증

```
Portal API → Control API: X-Cheeze-Internal-Token 헤더 (공유 시크릿)
Control API → Backend Agent: Tailscale 네트워크 신뢰 (추가 인증 없음)
```

---

## 6. 관리자 페이지 보안

### 6.1 기존 방식 (admin.html — Tailscale + 수동 토큰)

`admin.html`은 이중 보안 레이어로 보호됩니다.

**레이어 1: 네트워크 수준**
- Tailscale IP(`100.75.209.83`)에서만 접근 가능
- Nginx `location` 블록으로 공개 사이트에서는 404 반환
- 인터넷에서는 페이지 존재 자체가 노출되지 않음

**레이어 2: 애플리케이션 수준**
- 관리자 토큰 인증 필요 (`admin` 역할)
- 모든 관리 API 요청에 토큰 포함

### 6.2 Next.js /admin (Cloudflare Access + 서버사이드 토큰)

Next.js 마이그레이션된 `/admin` 페이지는 Cloudflare Access OTP 인증을 사용합니다.

**인증 흐름:**

```
사용자 → edelweiss0297.cloud/admin 접근
       → Cloudflare Access 인터셉트
       → One-time PIN (OTP) 이메일 인증 (Zoop784@naver.com)
       → JWT 토큰 발급 (Cf-Access-Jwt-Assertion 헤더)
       → Next.js proxy.ts에서 JWT 검증
           1. JWKS 공개키 fetch (cheeze0297.cloudflareaccess.com/cdn-cgi/access/certs)
           2. RS256 서명 검증 (Web Crypto API SubtleCrypto)
           3. aud 클레임 검증 (Application ID: 9bc9a0b2-09e1-4ce5-8dc3-ccc3ebfebd13)
           4. email 클레임 검증 (허용 이메일만 통과)
           5. 만료(exp) 검증
       → 통과 시 x-admin-email 헤더 주입 후 요청 진행
       → 실패 시 401 JSON 응답
```

**서버사이드 토큰 주입:**
- Next.js API route handler에서 `process.env.ADMIN_CONTROL_TOKEN`을 서버측에서 주입
- 클라이언트는 토큰을 알 필요 없음 (Cloudflare Access JWT만으로 인증)
- 기존 수동 토큰 입력 다이얼로그 제거됨

**Cloudflare Access 설정값:**

| 항목 | 값 |
|------|-----|
| Team Domain | cheeze0297.cloudflareaccess.com |
| Application ID | 9bc9a0b2-09e1-4ce5-8dc3-ccc3ebfebd13 |
| 인증 방식 | One-time PIN (이메일 OTP) |
| 보호 경로 | edelweiss0297.cloud/admin |
| 관리자 이메일 | Zoop784@naver.com |
| JWT 헤더 | Cf-Access-Jwt-Assertion |

**개발 환경 bypass:**
- localhost/127.0.0.1 요청은 JWT 검증 없이 통과 (dev bypass)
- `x-admin-email: dev@localhost`로 설정됨

**관리자 기능:**
- 서비스 상태 그리드 및 제어
- 감사 로그 테이블 (페이지네이션, 실시간 폴링)
- IP 라벨 관리 (추가/삭제)
- 서버 콘솔 (멀티 탭, 명령어 히스토리)

---

## 7. 알려진 보안 고려사항

### 7.1 현재 구현의 제한사항

| 항목 | 현황 | 개선 방향 |
|------|------|-----------|
| Backend Agent 인증 | Tailscale 네트워크 신뢰에만 의존 | 별도 인증 레이어 추가 고려 |
| 토큰 레지스트리 | 파일 기반 JSON | DB 기반 관리로 전환 고려 |
| 감사 로그 보존 | 파일 무기한 누적 | 로그 로테이션 설정 권장 |
| 내부 시크릿 | 환경변수로 관리 | Vault 등 시크릿 관리 도구 고려 |

### 7.2 레거시 인증 환경변수

`CHEEZE_PORTAL_CONTROL_TOKEN` 환경변수는 토큰 레지스트리 도입 이전의 단일 토큰 인증 방식입니다.

- 설정 시 레지스트리 검사보다 먼저 평가됩니다 (단순 문자열 비교, `hmac.compare_digest`)
- 모든 서비스/액션에 대해 admin 권한으로 허용됩니다
- **신규 배포에서는 사용을 권장하지 않습니다.** 세분화된 권한 제어를 위해 토큰 레지스트리(`portal-control-tokens.json`)를 사용하세요
- 레거시 토큰으로 기록된 감사 로그의 `token_id`는 `legacy-admin-env-token`으로 표시됩니다

### 7.3 토큰 보안 원칙

- 토큰 원본값은 생성 직후에만 확인 가능 (이후 복구 불가)
- 레지스트리에는 SHA-256 해시만 저장
- 타이밍 공격 방지를 위해 `hmac.compare_digest` 사용
- 토큰 공유 시 최소 권한 원칙 적용 (필요한 서비스/액션만 허용)

### 7.4 Discord 봇

- 별도의 시작/중지 토큰 사용 (Portal API 토큰과 분리)
- 역할 기반 접근 제어 (Discord 서버 역할)
- 봇 토큰은 환경변수로 관리
