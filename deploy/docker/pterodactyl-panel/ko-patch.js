(function () {
  const TEXT_REPLACEMENTS = new Map([
    ['BASIC ADMINISTRATION', '기본 관리'],
    ['SERVICE MANAGEMENT', '서비스 관리'],
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
  ]);

  const ATTRIBUTE_REPLACEMENTS = new Map([
    ['placeholder', TEXT_REPLACEMENTS],
    ['value', TEXT_REPLACEMENTS],
    ['title', TEXT_REPLACEMENTS],
  ]);

  const replaceText = (value) => {
    if (!value) return value;
    let next = value;
    for (const [source, target] of TEXT_REPLACEMENTS.entries()) {
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
