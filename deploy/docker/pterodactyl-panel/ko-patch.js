(function () {
  const TEXT_REPLACEMENTS = new Map([
    ['BASIC ADMINISTRATION', '기본 관리'],
    ['ADMINISTRATIVE OVERVIEW', '관리 개요'],
    ['ADMINISTRATIVE', '관리'],
    ['Basic Administration', '기본 관리'],
    ['Administrative Overview', '관리 개요'],
    ['Administrative', '관리'],
    ['Administration', '관리'],
    ['SERVICE MANAGEMENT', '서비스 관리'],
    ['SERVER MANAGEMENT', '서버 관리'],
    ['ACCOUNT MANAGEMENT', '계정 관리'],
    ['Power Actions', '전원 작업'],
    ['Build Configuration', '빌드 설정'],
    ['Feature Limits', '기능 제한'],
    ['Assigned Allocations', '할당된 포트'],
    ['Primary Allocation', '기본 포트 할당'],
    ['Create Allocation', '포트 할당 생성'],
    ['Create Node', '노드 생성'],
    ['Create User', '사용자 생성'],
    ['Create Location', '위치 생성'],
    ['Create Nest', '네스트 생성'],
    ['Create Egg', 'Egg 생성'],
    ['Create Database Host', '데이터베이스 호스트 생성'],
    ['Delete Server', '서버 삭제'],
    ['Delete Node', '노드 삭제'],
    ['Delete User', '사용자 삭제'],
    ['Delete Allocation', '포트 할당 삭제'],
    ['Delete Database', '데이터베이스 삭제'],
    ['Delete Backup', '백업 삭제'],
    ['Edit Server', '서버 편집'],
    ['Edit Node', '노드 편집'],
    ['Edit User', '사용자 편집'],
    ['Edit Allocation', '포트 할당 편집'],
    ['Save Changes', '변경 사항 저장'],
    ['Save Content', '내용 저장'],
    ['Reset', '초기화'],
    ['Submit', '제출'],
    ['Create', '생성'],
    ['Update', '업데이트'],
    ['Delete', '삭제'],
    ['Install', '설치'],
    ['Reinstall', '재설치'],
    ['Suspended', '정지됨'],
    ['Installing', '설치 중'],
    ['Install Failed', '설치 실패'],
    ['Stopped', '중지됨'],
    ['Stopping', '중지 중'],
    ['Starting', '시작 중'],
    ['Running', '실행 중'],
    ['Offline', '오프라인'],
    ['Online', '온라인'],
    ['Failed', '실패'],
    ['Successful', '성공'],
    ['Enabled', '활성화'],
    ['Disabled', '비활성화'],
    ['Public', '공개'],
    ['Private', '비공개'],
    ['Maintenance Mode', '점검 모드'],
    ['Docker Containers', 'Docker 컨테이너'],
    ['CPU Usage', 'CPU 사용량'],
    ['Memory Usage', '메모리 사용량'],
    ['Disk Usage', '디스크 사용량'],
    ['Bandwidth', '대역폭'],
    ['Upload', '업로드'],
    ['Download', '다운로드'],
    ['File Manager', '파일 관리자'],
    ['Create Folder', '폴더 생성'],
    ['Upload Files', '파일 업로드'],
    ['Download Backup', '백업 다운로드'],
    ['Restore Backup', '백업 복원'],
    ['Create Backup', '백업 생성'],
    ['Schedule Name', '스케줄 이름'],
    ['Last Run', '마지막 실행'],
    ['Next Run', '다음 실행'],
    ['Disk', '디스크'],
    ['CPU', 'CPU'],
    ['Version', '버전'],
    ['Address', '주소'],
    ['Port', '포트'],
    ['Ports', '포트'],
    ['Daemon Port', '데몬 포트'],
    ['Daemon SFTP Port', '데몬 SFTP 포트'],
    ['Communicate Over SSL', 'SSL로 통신'],
    ['Behind Proxy', '프록시 뒤에 있음'],
    ['FQDN', 'FQDN'],
    ['Aliases', '별칭'],
    ['Search', '검색'],
    ['Search Files...', '파일 검색...'],
    ['Filter', '필터'],
    ['Loading...', '불러오는 중...'],
    ['No data available.', '표시할 데이터가 없습니다.'],
    ['No allocations available.', '사용 가능한 포트 할당이 없습니다.'],
    ['No server selected.', '선택된 서버가 없습니다.'],
    ['An error was encountered while processing this request.', '요청 처리 중 오류가 발생했습니다.'],
    ['The selected server is currently offline.', '선택한 서버는 현재 오프라인입니다.'],
    ['This action cannot be undone.', '이 작업은 되돌릴 수 없습니다.'],
    ['Are you sure you want to continue?', '정말 계속하시겠습니까?'],
    ['You are not authorized to perform this action.', '이 작업을 수행할 권한이 없습니다.'],
    ['Internal Server Error', '내부 서버 오류'],
    ['Not Found', '찾을 수 없음'],
    ['Forbidden', '접근 금지'],
    ['Unauthorized', '인증 필요'],
    ['Confirm', '확인'],
    ['Allocation Management', '포트 할당 관리'],
    ['Application Feature Limits', '기능 제한'],
    ['Resource Management', '리소스 관리'],
    ['Nest Configuration', 'Nest 설정'],
    ['Docker Configuration', 'Docker 설정'],
    ['Startup Configuration', '시작 설정'],
    ['Service Variables', '서비스 변수'],
    ['Create Server', '서버 생성'],
    ['Core Details', '기본 정보'],
    ['Node Allocations', '노드 포트 할당'],
    ['Default Allocation', '기본 포트 할당'],
    ['Additional Allocation(s)', '추가 포트 할당'],
    ['Start Server when Installed', '설치 후 서버 자동 시작'],
    ['Skip Egg Install Script', 'Egg 설치 스크립트 건너뛰기'],
    ['Update Docker Image', 'Docker 이미지 업데이트'],
    ['Unsupported Java Version', '지원되지 않는 Java 버전'],
    ['Running Installer', '설치 진행 중'],
    ['Your server should be ready soon, please try again in a few minutes.', '서버 설치가 진행 중입니다. 잠시 후 다시 시도해 주세요.'],
    ['This server is currently running an unsupported version of Java and cannot be started. Please select a supported version from the list below to continue starting the server.', '이 서버는 현재 지원되지 않는 Java 버전을 사용하고 있어 시작할 수 없습니다. 아래 목록에서 지원되는 버전을 선택한 뒤 다시 시작하세요.'],
    ['This server is in a failed install state and cannot be recovered. Please delete and re-create the server.', '이 서버는 설치 실패 상태이며 복구할 수 없습니다. 삭제 후 다시 생성해야 합니다.'],
    ['The allocation id field is required.', '포트 할당 항목은 필수입니다.'],
    ['The io must be between 10 and 1000.', 'IO 값은 10에서 1000 사이여야 합니다.'],
    ['Current Egg', '현재 Egg'],
    ['Default Connection', '기본 접속 정보'],
    ['Connection Alias', '연결 별칭'],
    ['Internal Identifier', '내부 식별자'],
    ['External Identifier', '외부 식별자'],
    ['UUID / Docker Container ID', 'UUID / Docker 컨테이너 ID'],
    ['Enable OOM Killer', 'OOM Killer 활성화'],
    ['Docker Image', 'Docker 이미지'],
    ['Startup Command', '시작 명령'],
    ['Server Jar File', '서버 Jar 파일'],
    ['Server Version', '서버 버전'],
    ['Minecraft Version', '마인크래프트 버전'],
    ['Build Type', '빌드 타입'],
    ['Forge Version', 'Forge 버전'],
    ['CPU Limit', 'CPU 제한'],
    ['CPU Pinning', 'CPU 고정'],
    ['Block IO Weight', 'Block IO 가중치'],
    ['Disk Space', '디스크 공간'],
    ['Database Limit', '데이터베이스 제한'],
    ['Allocation Limit', '포트 할당 제한'],
    ['Backup Limit', '백업 제한'],
    ['Server Description', '서버 설명'],
    ['Server Owner', '서버 소유자'],
    ['Server Name', '서버 이름'],
    ['Databases', '데이터베이스'],
    ['Backups', '백업'],
    ['Database Hosts', '데이터베이스 호스트'],
    ['Locations', '위치'],
    ['Allocations', '포트 할당'],
    ['Applications API', '애플리케이션 API'],
    ['Application API', '애플리케이션 API'],
    ['Overview', '개요'],
    ['Configuration', '설정'],
    ['Settings', '설정'],
    ['Manage', '관리'],
    ['Startup', '시작 설정'],
    ['Reinstall Server', '서버 재설치'],
    ['Files', '파일'],
    ['Console', '콘솔'],
    ['Schedules', '스케줄'],
    ['Users', '사용자'],
    ['Subusers', '하위 사용자'],
    ['Network', '네트워크'],
    ['Activity', '활동'],
    ['Mounts', '마운트'],
    ['Nests', '네스트'],
    ['Nodes', '노드'],
    ['Servers', '서버'],
    ['Back', '뒤로'],
    ['Next', '다음'],
    ['Admin', '관리자'],
    ['Home', '홈'],
    ['Name', '이름'],
    ['Description', '설명'],
    ['Memory', '메모리'],
    ['Swap', '스왑'],
    ['Node', '노드'],
    ['Server', '서버'],
    ['User', '사용자'],
    ['Location', '위치'],
    ['Mount', '마운트'],
    ['Nest', '네스트'],
    ['Egg', 'Egg'],
    ['Cancel', '취소'],
    ['Start', '시작'],
    ['Stop', '중지'],
    ['Restart', '재시작'],
    ['Kill', '강제 종료'],
    ['Send Command', '명령 전송'],
    ['Resource Usage', '리소스 사용량'],
    ['Admin Overview', '관리 개요'],
    ['Manage Server', '서버 관리'],
    ['Server Details', '서버 상세 정보'],
    ['Node Details', '노드 상세 정보'],
    ['User Details', '사용자 상세 정보'],
  ]);

  const ATTRIBUTE_REPLACEMENTS = new Map([
    ['placeholder', TEXT_REPLACEMENTS],
    ['value', TEXT_REPLACEMENTS],
    ['title', TEXT_REPLACEMENTS],
    ['aria-label', TEXT_REPLACEMENTS],
  ]);

  const replaceText = (value) => {
    if (!value) return value;
    let next = value;
    const replacements = Array.from(TEXT_REPLACEMENTS.entries()).sort((a, b) => b[0].length - a[0].length);
    for (const [source, target] of replacements) {
      next = next.replaceAll(source, target);
    }
    return next;
  };

  const processNode = (node) => {
    if (node.nodeType === Node.TEXT_NODE) {
      const next = replaceText(node.nodeValue || '');
      if (next !== node.nodeValue) {
        node.nodeValue = next;
      }
      return;
    }

    if (node.nodeType !== Node.ELEMENT_NODE) return;

    for (const [attribute] of ATTRIBUTE_REPLACEMENTS.entries()) {
      if (node.hasAttribute(attribute)) {
        const current = node.getAttribute(attribute);
        const next = replaceText(current || '');
        if (next !== current) {
          node.setAttribute(attribute, next);
        }
      }
    }

    for (const child of node.childNodes) {
      processNode(child);
    }
  };

  const apply = () => processNode(document.body);

  const observer = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      for (const node of mutation.addedNodes) {
        processNode(node);
      }
      if (mutation.type === 'characterData' && mutation.target) {
        processNode(mutation.target);
      }
    }
  });

  const start = () => {
    apply();
    observer.observe(document.body, {
      childList: true,
      subtree: true,
      characterData: true,
    });
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start, { once: true });
  } else {
    start();
  }
})();
