import { db } from "./firebase-config.js";
import {
  ref,
  get,
  query,
  orderByChild,
  equalTo,
  onValue,
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-database.js";

/* =========================
   중앙 집중식 Foster 데이터 관리자
   - RTDB users 접근을 단일화
   - 실시간 업데이트 지원
   - 구독 패턴으로 여러 모듈에 데이터 배포
========================= */

class FosterDataManager {
  constructor() {
    this.fostersData = null; // 전체 foster 데이터 캐시
    this.listeners = new Set(); // 데이터 변경 구독자들
    this.isInitialized = false;
    this.unsubscribe = null; // Firebase 리스너 해제 함수
    this.initPromise = null; // 초기화 Promise
  }

  /**
   * 초기화 및 실시간 리스너 등록
   * @param {boolean} realtime - 실시간 업데이트 사용 여부 (기본: false)
   */
  async initialize(realtime = false) {
    // 이미 초기화 중이면 해당 Promise 반환
    if (this.initPromise) {
      console.log("[FosterDataManager] 초기화 대기 중...");
      return this.initPromise;
    }

    if (this.isInitialized) {
      console.log("[FosterDataManager] 이미 초기화됨");
      return this.fostersData;
    }

    // 초기화 Promise 생성 및 저장
    this.initPromise = (async () => {
      try {
        if (realtime) {
          // 실시간 업데이트 모드
          await this.enableRealtime();
        } else {
          // 일회성 조회 모드
          await this.fetchOnce();
        }

        this.isInitialized = true;
        console.log(`[FosterDataManager] ✅ 초기화 완료 (${this.fostersData?.length || 0}명)`);
        return this.fostersData;
      } catch (error) {
        console.error("[FosterDataManager] ❌ 초기화 실패:", error);
        this.initPromise = null; // 실패 시 재시도 가능하도록 초기화
        throw error;
      }
    })();

    return this.initPromise;
  }

  /**
   * 초기화가 완료될 때까지 대기
   */
  async waitForInit() {
    if (this.isInitialized) return this.fostersData;
    if (this.initPromise) return this.initPromise;
    throw new Error("[FosterDataManager] 초기화되지 않음. initialize()를 먼저 호출하세요.");
  }

  /**
   * 일회성 데이터 조회
   */
  async fetchOnce() {
    console.log("[FosterDataManager] 🔍 RTDB 조회 시작...");

    const usersRef = ref(db, "users");

    try {
      // 먼저 쿼리 시도
      const q = query(usersRef, orderByChild("userType"), equalTo("foster"));
      let snap;

      try {
        snap = await get(q);
      } catch (queryError) {
        // 인덱스 오류 시 전체 조회 후 필터링
        console.warn("[FosterDataManager] ⚠️ 쿼리 실패, 전체 조회 후 필터링:", queryError.message);
        const fullSnap = await get(usersRef);

        if (!fullSnap.exists()) {
          this.fostersData = [];
          return [];
        }

        const allData = fullSnap.val();
        this.fostersData = Object.entries(allData)
          .filter(([_, user]) => user.userType === "foster")
          .map(([uid, user]) => ({
            uid,
            userType: user.userType,
            fosterInfo: user.fosterInfo || {},
          }));

        console.log("[FosterDataManager] ✅ 전체 조회 필터링 완료:", this.fostersData.length, "명");
        return this.fostersData;
      }

      // 쿼리 성공 시 계속 진행
      snap = await get(q);

      if (!snap.exists()) {
        console.warn("[FosterDataManager] ⚠️ RTDB에 데이터가 없습니다.");
        this.fostersData = [];
        return [];
      }

      const obj = snap.val();
      console.log("[FosterDataManager] 📥 RTDB 원본 데이터:", Object.keys(obj).length, "개 항목");

      // userType 검증 및 파싱
      this.fostersData = Object.entries(obj)
        .map(([uid, user]) => ({
          uid,
          userType: user.userType || "foster",
          fosterInfo: user.fosterInfo || {},
        }))
        .filter(user => user.userType === "foster"); // 추가 필터링

      // userType 분포 확인 (디버깅용)
      const typeDistribution = Object.entries(obj).reduce((acc, [_, user]) => {
        const type = user.userType || 'undefined';
        acc[type] = (acc[type] || 0) + 1;
        return acc;
      }, {});
      console.log("[FosterDataManager] 📊 userType 분포:", typeDistribution);

      console.log("[FosterDataManager] ✅ 데이터 파싱 완료:", this.fostersData.length, "명 (foster만 필터링)");

      return this.fostersData;
    } catch (error) {
      console.error("[FosterDataManager] ❌ RTDB 조회 실패:", error);
      throw error;
    }
  }

  /**
   * 실시간 업데이트 활성화
   */
  async enableRealtime() {
    if (this.unsubscribe) {
      console.warn("[FosterDataManager] 실시간 리스너가 이미 활성화되어 있습니다");
      return;
    }

    const usersRef = ref(db, "users");
    const q = query(usersRef, orderByChild("userType"), equalTo("foster"));

    return new Promise((resolve) => {
      this.unsubscribe = onValue(
        q,
        (snap) => {
          if (!snap.exists()) {
            this.fostersData = [];
            this.notifyListeners();
            resolve([]);
            return;
          }

          const obj = snap.val();
          this.fostersData = Object.entries(obj).map(([uid, user]) => ({
            uid,
            userType: user.userType || "foster",
            fosterInfo: user.fosterInfo || {},
          }));

          this.notifyListeners();
          console.log(`[FosterDataManager] 실시간 업데이트: ${this.fostersData.length}명`);
          resolve(this.fostersData);
        },
        (error) => {
          console.error("[FosterDataManager] 실시간 리스너 오류:", error);
          resolve([]);
        }
      );
    });
  }

  /**
   * 데이터 변경 구독
   * @param {Function} callback - 데이터 변경 시 호출될 콜백 함수
   * @param {string} subscriberId - 구독자 ID (중복 방지용, 선택)
   * @returns {Function} 구독 해제 함수
   */
  subscribe(callback, subscriberId = null) {
    // 중복 구독 방지
    if (subscriberId) {
      // 이미 같은 ID로 구독 중이면 무시
      const existingCallback = Array.from(this.listeners).find(
        cb => cb._subscriberId === subscriberId
      );
      if (existingCallback) {
        console.warn(`[FosterDataManager] 이미 구독 중: ${subscriberId}`);
        return () => {}; // 빈 함수 반환
      }
      callback._subscriberId = subscriberId;
    }

    this.listeners.add(callback);

    // 이미 데이터가 있으면 즉시 호출
    if (this.fostersData !== null) {
      callback(this.fostersData);
    }

    // 구독 해제 함수 반환
    return () => {
      this.listeners.delete(callback);
    };
  }

  /**
   * 모든 구독자에게 데이터 변경 알림
   */
  notifyListeners() {
    this.listeners.forEach((callback) => {
      try {
        callback(this.fostersData);
      } catch (error) {
        console.error("[FosterDataManager] 리스너 실행 오류:", error);
      }
    });
  }

  /**
   * 현재 캐시된 데이터 반환
   */
  getData() {
    return this.fostersData;
  }

  /**
   * 활동 중인 foster만 필터링
   */
  getActiveFosters() {
    if (!this.fostersData) return [];
    return this.fostersData.filter(
      (f) => f.fosterInfo?.isAvailable === true
    );
  }

  /**
   * 수동으로 데이터 새로고침
   */
  async refresh() {
    console.log("[FosterDataManager] 수동 새로고침 시작");
    await this.fetchOnce();
    this.notifyListeners();
    return this.fostersData;
  }

  /**
   * 리스너 해제 및 정리
   */
  destroy() {
    if (this.unsubscribe) {
      this.unsubscribe();
      this.unsubscribe = null;
    }
    this.listeners.clear();
    this.fostersData = null;
    this.isInitialized = false;
    console.log("[FosterDataManager] 정리 완료");
  }
}

// 싱글톤 인스턴스
const fosterDataManager = new FosterDataManager();

// 디버그용 전역 노출 (개발 환경에서만)
if (typeof window !== 'undefined') {
  window.__fosterDataManager = fosterDataManager;

  // 디버그 헬퍼 함수들
  window.__fosterDebug = {
    // 전체 데이터 확인
    getData: () => fosterDataManager.getData(),

    // userType 분포 확인
    getTypeDistribution: () => {
      const data = fosterDataManager.getData() || [];
      const dist = data.reduce((acc, user) => {
        const type = user.userType || 'undefined';
        acc[type] = (acc[type] || 0) + 1;
        return acc;
      }, {});
      console.table(dist);
      return dist;
    },

    // foster가 아닌 사용자 찾기
    getNonFoster: () => {
      const data = fosterDataManager.getData() || [];
      const nonFoster = data.filter(u => u.userType !== "foster");
      console.log(`foster가 아닌 사용자: ${nonFoster.length}명`);
      console.table(nonFoster.slice(0, 20).map(u => ({
        uid: u.uid,
        userType: u.userType,
        name: u.fosterInfo?.name || u.shelterInfo?.name || 'N/A'
      })));
      return nonFoster;
    },

    // 활동 중인 foster 확인
    getActiveFosters: () => {
      const active = fosterDataManager.getActiveFosters();
      console.log(`활동 중인 foster: ${active.length}명`);
      return active;
    },

    // 전체 요약
    summary: () => {
      const data = fosterDataManager.getData() || [];
      const active = fosterDataManager.getActiveFosters();
      const typeDist = data.reduce((acc, user) => {
        const type = user.userType || 'undefined';
        acc[type] = (acc[type] || 0) + 1;
        return acc;
      }, {});

      console.log("=== Foster 데이터 요약 ===");
      console.log("총 로드된 데이터:", data.length, "개");
      console.log("userType 분포:", typeDist);
      console.log("활동 중인 foster:", active.length, "명");
      console.log("========================");

      return { total: data.length, types: typeDist, active: active.length };
    }
  };

  console.log("🔧 [Debug] 디버그 도구 사용 가능:");
  console.log("  - window.__fosterDebug.summary()");
  console.log("  - window.__fosterDebug.getTypeDistribution()");
  console.log("  - window.__fosterDebug.getNonFoster()");
}

export default fosterDataManager;
