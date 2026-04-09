import fosterDataManager from "./foster-data-manager.js";

/* =========================
   Foster 페이지 진입점
   - 중앙 데이터 관리자 초기화
   - 모든 foster 관련 모듈이 로드되기 전에 실행
========================= */

(async function initFosterPage() {
  try {
    console.log("🚀 [foster-init] 데이터 관리자 초기화 시작...");

    // 실시간 업데이트 활성화 여부 (필요시 true로 변경)
    const useRealtime = false;

    const data = await fosterDataManager.initialize(useRealtime);

    console.log(
      `✅ [foster-init] 초기화 완료! (${data?.length || 0}명 로드됨)`
    );

    // 데이터 확인용 로그
    if (data && data.length > 0) {
      console.log("📦 [foster-init] 첫 번째 데이터 샘플:", data[0]);
    } else {
      console.warn("⚠️ [foster-init] 데이터가 없습니다. Firebase 연결 및 데이터를 확인하세요.");
    }
  } catch (error) {
    console.error("❌ [foster-init] 초기화 실패:", error);
  }
})();

// 페이지 언로드 시 정리
window.addEventListener("beforeunload", () => {
  fosterDataManager.destroy();
});
