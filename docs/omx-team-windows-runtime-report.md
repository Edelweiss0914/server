# OMX Team Windows Runtime Incident Report

작성일: 2026-04-12
상태: 진행 중인 장애 분석 / 다음 에이전트 인계용
대상 환경: Windows + tmux-win32 + PowerShell + `omx team`

## 요약

이번 세션에서 `$team` / `omx team`은 **완전히 불능은 아니었지만, Windows 환경에서 반복되는 런타임 장애**가 여러 단계로 겹쳐 발생했다.

핵심 결론:

1. **현재 리더 셸이 tmux 밖이면 팀 실행 전제조건을 만족하지 못한다.**
2. **tmux 기본 설정 상태에서는 새 leader session 자체가 `spawn failed`로 깨질 수 있다.**
3. **`omx team`의 기본 detached worktree 모드는 리더 워크스페이스가 조금이라도 dirty하면 바로 중단된다.**
4. **Windows에서 `omx team`(Node 런타임)이 `tmux split-window -c <cwd>`를 호출하면 `create pane failed: spawn failed`가 재현됐다.**
5. **worker pane이 떠도 일부 worker는 `ready_prompt_timeout`으로 prompt에서 멈출 수 있고, 이때는 상태 확인 후 수동 재트리거가 필요했다.**

즉, 장애는 단일 원인이 아니라 **tmux precondition + dirty worktree gate + Windows용 `split-window -c` 런타임 버그 + worker startup 불안정성**의 조합이다.

---

## 실제 관측 증거

### 1) tmux 전제조건 미충족

초기 preflight 결과:

- `TMUX_ENV: <unset>`
- `tmux` 서버 없음

의미:

- 현재 세션은 tmux leader pane이 아니었고,
- team skill 문서의 필수 전제조건(`$TMUX` 설정)을 만족하지 못했다.

### 2) 기본 tmux session 부팅 실패

초기 `tmux new-session ...` 시도에서 반복 관측:

- `create window failed: spawn failed`
- `no server running on tmux-zoop7-default`

우회:

- `tmux -f NUL ...` 로 사용자 tmux 설정을 우회하면 session 생성은 성공했다.

### 3) dirty leader workspace 때문에 worktree 팀 시작 거부

실제 `omx team` 실행 시 관측된 에러:

- `leader_workspace_dirty_for_worktrees:D:\Project:...:commit_or_stash_before_omx_team`

원인:

- `omx team`은 detached worktree를 기본 사용한다.
- 리더 워크스페이스에 untracked `.omx/*` 런타임 산출물이 있으면 시작을 거부한다.

이번 세션에서 dirty 판정을 만든 항목 예시:

- `.omx/context/...`
- `.omx/logs/...`
- `.omx/state/...`
- 임시 launch script

실제 대응:

- `git stash push -u -m 'temp-team-launch-omx-artifacts' -- .omx`

### 4) Windows + Node + tmux `split-window -c` 버그

가장 중요한 반복 장애.

재현 결과:

- PowerShell에서 직접 실행한 `tmux -f NUL split-window ... cmd.exe` 는 성공
- 그러나 Node(`omx team` 런타임과 동일 계열)에서 실행한 아래 호출은 실패
  - `tmux split-window ... cmd.exe`
  - `tmux split-window ... cmd.exe /c ver`
  - `tmux split-window ... powershell.exe ...`
  - `tmux split-window ... -c D:/Project cmd.exe`

특히 **`-c <cwd>`가 포함된 pane 생성 경로**에서 `create pane failed: spawn failed`가 재현되었다.

관찰상 결론:

- Windows tmux 환경에서 `omx team`의 pane 생성 구현이 Node 런타임과 결합될 때 불안정하며,
- 현재 세션에서는 `split-window -c ...` 경로가 실질적인 blocker였다.

### 5) worker startup 불안정 (`ready_prompt_timeout`)

team이 실제로 뜬 뒤 상태:

- 팀 이름: `generalize-the-cheeze-discord`
- pane IDs:
  - leader `%0`
  - worker-1 `%22`
  - worker-2 `%23`
  - hud `%24`

관측된 상태:

- `worker-1`: ACK 후 task 1 진행
- `worker-2`: `ready_prompt_timeout`, Codex 배너에서 멈춤

의미:

- pane 생성만 된다고 worker가 바로 task execution에 들어가는 것은 아니다.
- prompt가 떠 있어도 안내문이 제출되지 않거나 startup trigger가 묶일 수 있다.

수동 개입 결과:

- worker-2에 수동 trigger + Enter를 넣자 뒤늦게 inbox/task 읽기를 시작함
- 따라서 이 오류는 **재현 가능성이 높은 startup/submit 불안정성**으로 봐야 한다.

---

## 이번 세션에서 적용한 우회 / 조치

### A. tmux bootstrap 우회

사용:

```powershell
tmux -f NUL new-session -d -s <session> -c D:\Project cmd.exe
```

의도:

- 기본 tmux 설정 때문에 leader session 생성이 깨지는 문제 회피

### B. dirty `.omx` 임시 stash

사용:

```powershell
git stash push -u -m 'temp-team-launch-omx-artifacts' -- .omx
```

의도:

- `leader_workspace_dirty_for_worktrees` 차단 해제

주의:

- `.omx`를 다시 만들면 워크스페이스는 즉시 dirty가 되므로, 팀 시작 전에만 clean이면 된다.

### C. local OMX runtime hotfix (이번 세션 한정)

**중요: 이건 repo 코드가 아니라 로컬 글로벌 OMX 설치 파일에 대한 임시 패치다.**

수정 파일:

- `C:\Users\zoop7\AppData\Roaming\npm\node_modules\oh-my-codex\dist\team\tmux-session.js`

백업 파일:

- `C:\Users\zoop7\AppData\Roaming\npm\node_modules\oh-my-codex\dist\team\tmux-session.js.bak-codex-team-win`

패치 목적:

1. Windows에서 worker pane/HUD pane 생성 시 `tmux split-window -c ...` 사용을 피함
2. 대신 worker startup PowerShell에서 `Set-Location`으로 worker cwd 진입

적용 이유:

- `split-window -c <cwd>`가 `omx team` 내부(Node 런타임)에서 반복적으로 `spawn failed`를 일으켰기 때문

주의:

- 이 패치는 **로컬 환경 우회**이며 repo에 커밋되지 않음
- 다음 에이전트가 같은 환경을 쓰면 같은 문제가 다시 발생할 수 있음
- 정식 fix는 OMX upstream/team runtime 쪽 수정이 필요함

---

## 현재 판단: 지속 발생 가능성

**예. 지속 발생 가능성이 높다.**

이유:

1. 리더가 tmux 밖에서 시작되면 항상 재발 가능
2. dirty workspace + detached worktree 기본 정책은 구조적으로 반복됨
3. Windows tmux + Node 기반 pane spawn 문제는 환경 종속 버그 성격이 강함
4. worker startup `ready_prompt_timeout`도 이번 한 번만의 우연으로 보기 어려움

따라서 다음 에이전트도 같은 Windows/OMX/tmux 조합을 쓰면 동일 장애를 다시 만날 수 있다.

---

## 다음 에이전트를 위한 체크리스트

### 팀 실행 전

1. 현재 shell이 tmux 안인지 먼저 확인
   - `echo $env:TMUX`
2. tmux session 생성이 기본 설정으로 깨지면 `tmux -f NUL` 사용
3. `git status --short` 로 리더 워크스페이스 clean 여부 확인
4. `.omx/*` 산출물 때문에 dirty면 팀 시작 전에 정리 또는 stash

### 팀 실행 중 pane 생성이 실패하면

우선 의심할 것:

1. Windows에서 `split-window -c <cwd>` 경로가 다시 깨졌는지
2. local OMX runtime hotfix가 유지되어 있는지
3. hotfix가 사라졌다면 아래 파일을 다시 점검할 것:
   - `...\oh-my-codex\dist\team\tmux-session.js`
   - backup: `...\tmux-session.js.bak-codex-team-win`

### worker가 prompt에서 멈추면

1. `omx team status <team> --json`
2. `tmux capture-pane -t %<worker-pane> -p -S -120`
3. worker inbox 확인
4. 필요한 경우 **한 번만** 짧은 trigger/Enter로 재개

주의:

- blind Enter spam 금지
- 먼저 상태 파일 / pane capture 증거 확보

---

## 권장 후속 조치

1. **OMX upstream fix 필요**
   - Windows에서 `tmux split-window -c` 의존을 줄이거나
   - pane startup cwd 설정 방식을 별도 분기 처리해야 함
2. 팀 시작 전에 `.omx` 산출물을 dirty 판정에서 어떻게 다룰지 정책 정리 필요
3. `ready_prompt_timeout` 시 자동 재트리거/상태 복구 로직 강화 필요
4. 이 문서를 유지하면서 실제 재현 결과가 더 쌓이면 업데이트할 것

---

## 세션 시점 상태 참고

마지막 확인 시점(`2026-04-12T03:54:36Z`) 기준:

- team: `generalize-the-cheeze-discord`
- phase: `team-exec`
- tasks: `pending=1`, `in_progress=1`, `completed=0`, `failed=0`
- worker-1은 작업 진행 및 leader merge 흔적 존재
- worker-2는 startup 지연 후 수동 재트리거가 필요했음

이 상태는 **team이 완전히 죽은 것은 아니지만, 안정적으로 신뢰할 수준은 아니라는 증거**로 봐야 한다.
