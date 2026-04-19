# Pterodactyl homepc 운영 런북

> 상태: 진행 중
> 작성일: 2026-04-19
> 목표: Gateway Panel + homepc WSL2 Wings 구성의 정상 운영 기준과 실제 장애 해결 절차를 한 문서에 정리

## 배경

Phase 3에서 Pterodactyl Panel은 Gateway Docker Compose에 올라가고,
Wings는 homepc WSL2 Ubuntu에서 systemd 서비스로 동작한다.

실제 운영 중 다음 장애를 순차적으로 겪었다.

1. Wings Node heartbeat가 초록색으로 변하지 않음
2. installer/server 컨테이너가 `io.weight` 오류로 시작 실패
3. Panel UI가 `io=0`을 validation에서 거부
4. 설치는 성공했지만 Java 버전이 맞지 않아 서버 기동 실패
5. 첫 기동 시 `eula.txt` 미동의로 서버 종료

이 문서는 위 흐름을 반영한 최종 운영 기준과 트러블슈팅을 정리한다.

## 현재 정상 구조

### Gateway

- `pterodactyl-panel`: Docker Compose 컨테이너
- `pterodactyl-db`: MariaDB
- `pterodactyl-cache`: Redis
- nginx가 `wings.edelweiss0297.cloud:443` 요청을 수신
- nginx upstream: `http://100.86.252.21:8080`

### homepc WSL2

- Ubuntu + Docker Engine
- `wings.service` systemd 등록
- Wings API: `0.0.0.0:8080`
- Wings SFTP: `0.0.0.0:2022`
- `ssl.enabled: false`

### Panel 노드 설정

- FQDN: `wings.edelweiss0297.cloud`
- Daemon Port: `443`
- SSL: `Use SSL Connection`
- Behind Proxy: 체크

핵심은 다음 한 줄이다.

`Panel이 보는 외부 포트는 443이고, Wings가 실제로 리슨하는 내부 포트는 8080이다.`

## 정상 상태 확인 명령

### Windows

```powershell
Invoke-WebRequest -UseBasicParsing http://127.0.0.1:8080
Invoke-WebRequest -UseBasicParsing http://100.86.252.21:8080
Invoke-WebRequest -UseBasicParsing https://wings.edelweiss0297.cloud
```

`401` 또는 `"The required authorization heads were not present in the request."` 는
오히려 연결 성공으로 본다.

### WSL2 Ubuntu

```bash
sudo systemctl status wings --no-pager
ss -tlnp | grep -E ':8080|:2022'
sudo journalctl -u wings -n 50 --no-pager | grep 'configuring internal webserver'
```

정상 기준:

- `*:8080`, `*:2022` 리슨
- `host_port=8080 use_ssl=false`
- Panel Nodes 화면 heartbeat 초록색

## 새 서버 생성 표준 절차

### 권장 생성값

- Egg: `Vanilla Minecraft`
- Start Server when Installed: 필요 시 끔
- Skip Egg Install Script: 끔
- Allocation: 새 포트 사용
- CPU Limit: `0`
- Memory: 적절한 값
- Disk: 적절한 값
- Block IO Weight: UI 기본값 사용 가능

### 생성 후 필수 확인

서버 생성 직후 DB에서 `io` 값을 확인한다.

```sql
USE panel;
SELECT id, name, io, status, installed_at FROM servers ORDER BY id DESC;
```

정상 기준:

- `io = 0`
- `status = installing` 또는 이후 정상 상태
- `installed_at = NULL` 이면 설치 진행 중

## 이번 장애에서 확인된 근본 원인

### 1. heartbeat 문제

원인:

- 문서와 실제 운영이 direct 모드/프록시 모드를 혼용
- `100.86.252.21:8080` 기준과 `wings.edelweiss0297.cloud:443` 기준이 섞여 혼선 발생

해결:

- Panel은 `443 + SSL + Behind Proxy`
- Wings는 내부 `8080 + ssl.enabled=false`

### 2. installer/server 컨테이너 `io.weight` 실패

대표 로그:

```text
error setting cgroup config ... io.weight: no such file or directory
```

원인:

- WSL2 Docker/runc 환경에서 Pterodactyl의 기본 Block IO Weight 적용이 실패
- installer 컨테이너와 실제 게임 서버 컨테이너 모두 동일하게 실패

중요:

- `server.jar` 없음은 2차 증상이다
- 근본 원인은 installer 컨테이너가 먼저 죽는 것이었다

### 3. Panel UI validation 문제

Panel 기본 validation:

```php
'io' => 'required|numeric|between:10,1000',
```

문제:

- Docker 쪽에서는 `io=0` 이 사실상 "비활성화"인데
- Panel UI는 `0` 저장을 막음

해결:

1. DB 트리거로 `servers.io`를 항상 `0`으로 강제
2. Panel validation을 `between:0,1000` 으로 완화

### 4. Java 버전 불일치

대표 로그:

```text
UnsupportedClassVersionError ... class file version 69.0
```

원인:

- `latest` 서버 파일이 Java 21보다 높은 버전의 런타임을 요구

해결:

- 테스트 서버 버전을 `1.21.4` 로 낮춰 Java 21 이미지와 맞춤

### 5. EULA 미동의

대표 로그:

```text
Failed to load eula.txt
You need to agree to the EULA in order to run the server.
```

해결:

- Panel File Manager 또는 콘솔에서 `eula.txt` 생성/수정
- `eula=true` 적용 후 재시작

## 트러블슈팅 체크리스트

### A. Nodes heartbeat가 빨간색

1. Panel Node 설정 확인
   - `wings.edelweiss0297.cloud`
   - `443`
   - `SSL 사용`
   - `Behind Proxy` 체크
2. WSL `ss -tlnp` 에서 `8080`, `2022` 리슨 확인
3. `https://wings.edelweiss0297.cloud` 요청이 Wings 응답을 반환하는지 확인

### B. 서버가 `installing` 에서 멈춤

1. WSL 로그에서 installer 컨테이너 생성 로그 확인
2. `io.weight` 에러가 있으면 `io=0` 쪽을 먼저 본다
3. installer가 시작된 뒤 실패하면 Egg 설치 스크립트 로그를 본다

### C. `server.jar` 없음

1. `skip_scripts = 0` 인지 확인
2. 해당 Egg의 `script_install` 존재 여부 확인
3. 실제로는 installer 컨테이너가 먼저 죽은 건 아닌지 `journalctl -u wings` 확인

### D. Start 시 Unsupported Java Version

1. 현재 Docker image의 Java 버전 확인
2. 서버 변수에서 Minecraft 버전을 Java 21과 호환되는 값으로 낮춤
3. `Reinstall Server` 후 재시작

### E. Start 시 EULA 오류

1. `eula.txt` 존재 여부 확인
2. `eula=true` 로 수정
3. 재시작

## 운영상 남은 과제

### 1. Panel validation 패치 영구화

현재 패치는 컨테이너 내부 수정이므로 재배포 시 사라진다.

필요 작업:

- 커스텀 Panel 이미지 빌드
또는
- 컨테이너 시작 시 자동 패치 스크립트 적용

#### 현재 임시 패치 내용

파일:

```text
/app/app/Models/Server.php
```

기존:

```php
'io' => 'required|numeric|between:10,1000',
```

임시 수정:

```php
'io' => 'required|numeric|between:0,1000',
```

적용 명령:

```bash
docker exec -it pterodactyl-panel sh -lc \
  "sed -i \"s/'io' => 'required|numeric|between:10,1000'/'io' => 'required|numeric|between:0,1000'/\" /app/app/Models/Server.php && php artisan optimize:clear"
docker restart pterodactyl-panel
```

#### 권장 영구화 방식

가장 안전한 방법은 커스텀 Panel 이미지를 만드는 것이다.

예시 절차:

1. `ghcr.io/pterodactyl/panel:latest` 를 베이스로 하는 Dockerfile 작성
2. `Server.php` validation 패치 반영
3. `docker-compose.yml` 의 `pterodactyl-panel` 이미지를 커스텀 이미지로 교체
4. 재배포 후 `io=0` 입력이 UI에서 저장되는지 확인

단기적으로는 컨테이너 시작 후 자동 패치 스크립트를 실행하는 방식도 가능하지만,
이미지 재생성 시점마다 패치 확인이 필요하므로 장기 운영에는 덜 적합하다.

### 2. `io=0` 강제 정책 영구화

현재는 DB 트리거 기반 우회가 가장 현실적이다.

필요 작업:

- DB 트리거 정의를 인프라 문서와 배포 절차에 포함

#### 트리거 정의

```sql
USE panel;

DELIMITER //

CREATE TRIGGER ptero_servers_force_io_zero_before_insert
BEFORE INSERT ON servers
FOR EACH ROW
BEGIN
  SET NEW.io = 0;
END//

CREATE TRIGGER ptero_servers_force_io_zero_before_update
BEFORE UPDATE ON servers
FOR EACH ROW
BEGIN
  SET NEW.io = 0;
END//

DELIMITER ;
```

#### 확인 명령

```sql
SHOW TRIGGERS LIKE 'servers';
SELECT id, name, io, status, installed_at FROM servers ORDER BY id DESC;
```

정상 기준:

- `servers` 테이블에 insert/update trigger가 존재
- 새 서버 생성 직후 `io = 0`

#### 주의

- Panel UI validation이 `0`을 막는 상태에서는 트리거만으로는 부족하다.
- 반드시 "Panel validation 완화"와 "DB 트리거"를 함께 적용해야 한다.

### 3. Java 정책 명문화

필요 작업:

- `latest` 대신 지원 Java 버전에 맞는 서버 버전 사용 기준 정리
- Egg/이미지별 Java 호환 표 정리

#### 현재 테스트 기준

- Docker image: `ghcr.io/pterodactyl/yolks:java_21`
- 안전한 Minecraft 테스트 버전: `1.21.4`

#### 운영 규칙

- 새 테스트 서버는 `latest` 대신 명시 버전으로 생성
- Java 21 이미지 사용 시 호환성이 검증된 버전으로 먼저 설치 성공을 확인
- 이후에만 상위 버전이나 다른 Java 이미지를 검토

### 4. EULA 처리와 최종 기동 검증

Minecraft Vanilla는 첫 기동 시 EULA 미동의로 한 번 종료될 수 있다.

대표 로그:

```text
Failed to load eula.txt
You need to agree to the EULA in order to run the server.
```

#### 처리 절차

1. Panel File Manager 또는 SFTP로 서버 디렉터리 접속
2. `eula.txt` 파일 열기
3. 아래 내용으로 저장

```text
eula=true
```

4. 서버 다시 `Start`

#### 최종 정상 로그 기준

```text
Starting minecraft server version 1.21.4
Starting Minecraft server on 0.0.0.0:25570
Done (...)! For help, type "help"
Server marked as running...
```

#### 최종 검증 체크리스트

- `status = NULL` 또는 정상 상태
- `installed_at` 이 채워짐
- `server.jar` 존재
- Panel Console에서 `Done` 출력
- Panel 상태가 `running`
- 게임 클라이언트에서 해당 포트 접속 가능

## 권장 다음 작업

1. 현재 성공한 테스트 서버 기준으로 `eula=true` 적용 후 완전 기동 검증
2. Panel validation 패치를 커스텀 이미지나 자동 패치로 영구화
3. `servers.io=0` 트리거를 운영 표준으로 유지
4. 신규 서버 생성 체크리스트를 `/admin` 운영 절차에 반영

## 관련 문서

- [pterodactyl-wings-heartbeat.md](./pterodactyl-wings-heartbeat.md)
- [troubleshooting-wings-heartbeat.md](./troubleshooting-wings-heartbeat.md)
- [wings-setup.md](./wings-setup.md)

## 커스텀 Panel 이미지 (2026-04-19)

현재 `io=0` validation 완화는 컨테이너 내부 수동 수정이 아니라
Gateway Docker Compose의 커스텀 Panel 이미지로 관리한다.

구현 파일:

- `deploy/docker/pterodactyl-panel/Dockerfile`
- `deploy/docker/pterodactyl-panel/patch-panel.sh`
- `deploy/docker/pterodactyl-panel/ko-patch.js`
- `deploy/docker/docker-compose.yml`

동작 방식:

1. `ghcr.io/pterodactyl/panel:latest` 를 베이스 이미지로 사용
2. 빌드 시 `patch-panel.sh` 가 `/app/app/Models/Server.php` 를 수정
3. `io` validation을 `between:0,1000` 으로 완화
4. `/app/public/ko-patch.js` 를 추가하고 Blade 레이아웃에서 전역 로드
5. Compose는 `cheeze-pterodactyl-panel:local` 이미지를 사용

재배포 명령:

```bash
cd /var/www/home/deploy/docker
docker compose build pterodactyl-panel
docker compose up -d pterodactyl-panel
```

검증:

```bash
docker exec -it pterodactyl-panel sh -lc "grep -n \"between:0,1000\" /app/app/Models/Server.php"
docker exec -it pterodactyl-panel sh -lc "test -f /app/public/ko-patch.js && echo ko-patch-present"
docker compose ps pterodactyl-panel
```

운영 규칙:

- 더 이상 컨테이너 내부에 직접 `sed` 패치를 하지 않는다.
- `pterodactyl-panel` 관련 변경이 있으면 항상 `docker compose build pterodactyl-panel` 을 수행한다.
- Panel 재배포 후에는 `io=0` 저장 가능 여부, 기존 서버 화면 접근, 주요 UI 한글 치환 여부를 함께 확인한다.
