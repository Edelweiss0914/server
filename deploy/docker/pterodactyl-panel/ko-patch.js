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
    ['The node which this server will be deployed to.', '이 서버를 배치할 노드입니다.'],
    ['The main allocation that will be assigned to this server.', '이 서버에 기본으로 할당될 포트입니다.'],
    ['Additional allocations to assign to this server on creation.', '서버 생성 시 함께 할당할 추가 포트입니다.'],
    ['The total number of databases a user is allowed to create for this server.', '이 서버에서 사용자가 생성할 수 있는 데이터베이스 총 수입니다.'],
    ['The total number of allocations a user is allowed to create for this server.', '이 서버에서 사용자가 생성할 수 있는 추가 포트 총 수입니다.'],
    ['The total number of backups that can be created for this server.', '이 서버에서 생성할 수 있는 백업 총 수입니다.'],
    ['If you do not want to limit CPU usage, set the value to 0. To determine a value, take the number of threads and multiply it by 100. For example, on a quad core system without hyperthreading (4 * 100 = 400) there is 400% available. To limit a server to using half of a single thread, you would set the value to 50. To allow a server to use up to two threads, set the value to 200.', 'CPU 사용량을 제한하지 않으려면 0으로 설정하세요. 값은 사용할 스레드 수에 100을 곱해 계산합니다. 예를 들어 하이퍼스레딩 없는 4코어 시스템은 400%입니다. 한 스레드의 절반만 허용하려면 50, 두 스레드까지 허용하려면 200으로 설정합니다.'],
    ['Advanced: Enter the specific CPU threads that this process can run on, or leave blank to allow all threads. This can be a single number, or a comma separated list. Example: 0, 0-1,3, or 0,1,3,4.', '고급 설정: 이 프로세스가 실행될 CPU 스레드를 지정하거나, 비워두어 모든 스레드를 허용할 수 있습니다. 단일 숫자 또는 쉼표로 구분한 목록을 사용할 수 있습니다. 예: 0, 0-1,3, 0,1,3,4'],
    ['The maximum amount of memory allowed for this container. Setting this to 0 will allow unlimited memory in a container.', '이 컨테이너에 허용할 최대 메모리입니다. 0으로 설정하면 메모리 제한 없이 실행됩니다.'],
    ['Setting this to 0 will disable swap space on this server. Setting to -1 will allow unlimited swap.', '0으로 설정하면 이 서버의 스왑을 비활성화합니다. -1은 무제한 스왑을 허용합니다.'],
    ['This server will not be allowed to boot if it is using more than this amount of space. If a server goes over this limit while running it will be safely stopped and locked until enough space is available. Set to 0 to allow unlimited disk usage.', '이 서버가 이 값을 초과하는 디스크 공간을 사용 중이면 부팅되지 않습니다. 실행 중 초과하면 안전하게 중지되고, 충분한 공간이 확보될 때까지 잠깁니다. 0으로 설정하면 디스크 제한이 없습니다.'],
    ['Advanced: The IO performance of this server relative to other running containers on the system. Value should be between 10 and 1000. Please see this documentation for more information about it.', '고급 설정: 이 서버의 디스크 IO 성능을 같은 시스템에서 실행 중인 다른 컨테이너와 비교해 가중치로 지정합니다. 값은 10에서 1000 사이여야 합니다. 자세한 내용은 문서를 참고하세요.'],
    ['Terminates the server if it breaches the memory limits. Enabling OOM killer may cause server processes to exit unexpectedly.', '메모리 제한을 초과하면 서버를 종료합니다. OOM Killer를 활성화하면 서버 프로세스가 예기치 않게 종료될 수 있습니다.'],
    ['Select the Nest that this server will be grouped under.', '이 서버가 속할 Nest를 선택합니다.'],
    ['Select the Egg that will define how this server should operate.', '이 서버의 실행 방식을 정의할 Egg를 선택합니다.'],
    ['If the selected Egg has an install script attached to it, the script will run during the install. If you would like to skip this step, check this box.', '선택한 Egg에 설치 스크립트가 있으면 설치 중 자동으로 실행됩니다. 이 단계를 건너뛰려면 이 항목을 체크하세요.'],
    ['This is the default Docker image that will be used to run this server. Select an image from the dropdown above, or enter a custom image in the text field above.', '이 서버 실행에 사용할 기본 Docker 이미지입니다. 위 목록에서 이미지를 선택하거나, 직접 커스텀 이미지를 입력할 수 있습니다.'],
    ['The following data substitutes are available for the startup command: {{SERVER_MEMORY}}, {{SERVER_IP}}, and {{SERVER_PORT}}. They will be replaced with the allocated memory, server IP, and server port respectively.', '시작 명령에서는 {{SERVER_MEMORY}}, {{SERVER_IP}}, {{SERVER_PORT}} 치환자를 사용할 수 있습니다. 각각 할당 메모리, 서버 IP, 서버 포트로 바뀝니다.'],
    ['The name of the Jarfile to use when running Forge version below 1.17.', 'Forge 1.17 미만 버전 실행 시 사용할 Jar 파일 이름입니다.'],
    ['The version of minecraft you want to install for. Leaving latest will install the latest recommended version.', '설치할 Minecraft 버전입니다. latest로 두면 최신 권장 버전이 설치됩니다.'],
    ['The type of server jar to download from forge. Valid types are "recommended" and "latest".', 'Forge에서 내려받을 서버 jar 유형입니다. 사용할 수 있는 값은 "recommended" 와 "latest" 입니다.'],
    ['The full exact version. Ex. 1.15.2-31.2.4 Overrides MC_VERSION and BUILD_TYPE. If it fails to download the server files it will fail to install.', '정확한 전체 Forge 버전입니다. 예: 1.15.2-31.2.4. 입력하면 MC_VERSION과 BUILD_TYPE보다 우선합니다. 서버 파일 다운로드에 실패하면 설치도 실패합니다.'],
    ['Character limits: a-z A-Z 0-9 _ - . and [Space].', '사용 가능한 문자는 a-z, A-Z, 0-9, _, -, ., 공백입니다.'],
    ['Email address of the Server Owner.', '서버 소유자의 이메일 주소입니다.'],
    ['A brief description of this server.', '이 서버에 대한 짧은 설명입니다.'],
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
