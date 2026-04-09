import { showLoader, setLoaderProgress, hideLoader } from "./loader.js";
import("./loader.js").then(m => console.log(m));

import { goPetDetail } from "./navigation.js";
import { goShelterDetail } from "./navigation.js";


/*************************
 * 0 GLOBAL STATE
 *************************/
const APP = {
  animals: [],        // 전체 역사 데이터 (차트용)
  liveAnimals: [],    // 현재 보호중인 동물 (PetCards용)
  shelters: [],       // 보호소 목록 (Top5, Map용)
  meta: {}            // 전역 통계 (Summary용)
};

const CONFIG = {
  DATA_URL: 'https://pum--on-default-rtdb.firebaseio.com/rescuedAnimals.json',
  SIDO_URL: 'https://unpkg.com/realmap-collection/kr-sido-low.geo.json',
  TOP_SHELTERS_COUNT: 5,
  DEFAULT_PET_LIMIT: 4,
  SCROLL_SPEED: 30,
  ANIMATION_DURATION: 800,
  REGION: '경기도',
  PRESSURE_THRESHOLDS: {
    DANGER: 70,
    WARNING: 40
  }
};

let isTop5Dragging = false;

/*************************
 * 1 UTILITY FUNCTIONS
 *************************/

/**
 * 수용률 계산
 * @param {number} currentCount - 현재 보호 동물 수
 * @param {number} capacity - 최대 수용 정원
 * @returns {number} 수용률 (0-100)
 */
function calcPressure(currentCount, capacity) {
  if (!capacity || capacity <= 0) return 0;
  const rate = (currentCount / capacity) * 100;
  return Math.min(Math.round(rate), 100);
}

/**
 * 최근 30일 이내 날짜인지 확인
 * @param {string} yyyymmdd - 날짜 문자열 (YYYYMMDD 형식)
 * @returns {boolean}
 */
function isWithinLastMonth(yyyymmdd) {
  if (!yyyymmdd || yyyymmdd.length !== 8) return false;

  const year = parseInt(yyyymmdd.slice(0, 4));
  const month = parseInt(yyyymmdd.slice(4, 6)) - 1; // JS Date는 0부터 시작
  const day = parseInt(yyyymmdd.slice(6, 8));

  const itemDate = new Date(year, month, day);
  const today = new Date();
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(today.getDate() - 30);

  return itemDate >= thirtyDaysAgo && itemDate <= today;
}

/**
 * 중첩된 배열을 평탄화
 * @param {*} item - 평탄화할 항목
 * @returns {Array} 평탄화된 배열
 */
function flatten(item) {
  const result = [];

  if (Array.isArray(item)) {
    item.forEach(inner => {
      result.push(...flatten(inner));
    });
  } else if (item && typeof item === "object") {
    result.push(item);
  }

  return result;
}

/**
 * 날짜 문자열 가져오기 (fallback 포함)
 * @param {object} animal - 동물 객체
 * @returns {string} 날짜 문자열
 */
function getAnimalDate(animal) {
  return animal.happenDt || animal.noticeSdt || "99999999";
}

/**
 * 수용률에 따른 CSS 클래스 반환
 * @param {number} pressure - 수용률
 * @returns {string} CSS 클래스명
 */
function getPressureClass(pressure) {
  if (pressure >= CONFIG.PRESSURE_THRESHOLDS.DANGER) return "progress-danger";
  if (pressure >= CONFIG.PRESSURE_THRESHOLDS.WARNING) return "progress-warning";
  return "progress-safe";
}

/**
 * 대시보드 색상 클래스 반환
 * @param {number} pressure - 수용률
 * @returns {string} CSS 클래스명
 */
function getDashboardColorClass(pressure) {
  if (pressure > 70) return "card-danger";
  if (pressure > 40) return "card-warning";
  return "card-null";
}

/*************************
 * 2 DATA PROCESSING
 *************************/

/**
 * 전체 역사 데이터 추출
 * @param {object} dataRoot - 데이터 루트 객체
 * @returns {Array} 평탄화된 동물 데이터 배열
 */
function extractHistoricalAnimals(dataRoot) {
  const allAnimals = [];

  Object.values(dataRoot).forEach(monthObj => {
    Object.values(monthObj).forEach(dayArr => {
      if (dayArr) {
        allAnimals.push(...flatten(dayArr));
      }
    });
  });

  return allAnimals;
}

/**
 * 동물 데이터 정규화
 * @param {Array} animals - 원본 동물 배열
 * @returns {Array} 정규화된 동물 배열
 */
function normalizeAnimalData(animals) {
  return animals.map(animal => ({
    ...animal,
    noticeSdt: animal.noticeSdt || animal.happenDt || "20260101"
  }));
}

/**
 * 보호중인 동물만 필터링 및 정렬
 * @param {Array} animals - 동물 배열
 * @returns {Array} 보호중인 동물 배열 (오래된 순)
 */
function filterAndSortProtectedAnimals(animals) {
  return animals
    .filter(animal => animal.processState === "보호중")
    .sort((a, b) => {
      const dateA = getAnimalDate(a);
      const dateB = getAnimalDate(b);
      return dateA.localeCompare(dateB);
    });
}

/**
 * 보호소 데이터 처리
 * @param {Array} shelterList - 원본 보호소 목록
 * @returns {Array} 처리된 보호소 배열
 */
function processShelterData(shelterList) {
  const processedShelters = [];

  shelterList.forEach(item => {
    const info = item.info || {};
    const capacity = parseInt(info.ACEPTNC_ABLTY_CNT);

    // 수용 정원이 없는 보호소는 제외
    if (!capacity || isNaN(capacity) || capacity <= 0) {
      return;
    }

    // 해당 보호소의 보호중인 동물 수 계산
    const protectedCount = Array.isArray(info.animals)
      ? info.animals.filter(a => a.processState?.includes("보호")).length
      : 0;

    processedShelters.push({
      careNm: info.careNm || "미등록",
      careAddr: info.careAddr || "미등록",
      capacity: capacity,
      count: protectedCount,
      pressure: calcPressure(protectedCount, capacity)
    });
  });

  return processedShelters;
}

/**
 * 시/군별 수용률 통계 계산
 * @param {Array} shelters - 보호소 배열
 * @returns {object} 시/군별 평균 수용률 객체
 */
function calculateCityPressureStats(shelters) {
  const cityStats = {};

  // 경기도 보호소만 필터링
  const gyeonggiShelters = shelters.filter(shelter =>
    shelter.careAddr && shelter.careAddr.includes(CONFIG.REGION)
  );

  // 시/군별로 수용률 집계
  gyeonggiShelters.forEach(shelter => {
    const addressParts = shelter.careAddr.split(" ");
    const cityName = addressParts[1]; // "경기도 수원시" -> "수원시"

    if (!cityName) return;

    if (!cityStats[cityName]) {
      cityStats[cityName] = { totalPressure: 0, count: 0 };
    }

    cityStats[cityName].totalPressure += shelter.pressure || 0;
    cityStats[cityName].count++;
  });

  // 시/군별 평균 수용률 계산
  const cityAveragePressure = {};
  for (const city in cityStats) {
    const stats = cityStats[city];
    cityAveragePressure[city] = Math.round(stats.totalPressure / stats.count);
  }

  return cityAveragePressure;
}

/*************************
 * 3 DATA LOAD
 *************************/

/**
 * 메인 데이터 로드 함수
 * @returns {Promise<boolean>} 성공 여부
 */
async function loadData() {
  try {
    const response = await fetch(CONFIG.DATA_URL);
    const rescued = await response.json();
    // const rescued = rawData.rescuedAnimals || {};

    // --- 역사 데이터 처리 ---
    const dataRoot = rescued.data || {};
    const historicalAnimals = extractHistoricalAnimals(dataRoot);

    APP.animals = normalizeAnimalData(historicalAnimals);
    APP.liveAnimals = filterAndSortProtectedAnimals(historicalAnimals);

    console.log("보호중인 동물:", APP.liveAnimals.length);

    // --- 보호소 데이터 처리 ---
    const shelterList = rescued.shelters?.list || [];
    APP.shelters = processShelterData(shelterList);
    APP.meta = rescued.shelters?.meta || {};

    // --- 지도 데이터 동기화 ---
    syncMapData(APP.shelters);

    return true;

  } catch (error) {
    console.error("데이터 로드 실패:", error);
    return false;
  }
}
window.loadData = loadData;

/**
 * 지도 데이터 동기화
 * @param {Array} shelters - 보호소 배열
 */
function syncMapData(shelters) {
  const cityPressureData = calculateCityPressureStats(shelters);

  // 지도 컴포넌트가 참조하는 전역 변수
  window.realGGValues = cityPressureData;

  console.log("지도 데이터 업데이트:", cityPressureData);
}

/*************************
 * 4 RENDER - PET CARDS
 *************************/

/**
 * 동물 카드 HTML 생성
 * @param {object} animal - 동물 객체
 * @returns {string} 카드 HTML
 */
function createPetCardHTML(animal) {
  const imageUrl = animal.popfile1 || animal.popfile2 || "./assets/images/img_404.png";

  return `
    <div class="petcard">
      <div class="card-top">
        <span class="process-badge">${animal.processState || "보호중"}</span>
        <img id="sampleImages" src="${imageUrl}" alt="${animal.kindNm}" onerror="this.src='./assets/images/img_404.png'">
      </div>
      <div class="description3">
        <div class="description2 t-L">
          <div class="t-S sub">${animal.kindNm} · ${animal.sexCd} · ${animal.age} · ${animal.weight || ""}</div>
          <div>${animal.kindNm}</div>
        </div>
        <div class="description2 t-L">
          <div class="t-S sub">공고 번호</div>
          <div>${animal.noticeNo || "-"}</div>
        </div>
        <div class="description2 t-L">
          <div class="t-S sub">보호센터</div>
          <div>${animal.careNm}</div>
        </div>
        <div class="description2 t-L">
          <div class="t-S sub">주소</div>
          <div>${animal.careAddr}</div>
        </div>
        <div class="description2 t-L">
          <div class="t-S sub">구조일자</div>
          <div>${animal.happenDt || ""}</div>
        </div>
      </div>
    </div>`;
}

/**
 * 동물 카드 렌더링
 * @param {HTMLElement} container - 컨테이너 요소
 * @param {Array} animals - 동물 배열
 * @param {number} limit - 표시할 최대 개수
 */
function renderPetCards(container, animals, limit = CONFIG.DEFAULT_PET_LIMIT) {
  if (!container) {
    console.warn("PetCards 컨테이너를 찾을 수 없습니다");
    return;
  }

  container.innerHTML = "";
  const itemsToShow = animals.slice(0, limit);

  if (itemsToShow.length === 0) {
    container.innerHTML = `<div class="t-M" style="padding:20px;">보호 중인 데이터가 없습니다.</div>`;
    return;
  }

  itemsToShow.forEach(animal => {
    const cardElement = document.createElement("div");
    cardElement.innerHTML = createPetCardHTML(animal);

    const card = cardElement.firstElementChild;
    if (!card) return;
    // ✅ attach to real card
    card.setAttribute("data-shelter-id", animal.desertionNo);

    container.appendChild(cardElement.firstElementChild);
  });

}

/*************************
 * 5 RENDER - TOP5 SHELTERS
 *************************/

/**
 * 보호소 카드 HTML 생성
 * @param {object} shelter - 보호소 객체
 * @param {number} rank - 순위
 * @returns {string} 카드 HTML
 */
function createShelterCardHTML(shelter, rank) {
  const progressClass = getPressureClass(shelter.pressure);

  return `
    <div class="sheltercard">
      <div class="flx-ttl">
        <div class="shelter-num">${rank}</div>
        <div class="description">
          <div class="t-S sub">보호센터</div>
          <div class="t-M">${shelter.careNm}</div>
        </div>
      </div>
      <div class="description">
        <div class="t-S sub">수용률 (현재 ${shelter.count} / 정원 ${shelter.capacity})</div>
        <div><span class="t-XL">${shelter.pressure}</span>%</div>
        <progress value="${shelter.pressure}" max="100" class="${progressClass}"></progress>
      </div>
      <div class="description">
        <div class="t-S sub">주소</div>
        <div class="t-M">${shelter.careAddr || "-"}</div>
      </div>
    </div>`;
}

/**
 * Top5 보호소 렌더링
 * @param {HTMLElement} container - 컨테이너 요소
 * @param {Array} shelters - 보호소 배열
 */
function renderTop5(container, shelters) {
  if (!container) {
    console.warn("Top5 컨테이너를 찾을 수 없습니다");
    return;
  }

  if (!shelters.length) {
    console.warn("표시할 보호소 데이터가 없습니다");
    return;
  }

  container.innerHTML = "";

  // 수용률 높은 순으로 정렬 후 상위 N개
  const topShelters = [...shelters]
    .sort((a, b) => b.pressure - a.pressure)
    .slice(0, CONFIG.TOP_SHELTERS_COUNT);

  topShelters.forEach((shelter, index) => {
    const wrapper = document.createElement("div");
    wrapper.innerHTML = createShelterCardHTML(shelter, index + 1);

    const card = wrapper.firstElementChild;

    if (!card) return;

    // ✅ attach to real card
    card.setAttribute("data-shelter-id", shelter.careNm);

    container.appendChild(card);
  });

  container.addEventListener("click", (e) => {
    const card = e.target.closest("[data-shelter-id]");
    if (!card || !container.contains(card)) return;

    goShelterDetail(card.dataset.shelterId);
  });


  // 무한 스크롤을 위해 카드 복제
  container.innerHTML += container.innerHTML;
  requestAnimationFrame(() => autoScrollTop5("top5", CONFIG.SCROLL_SPEED));
}

/*************************
 * 6 RENDER - SUMMARY CHART
 *************************/

/**
 * 처리 상태별 카운트 계산
 * @param {Array} animals - 동물 배열
 * @returns {object} 상태별 카운트 객체
 */
function calculateProcessStateCounts(animals) {
  const recentAnimals = animals.filter(a => isWithinLastMonth(a.happenDt));

  return {
    notice: recentAnimals.filter(a => a.processState?.includes("보호")).length,
    adopt: recentAnimals.filter(a => a.processState?.includes("입양")).length,
    returned: recentAnimals.filter(a => a.processState?.includes("반환")).length,
    euthanasia: recentAnimals.filter(a => a.processState?.includes("안락사")).length,
    death: recentAnimals.filter(a => a.processState?.includes("자연사")).length
  };
}

/**
 * 요약 차트 렌더링
 * @param {HTMLCanvasElement} canvas - 캔버스 요소
 * @param {Array} animals - 동물 배열
 */
function renderSummaryChart(canvas, animals) {
  if (!canvas) {
    console.error("차트 캔버스를 찾을 수 없습니다");
    return;
  }

  if (!window.Chart) {
    console.error("Chart.js가 로드되지 않았습니다");
    return;
  }

  if (!animals || animals.length === 0) {
    console.warn("차트에 표시할 데이터가 없습니다");
    return;
  }

  const counts = calculateProcessStateCounts(animals);

  new Chart(canvas, {
    type: "bar",
    data: {
      labels: ["공고 수", "입양 수", "반환 수", "안락사 수", "자연사 수"],
      datasets: [{
        data: [counts.notice, counts.adopt, counts.returned, counts.euthanasia, counts.death],
        backgroundColor: ["#6673FF", "#09F66C", "#FFB01F", "#ff2462", "#B9BFFF"],
        borderRadius: 8
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: {
        y: { beginAtZero: true, grid: { color: "#E3E3E3" } },
        x: { grid: { display: false } }
      }
    }
  });
}

/*************************
 * 7 GYEONGGI SUMMARY
 *************************/

/**
 * 경기도 요약 통계 계산
 * @param {Array} animals - 동물 배열
 * @param {Array} shelters - 보호소 배열
 * @param {object} meta - 메타 데이터
 * @returns {object} 요약 통계 객체
 */
function calcGyeonggiSummary(animals, shelters, meta) {
  // 경기도 보호소만 필터링
  const gyeonggiShelters = shelters.filter(s => s.careAddr);

  // 총 수용 정원
  const totalCapacity = gyeonggiShelters.reduce((sum, s) => sum + s.capacity, 0);

  // 경기도 보호중인 동물 수
  const gyeonggiProtectedAnimals = animals.filter(animal =>
    animal.careAddr?.includes(CONFIG.REGION) &&
    animal.processState?.includes("보호")
  );
  const totalProtected = gyeonggiProtectedAnimals.length;

  // 전체 수용률
  const totalPressure = totalCapacity > 0
    ? Math.round((totalProtected / totalCapacity) * 100)
    : 0;

  return {
    totalCapacity,
    totalPressure,
    noticeCount: totalProtected,
    totalShelters: parseInt(meta.totalShelters) || 0,
    vetPersonCnt: parseInt(meta.totalVetPersonCnt) || 0,
    specsPersonCnt: parseInt(meta.totalSpecsPersonCnt) || 0
  };
}

/**
 * 대시보드 색상 적용
 * @param {number} pressure - 수용률
 */
function applyDashboardColor(pressure) {
  const dashboard = document.getElementById("dashbColor");
  if (!dashboard) return;

  dashboard.classList.remove("card-null", "card-warning", "card-danger");
  dashboard.classList.add(getDashboardColorClass(pressure));
}

/**
 * 경기도 요약 렌더링
 * @param {object} summary - 요약 통계 객체
 * @param {number} duration - 애니메이션 지속 시간 (ms)
 */
function renderGyeonggiSummary(summary, duration = CONFIG.ANIMATION_DURATION) {
  const targets = [
    { el: document.getElementById("aceptncAbltyCntComp"), value: summary.totalCapacity, format: true },
    { el: document.getElementById("prolterComp"), value: summary.totalPressure, format: false },
    { el: document.getElementById("processStateComp"), value: summary.noticeCount, format: true },
    { el: document.getElementById("totalSheltersComp"), value: summary.totalShelters, format: false },
    { el: document.getElementById("vetPersonCntComp"), value: summary.vetPersonCnt, format: false },
    { el: document.getElementById("specsPersonCntComp"), value: summary.specsPersonCnt, format: false }
  ];

  const startTime = performance.now();

  function animate(currentTime) {
    const elapsed = currentTime - startTime;
    const progress = Math.min(elapsed / duration, 1);

    // 각 타겟 엘리먼트 업데이트
    targets.forEach(({ el, value, format }) => {
      if (!el) return;
      const currentValue = Math.floor(value * progress);
      el.innerText = format ? currentValue.toLocaleString() : currentValue;
    });

    if (progress < 1) {
      requestAnimationFrame(animate);
    } else {
      applyDashboardColor(summary.totalPressure);
    }
  }

  requestAnimationFrame(animate);
}

/*************************
 * 8 INITIALIZATION
 *************************/

/**
 * 앱 초기화
 */
async function initializeApp() {
  showLoader();
  setLoaderProgress(10);

  const success = await loadData();
  setLoaderProgress(60);
  if (!success) {
    console.error("데이터 로드 실패로 인한 초기화 중단");
    return;
  }

  const summary = calcGyeonggiSummary(APP.animals, APP.shelters, APP.meta);
  setLoaderProgress(80);

  renderGyeonggiSummary(summary);
  renderPetCards(document.getElementById("petList"), APP.liveAnimals);
  renderTop5(document.getElementById("top5"), APP.shelters);
  renderSummaryChart(document.getElementById("mapSum"), APP.animals);
  initDraggable("top5");
  setLoaderProgress(100);
  setTimeout(hideLoader, 300);
}

// DOM 로드 완료시 앱 초기화
document.addEventListener("DOMContentLoaded", initializeApp);
window.initializeApp = initializeApp;

/*************************
 * 9 DRAG INTERACTION
 *************************/

/**
 * 드래그 가능한 슬라이더 초기화
 * @param {string} elementId - 슬라이더 요소 ID
 */
function initDraggable(elementId) {
  const slider = document.getElementById(elementId);
  if (!slider) {
    console.warn(`드래그 슬라이더를 찾을 수 없습니다: ${elementId}`);
    return;
  }

  let isDown = false;
  let startX;
  let scrollLeft;

  /**
   * 드래그 종료 처리
   */
  const endDrag = () => {
    isDown = false;
    isTop5Dragging = false;
    slider.classList.remove("dragging");
  };

  // 마우스 다운 이벤트
  slider.addEventListener("mousedown", (e) => {
    isDown = true;
    isTop5Dragging = true;
    slider.classList.add("dragging");
    startX = e.pageX - slider.offsetLeft;
    scrollLeft = slider.scrollLeft;
  });

  // 드래그 종료 이벤트들
  slider.addEventListener("mouseup", endDrag);
  slider.addEventListener("mouseleave", endDrag);

  // 마우스 이동 이벤트
  slider.addEventListener("mousemove", (e) => {
    if (!isDown) return;
    e.preventDefault();

    const x = e.pageX - slider.offsetLeft;
    const walk = (x - startX) * 2; // 스크롤 속도 배수
    const loopWidth = slider.scrollWidth / 2;

    let targetScroll = scrollLeft - walk;

    // 무한 스크롤을 위한 루프 처리
    if (targetScroll >= loopWidth) {
      targetScroll -= loopWidth;
      scrollLeft -= loopWidth;
    } else if (targetScroll <= 0) {
      targetScroll += loopWidth;
      scrollLeft += loopWidth;
    }

    slider.scrollLeft = targetScroll;
  });

  // 전역 마우스 업 이벤트
  window.addEventListener("mouseup", () => {
    isTop5Dragging = false;
    slider.classList.remove("dragging");
  });

  slider.addEventListener("wheel", (e) => {
    // If user is scrolling vertically, pass it to the page
    if (Math.abs(e.deltaY) > Math.abs(e.deltaX)) {
      window.scrollBy({
        top: e.deltaY,
        left: 0,
        behavior: "auto"
      });
      e.preventDefault();
    }
  }, { passive: false });

}

/*************************
 * 10 AUTO SCROLL
 *************************/

/**
 * Top5 자동 스크롤
 * @param {string} elementId - 슬라이더 요소 ID
 * @param {number} speed - 스크롤 속도 (픽셀/초)
 */
function autoScrollTop5(elementId, speed = CONFIG.SCROLL_SPEED) {
  const element = document.getElementById(elementId);
  if (!element) {
    console.warn(`자동 스크롤 요소를 찾을 수 없습니다: ${elementId}`);
    return;
  }

  let lastTime = null;
  let position = element.scrollLeft;

  /**
   * 스크롤 애니메이션 스텝
   * @param {number} currentTime - 현재 시간 (ms)
   */
  function step(currentTime) {
    if (!lastTime) lastTime = currentTime;

    const loopWidth = element.scrollWidth / 2;

    // 드래그 중이 아닐 때만 자동 스크롤
    if (!isTop5Dragging && loopWidth > 0) {
      const deltaTime = Math.min(currentTime - lastTime, 50); // 최대 50ms로 제한
      position += speed * (deltaTime / 400);

      // 무한 루프 처리
      if (position >= loopWidth) {
        position -= loopWidth;
      }

      element.scrollLeft = position;
    } else {
      // 드래그 중이면 현재 위치 동기화
      position = element.scrollLeft;
    }

    lastTime = currentTime;
    requestAnimationFrame(step);
  }

  requestAnimationFrame(step);
}