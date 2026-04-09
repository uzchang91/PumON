/*
1. 전역변수
2. 페이지네이션 상태
3. Firebase 로드
4. 압박지수 계산

[ UI State 변경 로직 ]
5. 필터
6. 리스트 생성
7. 정렬

8. 이미지 매칭

[ 렌더링 전용 영역 ]
9. 카드 렌더링
10. 페이지네이션
11. 차트

12. 모달
13. 대시보드
14. 차트 유틸
15. 카카오맵
*/

const params = new URLSearchParams(window.location.search);
const shelterId = params.get("id");

// firebase-auth.js에서 이미 초기화됨 (app, auth, database 전역 사용)
const db = database;

// 로딩 기능 추가
function hideLoading() {
  const loading = document.getElementById("loadingOverlay");
  if (!loading) return;

  loading.style.opacity = "0";
  loading.style.transition = "opacity 0.4s ease";

  setTimeout(() => {
    loading.style.display = "none";
  }, 400);
}

db.ref("rescuedAnimals/shelters/list")
  .once("value")
  .then(snapshot => {
    console.log("🔥 RTDB 연결 성공");
    console.log(snapshot.val());
  })
  .catch(err => {
    console.error("❌ RTDB 연결 실패", err);
  });

const chartMap = {};

/*************************
 * 1. 전역 변수
 *************************/
let regionSummary = [];
let currentSort = "pressure";

const provinceSelect = document.getElementById("provinceSelect");
const citySelect = document.getElementById("citySelect");
const cardContainer = document.getElementById("cardContainer");
const pagination = document.getElementById("pagination");

const modalOverlay = document.getElementById("modalOverlay");
const modalCloseBtn = document.getElementById("modalCloseBtn");
const modalContent = document.getElementById("modalContent");

/*************************
 * 2. 페이지네이션 상태
 *************************/
let allShelters = [];
let visibleShelters = []; // ✅ 필터링된 보호소 목록
let currentPage = 1;
let currentGroup = 0;

const PAGE_SIZE = 12;
const PAGE_GROUP_SIZE = 10;

/*************************
 * 3. Firebase 데이터 로드
 *************************/
db.ref("rescuedAnimals/shelters/list").once("value").then(snap => {
  const raw = snap.val();
  if (!raw) {
    hideLoading();
    return;
  }
  const shelters = Object.values(raw);

  // ✅ 1. If shelterId exists, find that shelter FIRST
  if (shelterId) {
    const target = shelters.find(s =>
      String(s.info?.careRegNo) === String(shelterId)
    );

    if (target && target.info) {
      console.log("🎯 URL로 전달된 보호소:", target.info.careNm);
      renderShelterInfo(target.info);
    }
  }

  // 대시보드 + 리스트 병렬 처리 (성능 최적화)
  Promise.all([
    Promise.resolve(prepareDashboardDataFromShelters(shelters)),
    Promise.resolve(rebuildFromShelters(shelters))
  ]).then(() => {
    const dashboardSection = document.querySelector(".dashboard-section");
    if (dashboardSection) observer.observe(dashboardSection);
    hideLoading();
  });
});

/*************************
 * 4. 압박지수 계산
 *************************/
function rebuildFromShelters(shelters) {
  const regionMap = {};
  allShelters = [];

  shelters.forEach(s => {
    const info = s.info;
    if (!info || !info.orgNm) return;

    // ✅ orgNm 파싱 개선: "강원특별자치도 횡성군" → ["강원특별자치도", "횡성군"]
    const parts = info.orgNm.trim().split(" ");
    const province = parts[0] || "기타";
    const city = parts.slice(1).join(" ") || "미분류";

    console.log(`파싱: ${info.orgNm} → 시/도: ${province}, 시/군/구: ${city}`);

    // regionSummary용
    regionMap[province] ??= { province, cities: {} };
    regionMap[province].cities[city] ??= {
      city,
      count: 0,
      shelters: []
    };

    regionMap[province].cities[city].count += info.currentAnimals;
    regionMap[province].cities[city].shelters.push(info.careNm);

    // 카드용 (보호소 단위)
    const capacity = (info.shelterCapacity === "미확인" || isNaN(info.shelterCapacity))
      ? 0
      : Number(info.shelterCapacity);

    const pressure = capacity > 0 ? info.currentAnimals / capacity : 0;

    allShelters.push({
      name: info.careNm,
      province,
      city,
      current: info.currentAnimals,
      capacity,
      free: Math.max(capacity - info.currentAnimals, 0),
      pressure,
      urgency:
        pressure * 0.5 +
        info.currentAnimals * 0.3 +
        (100 - Math.max(capacity - info.currentAnimals, 0)) * 0.2,
      info
    });
  });

  // regionSummary 변환
  regionSummary = Object.values(regionMap).map(r => ({
    province: r.province,
    cities: Object.values(r.cities)
  }));

  console.log("📊 지역 요약:", regionSummary);

  initProvinceSelect();

  // 초기에는 모든 보호소 표시 (대시보드 보호소 제외)
  filterOutDashboardShelter();
  applySortToVisible();

  currentPage = 1;
  currentGroup = 0;

  // 화면 업데이트
  updateShelterTotalCount();
  renderPage();
  renderPagination();
}

/*************************
 * 4-1. 대시보드 보호소 제외
 *************************/
function filterOutDashboardShelter() {
  const dashboardShelterName = window.dashboardData?.shelterName;

  if (dashboardShelterName) {
    visibleShelters = allShelters.filter(s => s.name !== dashboardShelterName);
    console.log(`🚫 대시보드 보호소 제외: ${dashboardShelterName}`);
  } else {
    visibleShelters = [...allShelters];
  }
}

/*************************
 * 5. 필터
 *************************/
function initProvinceSelect() {
  provinceSelect.innerHTML = `<option value="">전체 시/도</option>`;

  regionSummary.forEach(region => {
    const opt = document.createElement("option");
    opt.value = region.province;
    opt.textContent = region.province;
    provinceSelect.appendChild(opt);
  });

  citySelect.innerHTML = `<option value="">전체 시/군/구</option>`;
  citySelect.disabled = true;
}

provinceSelect.onchange = () => {
  citySelect.innerHTML = `<option value="">전체 시/군/구</option>`;
  citySelect.disabled = true;

  const province = provinceSelect.value;

  // 시/도 미선택 시 전체 표시
  if (!province) {
    createShelterList();
    return;
  }

  // 선택한 시/도의 시/군/구 목록 채우기
  const region = regionSummary.find(r => r.province === province);
  if (region) {
    region.cities.forEach(c => {
      const opt = document.createElement("option");
      opt.value = c.city;
      opt.textContent = c.city;
      citySelect.appendChild(opt);
    });
    citySelect.disabled = false;
  }

  createShelterList(province);
};

citySelect.onchange = () => {
  createShelterList(provinceSelect.value, citySelect.value);
};

/*************************
 * 6. 리스트 생성 (필터링)
 *************************/
function createShelterList(province = "", city = "") {
  console.log(`🔍 필터 적용: 시/도=${province}, 시/군/구=${city}`);

  const dashboardShelterName = window.dashboardData?.shelterName;

  // 필터링 (대시보드 보호소 제외)
  visibleShelters = allShelters.filter(s => {
    // 대시보드 보호소 제외
    if (dashboardShelterName && s.name === dashboardShelterName) return false;

    if (province && s.province !== province) return false;
    if (city && s.city !== city) return false;
    return true;
  });

  console.log(`📋 필터 결과: ${visibleShelters.length}개 보호소`);

  applySortToVisible();
  currentPage = 1;
  currentGroup = 0;

  // 화면 업데이트
  updateShelterTotalCount();
  renderPage();
  renderPagination();
}

/*************************
 * 7. 정렬
 *************************/
function applySortToVisible() {
  switch (currentSort) {
    case "pressure":
      visibleShelters.sort((a, b) => {
        const pressureA = a.pressure || 0;
        const pressureB = b.pressure || 0;
        return pressureB - pressureA; // 내림차순 (높은 순)
      });
      break;

    case "count":
      visibleShelters.sort((a, b) => {
        const countA = a.current || 0;
        const countB = b.current || 0;
        return countB - countA; // 내림차순
      });
      break;

    case "free":
      visibleShelters.sort((a, b) => {
        const freeA = a.free || 0;
        const freeB = b.free || 0;
        return freeB - freeA; // 내림차순 (여유 많은 순)
      });
      break;

    case "urgency":
      visibleShelters.sort((a, b) => {
        const urgencyA = a.urgency || 0;
        const urgencyB = b.urgency || 0;
        return urgencyB - urgencyA; // 내림차순 (시급한 순)
      });
      break;

    case "region":
      visibleShelters.sort((a, b) => {
        if (a.province !== b.province) {
          return a.province.localeCompare(b.province);
        }
        return a.city.localeCompare(b.city);
      });
      break;
  }

  console.log(`✅ 정렬 완료 (${currentSort}):`, visibleShelters.slice(0, 5).map(s => ({
    name: s.name,
    pressure: (s.pressure * 100).toFixed(1) + '%',
    current: s.current
  })));
}

document.querySelectorAll("#sortTags .tag").forEach(btn => {
  btn.addEventListener("click", () => {
    document
      .querySelectorAll("#sortTags .tag")
      .forEach(t => t.classList.remove("active"));

    btn.classList.add("active");
    currentSort = btn.dataset.sort;

    applySortToVisible();
    currentPage = 1;
    currentGroup = 0;

    // 화면 업데이트
    updateShelterTotalCount();
    renderPage();
    renderPagination();
  });
});

/*************************
 * 8. 이미지 매칭
 *************************/
function getShelterImage(shelterName) {
  // 키워드와 이미지 매핑 (우선순위 순서대로)
  const imageMap = [
    { keyword: "(사)플러스", image: "plus.jpg" },
    { keyword: "사단법인", image: "incorporated_association.jpg" },
    { keyword: "무주군", image: "muju.jpg" },
    { keyword: "철원군", image: "cheolwon.jpg" },
    { keyword: "수의사회", image: "vet.jpg" },
    { keyword: "구청", image: "district.jpg" },
    { keyword: "훈련소", image: "training_center.jpg" },
    { keyword: "메디컬", image: "medical.png" },
    { keyword: "병원", image: "hospital.jpeg" },
    { keyword: "협회", image: "association.jpg" },
    { keyword: "센터", image: "center.jpeg" },
    { keyword: "보호소", image: "shelter.jpg" },
    { keyword: "축산", image: "husbandry.jpg" }
  ];

  // 첫 번째로 매칭되는 키워드의 이미지 반환
  for (const { keyword, image } of imageMap) {
    if (shelterName.includes(keyword)) {
      return `../assets/images/${image}`;
    }
  }

  // 매칭되는 키워드가 없으면 기본 이미지
  return "../assets/images/shelter.jpg";
}

/*************************
 * 9. 카드 렌더링
 *************************/
function renderPage() {
  cardContainer.innerHTML = "";

  // visibleShelters 사용
  const start = (currentPage - 1) * PAGE_SIZE;
  const pageItems = visibleShelters.slice(start, start + PAGE_SIZE);

  if (pageItems.length === 0) {
    cardContainer.innerHTML = '<p>필터 조건에 맞는 보호소가 없습니다.</p>';
    updateVisibleAnimalsCount();
    return;
  }

  pageItems.forEach((item, idx) => {
    const canvasId = `chart-${currentPage}-${idx}`;
    const imagePath = getShelterImage(item.name);

    const card = document.createElement("div");
    card.className = "card";
    card.innerHTML = `
      <img class="card-image" src="${imagePath}">
      <div class="card-inner descript2">
        <div class="t-S sub">보호센터</div>
        <div class="card-title">${item.name}</div>
        <small>
          압박 ${(item.pressure * 100).toFixed(1)}% ·
          보호 ${item.current} ·
          여유 ${item.free}
        </small>
        <canvas id="${canvasId}" width="220" height="8"></canvas>
      </div>
    `;

    card.onclick = () =>
      openModal(`
        <div class="descript3">
          <div class="descript1">
            <img class="card-image" src="${imagePath}">
            <div class="t-XL">${item.name}</div>
          </div>
          <div class="descript2 t-L">
            <div class="t-S sub">지역</div>
            <div>${item.province} ${item.city}</div>
          </div>
          <div class="descript2 t-L">
            <div class="t-S sub">압박지수</div>
            <div>${(item.pressure * 100).toFixed(1)}%</div>
          </div>
          <div class="descript2 t-L">
            <div class="t-S sub">현재 보호</div>
            <div>${item.current}마리</div>
          </div>
          <div class="descript2 t-L">
            <div class="t-S sub">수용 가능</div>
            <div>${item.capacity > 0 ? item.capacity + '마리' : '미확인'}</div>
          </div>
          <div class="descript2 t-L">
            <div class="t-S sub">입양 시급도</div>
            <div>${item.urgency.toFixed(1)}</div>
          </div>
        </div>
        `);

    cardContainer.appendChild(card);
    const chartData = getChartValue(item);

    if (chartData) {
      renderGauge(canvasId, chartData.value, chartData.color);
    } else {
      document.getElementById(canvasId).style.display = "none";
    }
  });

  // 현재 페이지 동물 수 업데이트
  updateVisibleAnimalsCount();
}

/*************************
 * 10. 페이지네이션
 *************************/
function renderPagination() {
  pagination.innerHTML = "";

  // visibleShelters 기준으로 페이지 계산
  const totalPages = Math.ceil(visibleShelters.length / PAGE_SIZE);

  // 페이지가 없어도 항상 표시 (공간 유지)
  if (totalPages === 0) {
    pagination.style.visibility = 'hidden';
    return;
  }

  pagination.style.visibility = 'visible';

  const startPage = currentGroup * PAGE_GROUP_SIZE + 1;
  const endPage = Math.min(startPage + PAGE_GROUP_SIZE - 1, totalPages);

  if (currentGroup > 0) {
    pagination.appendChild(createPageBtn("<<", () => {
      currentGroup--;
      currentPage = startPage - 1;
      renderPage();
      renderPagination();
    }));
  }

  for (let i = startPage; i <= endPage; i++) {
    const btn = createPageBtn(i, () => {
      currentPage = i;
      renderPage();
      renderPagination();
    });
    if (i === currentPage) btn.classList.add("active");
    pagination.appendChild(btn);
  }

  if (endPage < totalPages) {
    pagination.appendChild(createPageBtn(">>", () => {
      currentGroup++;
      currentPage = endPage + 1;
      renderPage();
      renderPagination();
    }));
  }
}

function createPageBtn(text, onClick) {
  const btn = document.createElement("button");
  btn.className = "page-btn";
  btn.textContent = text;
  btn.onclick = onClick;
  return btn;
}

/*************************
 * 11. 차트
 *************************/
function renderGauge(id, value, color) {
  if (chartMap[id]) {
    chartMap[id].destroy();
  }

  chartMap[id] = new Chart(document.getElementById(id), {
    type: "bar",
    data: {
      labels: [""],
      datasets: [{
        data: [value],
        backgroundColor: color,
        borderRadius: 8,
        // barThickness: 14
      }]
    },
    options: {
      indexAxis: "y",
      responsive: false,
      scales: {
        x: { min: 0, max: 100, display: false },
        y: { display: false }
      },
      plugins: {
        legend: { display: false },
        tooltip: { enabled: false }
      }
    }
  });
}

/*************************
 * 12. 모달
 *************************/
function openModal(html) {
  modalContent.innerHTML = html;
  modalOverlay.style.display = "flex";
}
modalCloseBtn.onclick = () => modalOverlay.style.display = "none";
modalOverlay.onclick = e => {
  if (e.target === modalOverlay) modalOverlay.style.display = "none";
};

/*************************
 * 13. 대시보드
 *************************/
let dashboardPlayed = false;

function animateValue(el, target, duration = 1200) {
  const unit = el.dataset.unit || "";
  let start = null;

  function step(ts) {
    if (!start) start = ts;
    const progress = Math.min((ts - start) / duration, 1);
    const value = (progress * target).toFixed(target % 1 === 0 ? 0 : 1);
    el.textContent = `${value}${unit}`;
    if (progress < 1) requestAnimationFrame(step);
  }

  requestAnimationFrame(step);
}

function createGradientDonut(canvasId, value, colors) {
  const ctx = document.getElementById(canvasId).getContext("2d");

  const gradient = ctx.createLinearGradient(0, 0, 180, 180);
  colors.forEach((c, i) =>
    gradient.addColorStop(i / (colors.length - 1), c)
  );

  new Chart(ctx, {
    type: "doughnut",
    data: {
      datasets: [{
        data: [value, 100 - value],
        backgroundColor: [gradient, "#e5e7eb"],
        borderWidth: 0
      }]
    },
    options: {
      cutout: "72%",
      animation: {
        duration: 1400,
        easing: "easeOutQuart"
      },
      plugins: {
        legend: { display: false },
        tooltip: { enabled: false }
      }
    }
  });
}

function initDashboard(data) {
  if (dashboardPlayed) return;
  dashboardPlayed = true;

  const {
    shelterName,
    pressure,
    localRate,
    regionRate,
    urgency,
    currentAnimals
  } = data;

  // 제목 업데이트 (shelterTitle ID 사용)
  const titleEl = document.getElementById("shelterTitle");
  if (titleEl) {
    titleEl.textContent = shelterName;
  }

  createGradientDonut("pressureChart", pressure, ["#ef4444", "#f97316"]);
  createGradientDonut("localRateChart", localRate, ["#3b82f6", "#22c55e"]);
  createGradientDonut("gyeonggiRateChart", regionRate, ["#22c55e", "#16a34a"]);
  createGradientDonut("countChart", urgency, ["#8b5cf6", "#6366f1"]);

  // 값 업데이트
  const values = document.querySelectorAll(".circle-value");
  if (values.length >= 4) {
    values[0].dataset.value = pressure;
    values[1].dataset.value = localRate;
    values[2].dataset.value = regionRate;
    values[3].dataset.value = urgency;
  }

  // 레이블 업데이트
  const labels = document.querySelectorAll(".circle span");
  if (labels.length >= 4) {
    labels[3].textContent = "입양 시급도";
  }

  document.querySelectorAll(".circle-value").forEach(el => {
    animateValue(el, parseFloat(el.dataset.value));
  });

  console.log("✅ 대시보드 차트 초기화 완료");
}

const observer = new IntersectionObserver(entries => {
  entries.forEach(entry => {
    if (entry.isIntersecting && window.dashboardData) {
      initDashboard(window.dashboardData);
      observer.disconnect();
    }
  });
}, { threshold: 0.4 });

function prepareDashboardDataFromShelters(shelters) {
  if (!shelters || shelters.length === 0) return;

  // - 1. 압박지수가 가장 높은 보호소 찾기
  let maxPressureShelter = null;
  let maxPressure = -1;

  shelters.forEach(s => {
    if (!s.info || !s.info.orgNm) return;

    const capacity = (s.info.shelterCapacity === "미확인" || isNaN(s.info.shelterCapacity))
      ? 0
      : Number(s.info.shelterCapacity);

    if (capacity === 0) return; // 수용량 미확인인 경우 제외

    const pressure = s.info.currentAnimals / capacity;

    if (pressure > maxPressure) {
      maxPressure = pressure;
      maxPressureShelter = s;
    }
  });

  if (!maxPressureShelter) {
    console.warn("압박지수를 계산할 수 있는 보호소가 없습니다.");
    return;
  }

  const targetShelter = maxPressureShelter.info;
  console.log("🎯 최고 압박지수 보호소:", targetShelter.careNm, `(${(maxPressure * 100).toFixed(1)}%)`);

  // - 2. 해당 보호소가 속한 지역 추출
  const parts = targetShelter.orgNm.trim().split(" ");
  const province = parts[0] || "기타";
  const city = parts.slice(1).join(" ") || "미분류";

  // - 3. 지역 보호율 계산 (해당 지역 보호소 개수 / 전체 보호소 개수)

  // 전체 보호소 개수
  const totalShelterCount = shelters.filter(s => s.info && s.info.orgNm).length;

  // 해당 지역 보호소 개수 (같은 city 기준)
  const regionShelterCount = shelters.filter(s =>
    s.info &&
    s.info.orgNm &&
    s.info.orgNm.includes(city)
  ).length;
  // 같은 지역(city 기준) 보호소 목록
  const regionShelters = shelters.filter(s =>
    s.info &&
    s.info.orgNm &&
    s.info.orgNm.includes(city)
  );


  // 변경된 지역 보호율
  const localRate = totalShelterCount > 0
    ? (regionShelterCount / totalShelterCount) * 100
    : 0;

  console.log(
    `📊 지역 보호율(보호소 기준): ${regionShelterCount} / ${totalShelterCount} = ${localRate.toFixed(1)}%`
  );

  console.log("전체 보호소 수:", totalShelterCount);
  console.log("지역 보호소 수:", regionShelterCount);
  console.log("city 기준:", city);


  // - 4. 지역 대비 보호소 수용률 계산
  // (해당 지역 최대 수용량 / 전체 지역 최대 수용량)
  const regionCapacity = regionShelters.reduce((sum, s) => {
    if (!s.info) return sum;
    const cap = (s.info.shelterCapacity === "미확인" || isNaN(s.info.shelterCapacity))
      ? 0
      : Number(s.info.shelterCapacity);
    return sum + cap;
  }, 0);

  const totalCapacity = shelters.reduce((sum, s) => {
    if (!s.info) return sum;
    const cap = (s.info.shelterCapacity === "미확인" || isNaN(s.info.shelterCapacity))
      ? 0
      : Number(s.info.shelterCapacity);
    return sum + cap;
  }, 0);

  const regionRate = totalCapacity > 0
    ? (regionCapacity / totalCapacity) * 100
    : 0;

  // - 5. 입양 시급도 계산
  const capacity = Number(targetShelter.shelterCapacity) || 1;
  const pressure = (targetShelter.currentAnimals / capacity);
  const shortage = Math.max(0, targetShelter.currentAnimals - capacity);

  const urgency = Math.min(
    (pressure * 0.5 + targetShelter.currentAnimals * 0.003 + shortage * 0.002) * 100,
    100
  );

  // - 6. 대시보드 데이터 설정
  window.dashboardData = {
    shelterName: targetShelter.careNm,
    pressure: Math.round(pressure * 100),
    localRate: Math.round(localRate * 10) / 10,
    regionRate: Math.round(regionRate * 10) / 10,
    urgency: Math.round(urgency),
    currentAnimals: targetShelter.currentAnimals
  };

  // 보호소 주소 저장
  window.dashboardShelterAddress = targetShelter.careAddr;

  console.log("📊 대시보드 데이터:", window.dashboardData);
  console.log("📍 보호소 주소:", window.dashboardShelterAddress);

  // 보호소 정보 렌더링
  renderShelterInfo(targetShelter);

  // 지도 초기화
  setTimeout(() => {
    initKakaoMap();
  }, 500);
}

// 보호소 정보 렌더링 (새로운 HTML 구조에 맞게)
function renderShelterInfo(info) {
  // 제목
  const titleEl = document.getElementById("shelterTitle");
  if (titleEl) titleEl.textContent = info.careNm;

  // 보호소 이름
  const nameEl = document.getElementById("shelterName");
  if (nameEl) nameEl.textContent = info.careNm;

  // 지역
  const regionEl = document.getElementById("shelterRegion");
  if (regionEl) regionEl.textContent = info.orgNm;

  // 주소
  const addressEl = document.getElementById("shelterAddress");
  if (addressEl) addressEl.textContent = info.careAddr;

  // 전화번호
  const phoneEl = document.getElementById("shelterPhone");
  if (phoneEl) phoneEl.textContent = info.careTel || "정보 없음";

  // 현재 보호 동물 수
  const countEl = document.getElementById("currentAnimalsCount");
  if (countEl) countEl.textContent = info.currentAnimals;

  console.log("✅ 보호소 정보 렌더링 완료:", info.careNm);
}

// 보호소 카드 리스트 total 기능
function updateShelterTotalCount() {
  const countEl = document.getElementById("shelterTotalCount");
  if (!countEl) return;
  countEl.textContent = visibleShelters.length;
}

// 전체 보호소 기준 동물 수 계산
function updateVisibleAnimalsCount() {
  const countEl = document.getElementById("visibleAnimalsCount");
  if (!countEl) return;

  const totalAnimals = allShelters.reduce(
    (sum, shelter) => sum + (shelter.current || 0),
    0
  );

  countEl.textContent = totalAnimals;
}

/*************************
 * 14. 차트 유틸
 *************************/
function getChartValue(item) {
  switch (currentSort) {
    case "pressure":
      return {
        value: Math.min(item.pressure * 100, 100),
        color: valueColor(item.pressure * 100)
      };

    case "count":
      const countPercent = normalize(item.current, getMax("current"));
      return {
        value: countPercent,
        color: valueColor(countPercent)
      };

    case "free":
      const freePercent = normalize(item.free, getMax("free"));
      return {
        value: freePercent,
        color: valueColor(freePercent)
      };

    case "urgency":
      const urgencyPercent = normalize(item.urgency, getMax("urgency"));
      return {
        value: urgencyPercent,
        color: valueColor(urgencyPercent)
      };

    default:
      return null;
  }
}

function getMax(key) {
  // visibleShelters 기준으로 최댓값 계산
  return Math.max(...visibleShelters.map(s => s[key] || 0), 1);
}

function normalize(value, max) {
  return Math.round((value / max) * 100);
}

function valueColor(value) {
  if (value >= 80) return "#ef4444"; // 빨강 (위험)
  if (value >= 50) return "#f59e0b"; // 주황 (경고)
  return "#22c55e"; // 초록 (안전)
}

/*************************
 * 15. Kakao Map
 *************************/
function initKakaoMap() {
  const mapContainer = document.getElementById("kakaoMap");
  if (!mapContainer) {
    console.warn("⚠️ 지도 컨테이너를 찾을 수 없습니다.");
    return;
  }

  // ✅ kakao 객체 로드 확인
  if (typeof kakao === 'undefined' || !kakao.maps) {
    console.warn("⚠️ 카카오맵 SDK가 아직 로드되지 않았습니다. 1초 후 재시도...");
    setTimeout(initKakaoMap, 1000);
    return;
  }

  console.log("✅ 카카오맵 SDK 로드 완료");

  // 초기 맵 설정 (대한민국 중심)
  const mapOption = {
    center: new kakao.maps.LatLng(36.5, 127.5),
    level: 13
  };

  try {
    const map = new kakao.maps.Map(mapContainer, mapOption);
    console.log("✅ 카카오맵 생성 완료");

    // 대시보드 보호소 마커 표시
    if (window.dashboardData && window.dashboardShelterAddress) {
      console.log(`📍 마커 표시 시도: ${window.dashboardData.shelterName}`);
      displayShelterOnMap(map, window.dashboardShelterAddress, window.dashboardData.shelterName);
    } else {
      console.log("⏳ 대시보드 데이터 대기 중...");
      // 데이터가 준비되면 지도 다시 표시
      const checkInterval = setInterval(() => {
        if (window.dashboardData && window.dashboardShelterAddress) {
          clearInterval(checkInterval);
          console.log(`📍 데이터 로드 완료, 마커 표시: ${window.dashboardData.shelterName}`);
          displayShelterOnMap(map, window.dashboardShelterAddress, window.dashboardData.shelterName);
        }
      }, 500);

      // 10초 후 타임아웃
      setTimeout(() => {
        clearInterval(checkInterval);
        if (!window.dashboardData) {
          console.error("❌ 대시보드 데이터 로드 타임아웃");
        }
      }, 10000);
    }
  } catch (error) {
    console.error("❌ 카카오맵 생성 실패:", error);
  }
}

function displayShelterOnMap(map, address, shelterName) {
  // ✅ kakao 객체 확인
  if (typeof kakao === 'undefined' || !kakao.maps || !kakao.maps.services) {
    console.error("❌ 카카오맵 services 라이브러리가 로드되지 않았습니다.");
    return;
  }

  console.log(`🔍 주소 검색 시작: ${address}`);

  // 카카오 주소-좌표 변환 객체 생성
  const geocoder = new kakao.maps.services.Geocoder();

  // 주소로 좌표 검색
  geocoder.addressSearch(address, function (result, status) {
    console.log("📊 주소 검색 결과:", status);

    if (status === kakao.maps.services.Status.OK) {
      const coords = new kakao.maps.LatLng(result[0].y, result[0].x);

      // 지도 중심 먼저 이동
      map.setCenter(coords);
      map.setLevel(4);

      // relayout으로 지도 다시 그리기
      setTimeout(() => {
        map.relayout();
        map.setCenter(coords); // 다시 한번 중심 설정

        // 마커 생성
        const marker = new kakao.maps.Marker({
          map: map,
          position: coords
        });

        // 인포윈도우 생성
        const infowindow = new kakao.maps.InfoWindow({
          content: `<div class="kkmap">${shelterName}</div>`
        });

        infowindow.open(map, marker);

        console.log(`🗺️ 지도 표시 성공: ${shelterName} (${result[0].y}, ${result[0].x})`);
      }, 100);

    } else {
      console.warn(`⚠️ 주소 변환 실패 (${status}): ${address}`);

      // 주소 검색 실패 시 공백 제거 후 재시도
      const cleanAddress = address.replace(/\s+/g, ' ').trim();
      if (cleanAddress !== address) {
        console.log(`🔄 공백 정리 후 재시도: ${cleanAddress}`);
        geocoder.addressSearch(cleanAddress, function (result2, status2) {
          if (status2 === kakao.maps.services.Status.OK) {
            const coords = new kakao.maps.LatLng(result2[0].y, result2[0].x);

            map.setCenter(coords);
            map.setLevel(4);

            setTimeout(() => {
              map.relayout();
              map.setCenter(coords);

              const marker = new kakao.maps.Marker({ map: map, position: coords });
              const infowindow = new kakao.maps.InfoWindow({
                content: `<div class="kkmap2">${shelterName}</div>`
              });
              infowindow.open(map, marker);

              console.log(`🗺️ 재시도 성공: ${shelterName}`);
            }, 100);
          } else {
            console.error(`❌ 재시도도 실패 (${status2})`);
          }
        });
      }
    }
  });
}