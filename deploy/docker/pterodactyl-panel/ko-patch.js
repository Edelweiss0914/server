(function () {
  const TEXT_REPLACEMENTS = new Map([
    ['Create Server', '서버 생성'],
    ['Core Details', '기본 정보'],
    ['Allocation Management', '포트 할당 관리'],
    ['Application Feature Limits', '기능 제한'],
    ['Resource Management', '리소스 관리'],
    ['Nest Configuration', 'Nest 설정'],
    ['Docker Configuration', 'Docker 설정'],
    ['Startup Configuration', '시작 설정'],
    ['Service Variables', '서비스 변수'],
    ['Server Name', '서버 이름'],
    ['Server Owner', '서버 소유자'],
    ['Server Description', '서버 설명'],
    ['Start Server when Installed', '설치 후 서버 자동 시작'],
    ['Node', '노드'],
    ['Default Allocation', '기본 포트 할당'],
    ['Additional Allocation(s)', '추가 포트 할당'],
    ['Database Limit', '데이터베이스 제한'],
    ['Allocation Limit', '포트 할당 제한'],
    ['Backup Limit', '백업 제한'],
    ['CPU Limit', 'CPU 제한'],
    ['CPU Pinning', 'CPU 고정'],
    ['Memory', '메모리'],
    ['Swap', '스왑'],
    ['Disk Space', '디스크 공간'],
    ['Block IO Weight', 'Block IO 가중치'],
    ['Enable OOM Killer', 'OOM Killer 활성화'],
    ['Nest', 'Nest'],
    ['Egg', 'Egg'],
    ['Skip Egg Install Script', 'Egg 설치 스크립트 건너뛰기'],
    ['Docker Image', 'Docker 이미지'],
    ['Startup Command', '시작 명령'],
    ['Server Jar File', '서버 Jar 파일'],
    ['Server Version', '서버 버전'],
    ['Build Type', '빌드 타입'],
    ['Forge Version', 'Forge 버전'],
    ['Running Installer', '설치 진행 중'],
    ['Your server should be ready soon, please try again in a few minutes.', '서버 설치가 진행 중입니다. 잠시 후 다시 시도해 주세요.'],
    ['Unsupported Java Version', '지원되지 않는 Java 버전'],
    ['This server is currently running an unsupported version of Java and cannot be started. Please select a supported version from the list below to continue starting the server.', '이 서버는 현재 지원되지 않는 Java 버전을 사용하고 있어 시작할 수 없습니다. 아래 목록에서 지원되는 버전을 선택한 뒤 다시 시작하세요.'],
    ['Cancel', '취소'],
    ['Update Docker Image', 'Docker 이미지 업데이트'],
    ['Manage', '관리'],
    ['Startup', '시작 설정'],
    ['Settings', '설정'],
    ['Reinstall Server', '서버 재설치'],
    ['Files', '파일'],
    ['Console', '콘솔'],
    ['Databases', '데이터베이스'],
    ['Schedules', '스케줄'],
    ['Users', '사용자'],
    ['Network', '네트워크'],
    ['Activity', '활동'],
    ['Node Allocations', '노드 포트 할당'],
    ['Configuration', '설정'],
    ['Nodes', '노드'],
    ['Servers', '서버'],
    ['Admin', '관리자'],
    ['Home', '홈'],
    ['Name', '이름'],
    ['Description', '설명'],
    ['Default Connection', '기본 접속 정보'],
    ['Connection Alias', '연결 별칭'],
    ['Current Egg', '현재 Egg'],
    ['Internal Identifier', '내부 식별자'],
    ['External Identifier', '외부 식별자'],
    ['UUID / Docker Container ID', 'UUID / Docker 컨테이너 ID'],
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
