import fosterDataManager from "./foster-data-manager.js";

// ========== 로딩 스피너 헬퍼 함수 ==========
function showChartLoading(container) {
  if (!container) return;
  const spinner = document.createElement('div');
  spinner.className = 'chart-loading';
  spinner.innerHTML = '<div class="spinner"></div>';
  spinner.setAttribute('data-loading', 'true');
  container.appendChild(spinner);
}

function hideChartLoading(container) {
  if (!container) return;
  const spinner = container.querySelector('[data-loading="true"]');
  if (spinner) spinner.remove();
}

// ========== 전역 변수: 로그인한 사용자의 지역 ==========
let myRegion = "서울"; // 기본값

// ========== 중앙 데이터 관리자에서 데이터 가져오기 ==========
function getAllFosters() {
  // 중앙 데이터 관리자 사용 - RTDB 접근 최소화
  return fosterDataManager.getData() || [];
}

// ========== 로그인한 사용자 정보 가져오기 ==========
async function getUserRegion() {
  try {
    const user = auth.currentUser;
    if (!user) {
      console.log('[foster-dashboard] 로그인하지 않은 사용자');
      return "서울"; // 기본값
    }

    const snapshot = await database.ref('users/' + user.uid).once('value');
    const userData = snapshot.val();

    if (!userData) {
      console.log('[foster-dashboard] 사용자 데이터 없음');
      return "서울";
    }

    // userType에 따라 주소 가져오기
    let address = null;
    if (userData.userType === 'shelter' && userData.shelterInfo?.address) {
      address = userData.shelterInfo.address;
    } else if (userData.userType === 'foster' && userData.fosterInfo?.address) {
      address = userData.fosterInfo.address;
    }

    if (!address) {
      console.log('[foster-dashboard] 사용자 주소 정보 없음');
      return "서울";
    }

    // 주소에서 지역 추출
    const region = extractRegionFromAddress(address);
    console.log(`[foster-dashboard] 사용자 지역: ${region}`);
    return region;
  } catch (error) {
    console.error('[foster-dashboard] 사용자 지역 가져오기 실패:', error);
    return "서울";
  }
}

// ========== 주소에서 지역명 추출 ==========
function extractRegionFromAddress(address) {
  if (!address) return "서울";

  const addr = String(address);

  // 지역 매핑 (우선순위대로)
  if (addr.includes("서울")) return "서울";
  if (addr.includes("부산")) return "부산";
  if (addr.includes("대구")) return "대구";
  if (addr.includes("인천")) return "인천";
  if (addr.includes("광주")) return "광주";
  if (addr.includes("세종")) return "세종";
  if (addr.includes("대전")) return "대전";
  if (addr.includes("울산")) return "울산";
  if (addr.includes("경기")) return "경기";
  if (addr.includes("강원")) return "강원";
  if (addr.includes("충북") || addr.includes("충청북도")) return "충북";
  if (addr.includes("충남") || addr.includes("충청남도")) return "충남";
  if (addr.includes("전북") || addr.includes("전라북도")) return "전북";
  if (addr.includes("전남") || addr.includes("전라남도")) return "전남";
  if (addr.includes("경북") || addr.includes("경상북도")) return "경북";
  if (addr.includes("경남") || addr.includes("경상남도")) return "경남";
  if (addr.includes("제주")) return "제주";

  return "서울"; // 기본값
}

// ========== 대시보드 데이터 업데이트 함수 ==========
function updateDashboardCards() {
  const fosterData = getAllFosters();

  const fosterAct = document.getElementById("api-foster-acting");
  if (fosterAct && fosterData) {
    let fosterActing = 0;
    let localActing = 0;
    let localExpert = 0;

    // 전국 활동중 임시보호자 카운트
    for (let i = 0; i < fosterData.length; i++) {
      if (fosterData[i].fosterInfo?.isAvailable === true) {
        fosterActing += 1;
      }
    }

    // 현재 지역 활동중 임시보호자 카운트
    for (let i = 0; i < fosterData.length; i++) {
      const foster = fosterData[i];
      if (foster.fosterInfo?.isAvailable === true) {
        const address = String(foster.fosterInfo?.address || "");
        if (address.includes(myRegion)) {
          localActing += 1;

          // 숙련자 기준: 경력 2년 이상 또는 보호 경험 5회 이상
          const experienceYears = Number(foster.fosterInfo?.experienceYears || 0);
          if (experienceYears >= 2) {
            localExpert += 1;
          }
        }
      }
    }

    animateValue(fosterAct, fosterActing);
    animateValue(document.getElementById("api-foster-emergency"), localActing);
    animateValue(document.getElementById("api-animal-emergency"), localExpert);

    fosterChartData = { acting: fosterActing, localActing, localExpert };
  }
}

// ========== 카운트업 애니메이션 함수 ==========
function animateValue(element, target, duration = 1400) {
  if (!element) return;
  let start = null;
  const startValue = 0;

  function step(timestamp) {
    if (!start) start = timestamp;
    const progress = Math.min((timestamp - start) / duration, 1);
    const easeProgress = 1 - Math.pow(1 - progress, 4);
    const value = Math.floor(startValue + (target - startValue) * easeProgress);
    element.textContent = value;

    if (progress < 1) requestAnimationFrame(step);
  }

  requestAnimationFrame(step);
}

// ========== 임시보호자 카드 렌더링 ==========
function renderFosterCards() {
  const fosterData = getAllFosters();
  const container = document.getElementById("foster-list");
  if (!container) return;

  // NOTE: 기존 로직 유지. (네 프로젝트에서 foster-filter.js가 리스트 렌더링을 담당한다면
  // 여기 부분은 최소화/제거해도 되지만, 현재 파일 기준으로는 존재한다고 가정하고 유지)
  // 실제 카드 렌더 함수가 다른 파일에서 수행된다면 이 함수는 빈 함수로 둬도 됩니다.

  // 안전장치: container가 없거나, 기존 렌더가 외부에서 이뤄지면 여기서는 아무 것도 안 함
  // (중복 렌더 방지)
}

// ========== 도넛 차트 ==========
let fosterChart1 = null;
let fosterChart2 = null;

// 도넛 차트 데이터 저장
let fosterChartData = { acting: 0, localActing: 0, localExpert: 0 };

// ========== 도넛 차트(세련된 디자인 + 중앙 텍스트) ==========
// - 선택 구간: 그라데이션
// - 비선택 구간: 회색
// - 중앙 텍스트: 라벨 + n%
function clampPercent(n) {
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(100, Math.round(n)));
}

function makeRadialGradient(ctx, centerX, centerY, innerR, outerR) {
  const g = ctx.createRadialGradient(centerX, centerY, innerR * 0.3, centerX, centerY, outerR);
  // 브랜드 톤의 세련된 블루 계열 (그라데이션)
  g.addColorStop(0, "rgba(86, 140, 255, 1)");
  g.addColorStop(1, "rgba(102, 115, 255, 1)");
  return g;
}

// Chart.js 중앙 텍스트 플러그인 (v3/v4)
const centerTextPlugin = {
  id: "centerTextPlugin",
  afterDraw(chart, args, pluginOptions) {
    const opts = pluginOptions || {};
    const meta = chart.getDatasetMeta(0);
    if (!meta || !meta.data || !meta.data.length) return;

    // 도넛의 중심 좌표
    const arc = meta.data[0];
    const { x, y, innerRadius, outerRadius } = arc;

    const ctx = chart.ctx;
    ctx.save();

    // 중앙 정렬
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";

    // 퍼센트 (큰 글자)
    const percent = clampPercent(opts.percent);
    const percentFontSize = Math.max(16, Math.floor(innerRadius * 0.42));
    ctx.font = `700 ${percentFontSize}px Pretendard, system-ui, -apple-system, Segoe UI, Roboto, sans-serif`;
    ctx.fillStyle = "#1E2A33";
    ctx.fillText(`${percent}%`, x, y - Math.floor(percentFontSize * 0.08));

    // 라벨 (작은 글자)
    const label = String(opts.label || "");
    const labelFontSize = Math.max(11, Math.floor(innerRadius * 0.18));
    ctx.font = `600 ${labelFontSize}px Pretendard, system-ui, -apple-system, Segoe UI, Roboto, sans-serif`;
    ctx.fillStyle = "rgba(76, 116, 149, 0.95)";
    ctx.fillText(label, x, y + Math.floor(percentFontSize * 0.55));

    ctx.restore();
  }
};

function renderFosterCharts(acting, localActing, localExpert) {
  const chart1El = document.getElementById("fosterChart1");
  const chart2El = document.getElementById("fosterChart2");
  if (!chart1El || !chart2El) return;

  // ✅ canvas에 연결된 기존 차트가 있으면 제거
  try { Chart.getChart(chart1El)?.destroy(); } catch (_) {}
  try { Chart.getChart(chart2El)?.destroy(); } catch (_) {}

  if (fosterChart1) { try { fosterChart1.destroy(); } catch (_) {} fosterChart1 = null; }
  if (fosterChart2) { try { fosterChart2.destroy(); } catch (_) {} fosterChart2 = null; }

  const safeActing = Math.max(0, Number(acting) || 0);
  const safeLocalActing = Math.max(0, Number(localActing) || 0);
  const safeLocalExpert = Math.max(0, Number(localExpert) || 0);

  // ---- 차트1: 지역 활동율 = (현재지역 활동중 / 전체 활동중) ----
  const denom1 = safeActing;
  const numer1 = Math.min(safeLocalActing, denom1);
  const pct1 = denom1 > 0 ? (numer1 / denom1) * 100 : 0;

  // ---- 차트2: 지역 숙련자 비율 = (현재지역 숙련자 / 현재지역 활동중) ----
  const denom2 = safeLocalActing;
  const numer2 = Math.min(safeLocalExpert, denom2);
  const pct2 = denom2 > 0 ? (numer2 / denom2) * 100 : 0;

  // 공통 옵션
  const baseOptions = {
    responsive: true,
    maintainAspectRatio: false,
    cutout: "74%",
    animation: { duration: 700, easing: "easeOutQuart" },
    plugins: {
      legend: { display: false },
      tooltip: { enabled: false }
    }
  };

  // 초기 데이터를 백분율로 설정
  const initialPct1 = denom1 > 0 ? (numer1 / denom1) * 100 : 0;
  const initialRemainder1 = 100 - initialPct1;

  const initialPct2 = denom2 > 0 ? (numer2 / denom2) * 100 : 0;
  const initialRemainder2 = 100 - initialPct2;

  fosterChart1 = new Chart(chart1El, {
    type: "doughnut",
    data: {
      labels: ["선택", "비선택"],
      datasets: [{
        data: [initialPct1, initialRemainder1],
        backgroundColor: ["#6673FF", "rgba(217, 225, 232, 0.85)"],
        borderWidth: 0,
        spacing: 1.5,
        borderRadius: 10,
        hoverOffset: 0
      }]
    },
    options: {
      ...baseOptions,
      plugins: {
        ...baseOptions.plugins,
        centerTextPlugin: { label: "지역 활동율", percent: pct1 }
      }
    },
    plugins: [
      centerTextPlugin,
      // 그라데이션 동적 반영
      {
        id: "gradientAndData_1",
        beforeUpdate(chart) {
          const { ctx, chartArea } = chart;
          if (!chartArea) return;

          const centerX = (chartArea.left + chartArea.right) / 2;
          const centerY = (chartArea.top + chartArea.bottom) / 2;
          const outerR = Math.min(chartArea.right - chartArea.left, chartArea.bottom - chartArea.top) / 2;
          const innerR = outerR * 0.74;
          const grad = makeRadialGradient(ctx, centerX, centerY, innerR, outerR);

          chart.data.datasets[0].backgroundColor[0] = grad;
        }
      }
    ]
  });

  fosterChart2 = new Chart(chart2El, {
    type: "doughnut",
    data: {
      labels: ["선택", "비선택"],
      datasets: [{
        data: [initialPct2, initialRemainder2],
        backgroundColor: ["#6673FF", "rgba(217, 225, 232, 0.85)"],
        borderWidth: 0,
        spacing: 1.5,
        borderRadius: 10,
        hoverOffset: 0
      }]
    },
    options: {
      ...baseOptions,
      plugins: {
        ...baseOptions.plugins,
        centerTextPlugin: { label: "지역 숙련자 비율", percent: pct2 }
      }
    },
    plugins: [
      centerTextPlugin,
      {
        id: "gradientAndData_2",
        beforeUpdate(chart) {
          const { ctx, chartArea } = chart;
          if (!chartArea) return;

          const centerX = (chartArea.left + chartArea.right) / 2;
          const centerY = (chartArea.top + chartArea.bottom) / 2;
          const outerR = Math.min(chartArea.right - chartArea.left, chartArea.bottom - chartArea.top) / 2;
          const innerR = outerR * 0.74;
          const grad = makeRadialGradient(ctx, centerX, centerY, innerR, outerR);

          chart.data.datasets[0].backgroundColor[0] = grad;
        }
      }
    ]
  });
}

// ========== 지역분포도 차트용 필터/집계 유틸 ==========
function normalizeAnimalForChart(value) {
  const map = {
    "animall-all": "",
    "animall-dog": "dog",
    "animall-cat": "cat",
    "animall-etc": "etc"
  };
  return map[value] ?? "";
}

function normalizePeriodForChart(value) {
  const map = {
    "period-all": "",
    "period-month": "1",
    "period-three": "3",
    "period-half": "6"
  };
  return map[value] ?? "";
}

function parsePreferAnimals(raw) {
  const set = new Set();
  if (!raw) return set;

  if (Array.isArray(raw)) {
    raw.forEach(v => set.add(String(v).toLowerCase()));
    return set;
  }

  String(raw)
    .split(/[,/|]/g)
    .map(s => s.trim().toLowerCase())
    .filter(Boolean)
    .forEach(v => set.add(v));

  return set;
}

function filterFostersForRegionChart(fosters) {
  const $animal = document.getElementById("filter-animal");
  const $period = document.getElementById("filter-period");

  const animalKey = $animal ? normalizeAnimalForChart($animal.value) : "";
  const periodKey = $period ? normalizePeriodForChart($period.value) : "";

  return (fosters || []).filter(f => {
    const info = f?.fosterInfo || {};

    // 활동중 기준 통일
    if (info.isAvailable !== true) return false;

    // 지역 필터 제거 - 항상 전체 지역 표시

    // 동물 필터
    if (animalKey) {
      const prefer = parsePreferAnimals(info.preferAnimals);
      if (!prefer.has(animalKey)) return false;
    }

    // 기간 필터
    if (periodKey) {
      const mp = String(info.maxPeriod || "");
      if (!mp.includes(periodKey)) return false;
    }

    return true;
  });
}

function countByRegionLabel(fosters, label) {
  let c = 0;
  for (const f of fosters || []) {
    const addr = String(f?.fosterInfo?.address || "");

    if (label === "서울" && (addr.includes("서울") || addr.includes("서울특별시"))) { c++; continue; }
    if (label === "부산" && (addr.includes("부산") || addr.includes("부산광역시"))) { c++; continue; }
    if (label === "대구" && (addr.includes("대구") || addr.includes("대구광역시"))) { c++; continue; }
    if (label === "인천" && (addr.includes("인천") || addr.includes("인천광역시"))) { c++; continue; }
    if (label === "광주" && (addr.includes("광주") || addr.includes("광주광역시"))) { c++; continue; }
    if (label === "세종" && (addr.includes("세종") || addr.includes("세종특별자치시"))) { c++; continue; }
    if (label === "대전" && (addr.includes("대전") || addr.includes("대전광역시"))) { c++; continue; }
    if (label === "울산" && (addr.includes("울산") || addr.includes("울산광역시"))) { c++; continue; }
    if (label === "경기" && (addr.includes("경기") || addr.includes("경기도"))) { c++; continue; }
    if (label === "강원" && (addr.includes("강원") || addr.includes("강원도") || addr.includes("강원특별자치도"))) { c++; continue; }
    if (label === "충북" && (addr.includes("충북") || addr.includes("충청북도"))) { c++; continue; }
    if (label === "충남" && (addr.includes("충남") || addr.includes("충청남도"))) { c++; continue; }
    if (label === "전북" && (addr.includes("전북") || addr.includes("전라북도") || addr.includes("전북특별자치도"))) { c++; continue; }
    if (label === "전남" && (addr.includes("전남") || addr.includes("전라남도"))) { c++; continue; }
    if (label === "경북" && (addr.includes("경북") || addr.includes("경상북도"))) { c++; continue; }
    if (label === "경남" && (addr.includes("경남") || addr.includes("경상남도"))) { c++; continue; }
    if (label === "제주" && (addr.includes("제주") || addr.includes("제주특별자치도"))) { c++; continue; }
  }
  return c;
}

// ========== 통계 요약 차트 ==========
let regionChart = null;

function renderStatsCharts() {
  const regionCanvas = document.getElementById("regionChart");
  if (!regionCanvas) return;

  // 로딩 스피너 표시
  const chartContainer = regionCanvas.parentElement;
  showChartLoading(chartContainer);

  // ✅ 같은 canvas에 이미 차트가 있으면 무조건 파괴 (중복 생성 방지)
  try { Chart.getChart(regionCanvas)?.destroy(); } catch (_) {}
  if (regionChart) {
    try { regionChart.destroy(); } catch (_) {}
    regionChart = null;
  }

  const allRegions = [
    "서울", "부산", "대구", "인천", "광주", "세종", "대전", "울산",
    "경기", "강원", "충북", "충남", "전북", "전남", "경북", "경남", "제주"
  ];

  const fosters = getAllFosters();
  const filtered = filterFostersForRegionChart(fosters);

  // 지역별 데이터 집계 후 값 기준 내림차순 정렬
  const regionData = allRegions.map((label) => ({
    region: label,
    count: countByRegionLabel(filtered, label)
  }));
  regionData.sort((a, b) => b.count - a.count);

  const regions = regionData.map(d => d.region);
  const targetData = regionData.map(d => d.count);

  const colors = regions.map(region =>
    region === myRegion ? "#6673FF" : "rgba(102, 115, 255, 0.25)"
  );

  const animatedData = new Array(regions.length).fill(0);

  regionChart = new Chart(regionCanvas, {
    type: "bar",
    data: {
      labels: regions,
      datasets: [{
        data: animatedData,
        backgroundColor: colors,
        borderRadius: 4,
        barPercentage: 0.65,
        categoryPercentage: 0.8
      }]
    },
    options: {
      indexAxis: "y",
      responsive: true,
      maintainAspectRatio: false,
      layout: { padding: { right: 40 } },
      animation: false,
      plugins: {
        legend: { display: false },
        tooltip: { enabled: false }
      },
      scales: {
        x: {
          grid: { display: false },
          ticks: { display: false },
          border: { display: false },
          max: Math.max(...targetData, 0) + 3
        },
        y: {
          grid: { display: false },
          border: { display: false },
          ticks: {
            font: { size: 12, family: "Pretendard", weight: "500" },
            color: (ctx) => regions[ctx.index] === myRegion ? "#6673FF" : "#4C7495",
            padding: 6
          }
        }
      }
    },
    plugins: [{
      id: "valueLabels",
      afterDatasetsDraw(chart) {
        const { ctx, data } = chart;
        data.datasets[0].data.forEach((value, i) => {
          const bar = chart.getDatasetMeta(0).data[i];
          if (!bar) return;
          ctx.save();
          ctx.font = "500 12px Pretendard";
          ctx.fillStyle = regions[i] === myRegion ? "#6673FF" : "#8898A8";
          ctx.textAlign = "left";
          ctx.textBaseline = "middle";
          ctx.fillText(`${Math.round(value)}명`, bar.x + 6, bar.y);
          ctx.restore();
        });
      }
    }]
  });

  // 로딩 스피너 제거
  hideChartLoading(chartContainer);

  animateChartData(regionChart, targetData, 1200);
}

function animateChartData(chart, targetData, duration) {
  const startTime = performance.now();
  const startData = new Array(targetData.length).fill(0);

  function update(currentTime) {
    const elapsed = currentTime - startTime;
    const progress = Math.min(elapsed / duration, 1);
    const easeProgress = 1 - Math.pow(1 - progress, 4);

    chart.data.datasets[0].data = targetData.map((target, i) =>
      startData[i] + (target - startData[i]) * easeProgress
    );
    chart.update("none");

    if (progress < 1) requestAnimationFrame(update);
  }

  requestAnimationFrame(update);
}

// ========== 대시보드 전체 렌더 ==========
async function initDashboard() {
  try {
    // 사용자 지역 가져오기
    myRegion = await getUserRegion();
    console.log(`[foster-dashboard] 대시보드 지역: ${myRegion}`);

    updateDashboardCards();
    renderFosterCards();
    renderFosterCharts(fosterChartData.acting, fosterChartData.localActing, fosterChartData.localExpert);
    renderStatsCharts();
  } catch (error) {
    console.error("Dashboard 초기화 오류:", error);
  }
}

// ========== 렌더링 스케줄러 (중복 호출 방지) ==========
let __dashboardRenderQueued__ = false;
function scheduleDashboardRender() {
  if (__dashboardRenderQueued__) return;
  __dashboardRenderQueued__ = true;

  requestAnimationFrame(() => {
    __dashboardRenderQueued__ = false;
    initDashboard();
  });
}

// ========== 중앙 데이터 관리자 구독 ==========
(async function initDashboardModule() {
  try {
    await fosterDataManager.waitForInit();

    // 데이터 변경 구독: 전체 초기화 대신 '렌더 스케줄'만 걸어서 중복 호출 방지
    fosterDataManager.subscribe((data) => {
      console.log(`[foster-dashboard] 데이터 업데이트 감지: ${data?.length || 0}명`);
      scheduleDashboardRender();
    }, "foster-dashboard");

    // 페이지 최초 1회 렌더
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", scheduleDashboardRender);
    } else {
      scheduleDashboardRender();
    }

    // 필터가 바뀌면 지역 차트도 재집계 (리스트 필터는 foster-filter.js가 처리하더라도 차트는 여기서 맞춤)
    const $area = document.getElementById("filter-area");
    const $animal = document.getElementById("filter-animal");
    const $period = document.getElementById("filter-period");
    [$area, $animal, $period].forEach((el) => {
      el?.addEventListener("change", () => {
        renderStatsCharts();
      });
    });
  } catch (error) {
    console.error("[foster-dashboard] 초기화 실패:", error);
  }
})();


