import fosterDataManager from "./foster-data-manager.js";

/* =========================
   로딩 스피너 헬퍼 함수
========================= */
function showListLoading() {
  if (!$listWrap) return;
  $listWrap.innerHTML = `
    <div class="loading-spinner">
      <div class="spinner"></div>
      <p class="loading-text">임시보호자 정보를 불러오는 중...</p>
    </div>
  `;
}

function hideListLoading() {
  if (!$listWrap) return;
  const spinner = $listWrap.querySelector('.loading-spinner');
  if (spinner) spinner.remove();
}

/* =========================
   설정
========================= */
const PAGE_SIZE = 10;

// 사용자 지역 (기본값)
let userRegion = null;

/* =========================
   DOM
========================= */
const $area = document.getElementById("filter-area");
const $animal = document.getElementById("filter-animal");
const $period = document.getElementById("filter-period");

const $listWrap = document.querySelector(".foster-wrapper");

// pagination (당신 HTML 구조 그대로 사용)
const $paginationWrap = document.querySelector(".foster-pagenation");
const $pageList = document.querySelector(".foster-controller");
const $btnPrev = document.querySelector(".foster-pagenation .pg-prev");
const $btnNext = document.querySelector(".foster-pagenation .pg-next");

// (기존 HTML이 <a href="#"> 형태일 가능성이 높아서 클래스 자동 부여 보정)
(function ensurePaginationSelectors() {
    if (!$paginationWrap) return;

    const anchors = $paginationWrap.querySelectorAll("a");
    if (anchors.length >= 2) {
        // 첫 a = prev, 마지막 a = next 가정
        if (!anchors[0].classList.contains("pg-prev")) anchors[0].classList.add("pg-prev");
        if (!anchors[anchors.length - 1].classList.contains("pg-next")) anchors[anchors.length - 1].classList.add("pg-next");
    }
})();

// 보정 후 다시 잡기
const $btnPrevFinal = document.querySelector(".foster-pagenation .pg-prev");
const $btnNextFinal = document.querySelector(".foster-pagenation .pg-next");

if (!$area || !$animal || !$period || !$listWrap) {
    console.warn("[foster-filter] 필수 DOM 누락: filter-area/filter-animal/filter-period/.foster-wrapper");
}
if (!$paginationWrap || !$pageList || !$btnPrevFinal || !$btnNextFinal) {
    console.warn("[foster-filter] pagination DOM 누락: .foster-pagenation/.foster-controller/.pg-prev/.pg-next");
}

/* =========================
   상태
========================= */
let filteredCache = [];   // 필터 적용 후
let currentPage = 1;

/* =========================
   중앙 데이터 관리자에서 데이터 가져오기
========================= */
function getFostersData() {
    // 중앙 데이터 관리자 사용 - RTDB 접근 최소화
    return fosterDataManager.getData() || [];
}

/* =========================
   필터 정규화
========================= */
function normalizeArea(value) {
    const map = {
        "area-all": "",
        "area-seoul": "서울",
        "area-busan": "부산",
        "area-daegu": "대구",
        "area-incheon": "인천",
        "area-gwangju": "광주",
        "area-sejong": "세종",
        "area-daejeon": "대전",
        "area-ulsan": "울산",
        "area-gyeonggi": "경기",
        "area-gangwon": "강원",
        "area-chungbuk": "충북",
        "area-chungnam": "충남",
        "area-jeonbuk": "전북",
        "area-jeonnam": "전남",
        "area-gyeongbuk": "경북",
        "area-gyeongnam": "경남",
        "area-jeju": "제주",
    };
    return map[value] ?? "";
}

function normalizeAnimal(value) {
    const map = {
        "animall-all": "",
        "animall-dog": "dog",
        "animall-cat": "cat",
        "animall-etc": "etc",
    };
    return map[value] ?? "";
}

function normalizePeriod(value) {
    const map = {
        "period-all": "",
        "period-month": "1",
        "period-three": "3",
        "period-half": "6",
    };
    return map[value] ?? "";
}

/* =========================
   preferAnimals 파싱 + 한글 출력
========================= */
function parsePreferAnimals(raw) {
    // return Set(["dog","cat","etc"])
    const set = new Set();
    if (!raw) return set;

    if (Array.isArray(raw)) {
        raw.forEach((v) => mapAnimalTokenToKey(v, set));
        return set;
    }

    const tokens = String(raw)
        .split(/[,/|]/g)
        .map((s) => s.trim())
        .filter(Boolean);

    tokens.forEach((v) => mapAnimalTokenToKey(v, set));
    return set;
}

function mapAnimalTokenToKey(token, set) {
    const t = String(token).toLowerCase();

    // 영문 키
    if (t.includes("dog")) return set.add("dog");
    if (t.includes("cat")) return set.add("cat");
    if (t.includes("etc") || t.includes("other")) return set.add("etc");

    // 한글 입력도 허용
    if (t.includes("강아지") || t.includes("개")) return set.add("dog");
    if (t.includes("고양이") || t.includes("냥")) return set.add("cat");
    if (t.includes("기타") || t.includes("그외") || t.includes("그 외")) return set.add("etc");

    // 애매하면 etc
    return set.add("etc");
}

function preferAnimalsToKoreanText(preferSet) {
    const map = { dog: "강아지", cat: "고양이", etc: "기타" };
    if (!preferSet || preferSet.size === 0) return "-";
    return Array.from(preferSet)
        .map((k) => map[k] ?? k)
        .join(", ");
}

/* =========================
   필터 적용
========================= */
function applyFilters(list, { areaKey, animalKey, periodKey }) {
    const filtered = list.filter((u) => {
        const info = u.fosterInfo ?? {};

        // 활동 가능만(활동 중 임시보호자)
        if (info.isAvailable !== true) return false;

        // 지역 필터
        // areaKey가 있으면 (전체 지역이 아니면) 해당 지역으로 필터링
        if (areaKey) {
            const address = String(info.address ?? "");
            // 각 지역별 전체 명칭과 약칭 모두 매칭
            let matched = false;

            if (areaKey === "서울" && (address.includes("서울") || address.includes("서울특별시"))) matched = true;
            else if (areaKey === "부산" && (address.includes("부산") || address.includes("부산광역시"))) matched = true;
            else if (areaKey === "대구" && (address.includes("대구") || address.includes("대구광역시"))) matched = true;
            else if (areaKey === "인천" && (address.includes("인천") || address.includes("인천광역시"))) matched = true;
            else if (areaKey === "광주" && (address.includes("광주") || address.includes("광주광역시"))) matched = true;
            else if (areaKey === "세종" && (address.includes("세종") || address.includes("세종특별자치시"))) matched = true;
            else if (areaKey === "대전" && (address.includes("대전") || address.includes("대전광역시"))) matched = true;
            else if (areaKey === "울산" && (address.includes("울산") || address.includes("울산광역시"))) matched = true;
            else if (areaKey === "경기" && (address.includes("경기") || address.includes("경기도"))) matched = true;
            else if (areaKey === "강원" && (address.includes("강원") || address.includes("강원도") || address.includes("강원특별자치도"))) matched = true;
            else if (areaKey === "충북" && (address.includes("충북") || address.includes("충청북도"))) matched = true;
            else if (areaKey === "충남" && (address.includes("충남") || address.includes("충청남도"))) matched = true;
            else if (areaKey === "전북" && (address.includes("전북") || address.includes("전라북도") || address.includes("전북특별자치도"))) matched = true;
            else if (areaKey === "전남" && (address.includes("전남") || address.includes("전라남도"))) matched = true;
            else if (areaKey === "경북" && (address.includes("경북") || address.includes("경상북도"))) matched = true;
            else if (areaKey === "경남" && (address.includes("경남") || address.includes("경상남도"))) matched = true;
            else if (areaKey === "제주" && (address.includes("제주") || address.includes("제주특별자치도"))) matched = true;

            if (!matched) return false;
        }
        // areaKey가 없으면 전체 지역 표시 (필터링 안 함)

        // 동물
        const preferSet = parsePreferAnimals(info.preferAnimals);
        if (animalKey && !preferSet.has(animalKey)) return false;

        // 기간
        if (periodKey) {
            const mp = String(info.maxPeriod ?? "");
            if (!mp.includes(periodKey)) return false;
        }

        return true;
    });

    // 경력 연수 높은 순으로 정렬 (숙련자 우선)
    filtered.sort((a, b) => {
        const yearsA = Number(a.fosterInfo?.experienceYears ?? 0);
        const yearsB = Number(b.fosterInfo?.experienceYears ?? 0);
        return yearsB - yearsA; // 내림차순
    });

    return filtered;
}

/* =========================
   렌더 유틸
========================= */
function escapeHtml(str) {
    return String(str).replace(/[&<>"']/g, (m) => ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;",
    }[m]));
}

function getTotalPages(totalCount) {
    return Math.max(5, Math.ceil(totalCount / PAGE_SIZE));
}

function getPageSlice(list, page) {
    const start = (page - 1) * PAGE_SIZE;
    return list.slice(start, start + PAGE_SIZE);
}

/* =========================
   리스트 렌더 (현재 페이지)
========================= */
function renderFosterListPage() {
    if (!$listWrap) return;

    const totalPages = getTotalPages(filteredCache.length);

    // 현재 페이지 보정
    if (currentPage > totalPages) currentPage = totalPages;
    if (currentPage < 1) currentPage = 1;

    const pageItems = getPageSlice(filteredCache, currentPage);

    // 로딩 스피너 제거 (데이터 로드 완료)
    hideListLoading();

    $listWrap.innerHTML = "";

    if (pageItems.length === 0) {
        $listWrap.innerHTML = `
    <div class="foster-list" style="padding:1rem;">
      <div class="foster-list-main">
        <strong class="list-title">해당 페이지에 표시할 데이터가 없습니다.</strong>
        <div class="list-flex" style="margin-top:.5rem;">
          <span>데이터가 적으면 1페이지에만 표시됩니다.</span>
        </div>
      </div>
    </div>
  `;
        renderPagination(filteredCache.length);
        return;
    }

    const html = pageItems.map((u) => {
        const info = u.fosterInfo ?? {};

        const name = info.name ?? "이름없음";
        const address = info.address ?? "지역 미등록";
        const maxPeriod = info.maxPeriod ?? "-";
        const phone = info.phone ? String(info.phone) : "-";
        const experienceYears = Number(info.experienceYears ?? 0);

        const preferSet = parsePreferAnimals(info.preferAnimals);
        const preferKo = preferAnimalsToKoreanText(preferSet);

        const dogOn = preferSet.has("dog");
        const catOn = preferSet.has("cat");
        const etcOn = preferSet.has("etc");

        // 경력 기간 표시 (2년 이상이면 숙련자 파란색, 그 외는 회색)
        const isExpert = experienceYears >= 2;
        const experienceClass = isExpert ? 'experience-years' : 'experience-years-novice';
        const experienceLabel = `<span class="${experienceClass}" title="경력(year)">${experienceYears}</span>`;

        return `
      <div class="foster-list" data-uid="${escapeHtml(u.uid)}">
        <div class="foster-list-main">
          <div class="icon-flex">
            <div class="icon-box ${dogOn ? "is-on" : "is-off"}" data-icon="dog">
              <img class="foster-icon-dog" src="../assets/images/foster-dog-icon.webp" alt="강아지">
            </div>
            <div class="icon-box ${catOn ? "is-on" : "is-off"}" data-icon="cat">
              <img class="foster-icon-cat" src="../assets/images/foster-cat-icon.webp" alt="고양이">
            </div>
            <div class="icon-box ${etcOn ? "is-on" : "is-off"}" data-icon="etc">
              <img class="foster-icon-etc" src="../assets/images/foster-etc-icon.webp" alt="기타">
            </div>
          </div>

          <strong class="list-title">${escapeHtml(name)} ${experienceLabel}</strong>

          <div class="list-flex">
            <span class="list-region">${escapeHtml(address)}</span>
            <span>${escapeHtml(preferKo)}</span>
            <span>${escapeHtml(String(maxPeriod))}</span>
            <span>${escapeHtml(phone)}</span>
          </div>

          <div class="list-document">
            <img src="../assets/images/foster-document-icon.svg" alt="서류 아이콘">
          </div>
        </div>
      </div>
    `;
    }).join("");

    $listWrap.insertAdjacentHTML("beforeend", html);

    renderPagination(filteredCache.length);
}

/* =========================
   페이지네이션 렌더 (당신 HTML 구조 사용)
   - 최소 1페이지 표시
   - 최대 5개 번호만 노출
========================= */
function renderPagination(totalCount) {
    if (!$paginationWrap || !$pageList || !$btnPrevFinal || !$btnNextFinal) return;

    const realTotalPages = Math.ceil(totalCount / PAGE_SIZE); // 실제 데이터 페이지 수
    const uiTotalPages = Math.max(5, realTotalPages);        // UI 최소 5페이지

    // pagination 항상 표시
    $paginationWrap.style.display = "flex";

    // 현재 페이지 보정 (실제 데이터 범위 기준)
    if (currentPage < 1) currentPage = 1;
    if (currentPage > uiTotalPages) currentPage = uiTotalPages;

    // 페이지 번호 범위 (최대 5개)
    const maxButtons = 5;
    let start = Math.max(1, currentPage - Math.floor(maxButtons / 2));
    let end = start + maxButtons - 1;

    if (end > uiTotalPages) {
        end = uiTotalPages;
        start = Math.max(1, end - maxButtons + 1);
    }

    // 번호 렌더
    $pageList.innerHTML = "";

    for (let p = start; p <= end; p++) {
        const li = document.createElement("li");
        li.textContent = String(p);

        const isEmptyPage = p > realTotalPages; // 🔥 빈 페이지 여부

        if (p === currentPage && !isEmptyPage) {
            li.classList.add("active");
        }

        if (isEmptyPage) {
            // ❌ 빈 페이지: 클릭 불가 + 회색 표시
            li.classList.add("disabled");
        } else {
            // ✅ 유효 페이지: 클릭 가능
            li.addEventListener("click", () => {
                currentPage = p;
                renderFosterListPage();
            });
        }

        $pageList.appendChild(li);
    }

    // prev / next 버튼 처리
    $btnPrevFinal.classList.toggle("disabled", currentPage === 1);
    $btnNextFinal.classList.toggle(
        "disabled",
        currentPage >= realTotalPages || realTotalPages === 0
    );
}


/* =========================
   이벤트 바인딩
========================= */
function bindPaginationEvents() {
    if (!$btnPrevFinal || !$btnNextFinal) return;
    
$btnPrevFinal.addEventListener("click", (e) => {
  e.preventDefault();
  if (currentPage <= 1) return;
  currentPage -= 1;
  renderFosterListPage();
});

$btnNextFinal.addEventListener("click", (e) => {
  e.preventDefault();

  const realTotalPages = Math.ceil(filteredCache.length / PAGE_SIZE);
  if (currentPage >= realTotalPages) return; // 🔥 빈 페이지 이동 방지

  currentPage += 1;
  renderFosterListPage();
});

}

function bindFilterEvents() {
    [$area, $animal, $period].forEach((el) => {
        el?.addEventListener("change", () => {
            currentPage = 1;
            updateListByFilter({ forceFetch: false });
        });
    });
}

/* =========================
   메인 업데이트
========================= */
function updateListByFilter() {
    try {
        // 로딩 스피너 표시
        showListLoading();

        const areaKey = normalizeArea($area?.value);
        const animalKey = normalizeAnimal($animal?.value);
        const periodKey = normalizePeriod($period?.value);

        // 중앙 데이터 관리자에서 캐시된 데이터 가져오기
        const fostersCache = getFostersData();

        filteredCache = applyFilters(fostersCache, { areaKey, animalKey, periodKey });

        // 필터 결과가 바뀌면 현재 페이지 보정
        const totalPages = getTotalPages(filteredCache.length);
        if (currentPage > totalPages) currentPage = totalPages;
        if (currentPage < 1) currentPage = 1;

        renderFosterListPage();
    } catch (err) {
        console.error("[foster-filter] 목록 업데이트 실패:", err);
        if ($listWrap) {
            $listWrap.innerHTML = `
        <div class="foster-list" style="padding:1rem;">
          <div class="foster-list-main">
            <strong class="list-title">데이터 로딩 실패</strong>
            <div class="list-flex" style="margin-top:.5rem;">
              <span>${escapeHtml(String(err?.message ?? err))}</span>
            </div>
          </div>
        </div>
      `;
        }
        if ($pageList) $pageList.innerHTML = "";
    }
}

/* =========================
   중앙 데이터 관리자 구독 및 초기화
========================= */
// 중앙 데이터 관리자 초기화 대기 후 구독
(async function initFilterModule() {
    try {
        // 초기 로딩 스피너 표시
        showListLoading();

        // 초기화 완료 대기
        await fosterDataManager.waitForInit();

        // 사용자 지역 가져오기
        userRegion = await getUserRegion();
        console.log(`[foster-filter] 사용자 지역: ${userRegion}`);

        // select 박스 기본값을 사용자 지역으로 설정
        if (userRegion && $area) {
            const regionValue = getAreaValueByRegion(userRegion);
            if (regionValue) {
                $area.value = regionValue;
                console.log(`[foster-filter] 지역 필터 기본값 설정: ${regionValue}`);
            }
        }

        // 데이터 변경 구독 - 자동 리스트 업데이트 (중복 방지)
        fosterDataManager.subscribe((data) => {
            console.log(`[foster-filter] 데이터 업데이트 감지: ${data?.length || 0}명`);
            updateListByFilter();
        }, 'foster-filter');

        bindPaginationEvents();
        bindFilterEvents();

        // 초기 렌더링
        updateListByFilter();
    } catch (error) {
        console.error("[foster-filter] 초기화 실패:", error);
    }
})();

// ========== 지역명에서 select value 가져오기 ==========
function getAreaValueByRegion(region) {
    const map = {
        "서울": "area-seoul",
        "부산": "area-busan",
        "대구": "area-daegu",
        "인천": "area-incheon",
        "광주": "area-gwangju",
        "세종": "area-sejong",
        "대전": "area-daejeon",
        "울산": "area-ulsan",
        "경기": "area-gyeonggi",
        "강원": "area-gangwon",
        "충북": "area-chungbuk",
        "충남": "area-chungnam",
        "전북": "area-jeonbuk",
        "전남": "area-jeonnam",
        "경북": "area-gyeongbuk",
        "경남": "area-gyeongnam",
        "제주": "area-jeju"
    };
    return map[region] || null;
}

// ========== 사용자 지역 가져오기 ==========
async function getUserRegion() {
    try {
        const user = auth.currentUser;
        if (!user) {
            console.log('[foster-filter] 로그인하지 않은 사용자');
            return null; // 로그인 안 했으면 지역 필터 적용 안 함
        }

        const snapshot = await database.ref('users/' + user.uid).once('value');
        const userData = snapshot.val();

        if (!userData) {
            console.log('[foster-filter] 사용자 데이터 없음');
            return null;
        }

        // userType에 따라 주소 가져오기
        let address = null;
        if (userData.userType === 'shelter' && userData.shelterInfo?.address) {
            address = userData.shelterInfo.address;
        } else if (userData.userType === 'foster' && userData.fosterInfo?.address) {
            address = userData.fosterInfo.address;
        }

        if (!address) {
            console.log('[foster-filter] 사용자 주소 정보 없음');
            return null;
        }

        return extractRegionFromAddress(address);
    } catch (error) {
        console.error('[foster-filter] 사용자 지역 가져오기 실패:', error);
        return null;
    }
}

// ========== 주소에서 지역명 추출 ==========
function extractRegionFromAddress(address) {
    if (!address) return null;

    const addr = String(address);

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

    return null;
}

/* 필요 시 외부에서 강제 새로고침 */
export function refreshFosterList() {
    currentPage = 1;
    updateListByFilter();
}
