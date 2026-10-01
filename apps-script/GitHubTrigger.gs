/**
 * 브랜드검색 기획전 D-7 만료 예정 모니터링 전용 GitHub Actions 트리거.
 * 이 프로젝트는 도착 링크/라이브/상품 판매상태 모니터링을 호출하지 않는다.
 *
 * Required script property:
 * - GITHUB_PAT
 */
const GITHUB_MONITOR_OWNER = 'hsadmiaomiao';
const GITHUB_MONITOR_REPOSITORY = 'lge-brand-search-upcoming-monitor';
const GITHUB_MONITOR_WORKFLOW = 'upcoming-expiration-monitor.yml';
const GITHUB_MONITOR_BRANCH = 'main';
const GITHUB_MONITOR_TRIGGER_FUNCTION = 'runUpcomingExpirationMonitorFromAppsScript';

function runUpcomingExpirationMonitorFromAppsScript() {
  const token = PropertiesService.getScriptProperties().getProperty('GITHUB_PAT');
  if (!token) throw new Error('Script Property GITHUB_PAT가 설정되지 않았습니다.');

  const endpoint = `https://api.github.com/repos/${GITHUB_MONITOR_OWNER}/${GITHUB_MONITOR_REPOSITORY}` +
    `/actions/workflows/${GITHUB_MONITOR_WORKFLOW}/dispatches`;
  const response = UrlFetchApp.fetch(endpoint, {
    method: 'post',
    contentType: 'application/json',
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28'
    },
    payload: JSON.stringify({ ref: GITHUB_MONITOR_BRANCH }),
    muteHttpExceptions: true
  });

  if (response.getResponseCode() !== 204) {
    throw new Error(`GitHub workflow 실행 실패 (${response.getResponseCode()}): ${response.getContentText()}`);
  }
  return `D-7 실행 요청 완료: ${Utilities.formatDate(new Date(), 'Asia/Seoul', 'yyyy-MM-dd HH:mm:ss')}`;
}

function setupUpcomingMonitorTriggers() {
  ScriptApp.getProjectTriggers()
    .filter(trigger => trigger.getHandlerFunction() === GITHUB_MONITOR_TRIGGER_FUNCTION)
    .forEach(trigger => ScriptApp.deleteTrigger(trigger));

  [1, 25].forEach(day => {
    ScriptApp.newTrigger(GITHUB_MONITOR_TRIGGER_FUNCTION)
      .timeBased()
      .onMonthDay(day)
      .atHour(8)
      .nearMinute(0)
      .inTimezone('Asia/Seoul')
      .create();
  });

  ScriptApp.newTrigger(GITHUB_MONITOR_TRIGGER_FUNCTION)
    .timeBased()
    .onWeekDay(ScriptApp.WeekDay.MONDAY)
    .atHour(8)
    .nearMinute(0)
    .inTimezone('Asia/Seoul')
    .create();

  return 'D-7 트리거 설정 완료: 매월 1일·25일, 매주 월요일 오전 8시';
}

function createWeeklyUpcomingMonitorTrigger() {
  return setupUpcomingMonitorTriggers();
}

function testGitHubMonitorTrigger() {
  return runUpcomingExpirationMonitorFromAppsScript();
}
