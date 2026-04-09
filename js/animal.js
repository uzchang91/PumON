// Firebase 임포트
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { get, getDatabase, ref } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-database.js";

// Firebase 설정
const firebaseConfig = {
    apiKey: "AIzaSyABz-oFmsh5QFp8oYzWkz2530478LL8wOA",
    authDomain: "pum-test3.firebaseapp.com",
    databaseURL: "https://pum-test3-default-rtdb.firebaseio.com",
    projectId: "pum-test3",
    storageBucket: "pum-test3.firebasestorage.app",
    messagingSenderId: "835661739835",
    appId: "1:835661739835:web:f657319388ed15528aa91e",
    measurementId: "G-KNLPNK3S5D"
};

const app = initializeApp(firebaseConfig);
const db = getDatabase(app);

// 상수 설정
const PROXY_IMG = "http://127.0.0.1:8787/img?url=";
const DEFAULT_IMAGES = {
    "개": "https://cdn-icons-png.flaticon.com/512/616/616408.png",
    "고양이": "https://cdn-icons-png.flaticon.com/512/616/616430.png",
    "기타": "https://cdn-icons-png.flaticon.com/512/616/616408.png"
};

// 전역 변수
let allAnimals = [];
let filteredAnimals = [];
let urgentAnimals = [];
let regionData = {};
const ITEMS_PER_PAGE = 16;
let currentPage = 1;
let swiperInstance = null;
let chartInstance = null;
let currentImages = [];
let currentImgIdx = 0;

// 날짜를 Date 객체로 변환하는 함수
function parseDate(dateStr) {
    if (!dateStr) return new Date(9999, 11, 31); // 날짜가 없으면 먼 미래로 설정
    // YYYYMMDD 형식을 YYYY-MM-DD로 변환
    const year = dateStr.substring(0, 4);
    const month = dateStr.substring(4, 6);
    const day = dateStr.substring(6, 8);
    return new Date(`${year}-${month}-${day}`);
}

/* 동물 배열을 마감일 기준으로 정렬하는 함수
function sortByDeadline(animals) {
    return animals.sort((a, b) => {
        const dateA = parseDate(a.noticeEdt);
        const dateB = parseDate(b.noticeEdt);
        return dateA - dateB; // 마감일이 빠른 순서대로 정렬
    });
}*/
function sortByDeadline(animals) {
    return animals.sort((a, b) => {
        // 하이픈(-)을 제거하여 20250101 같은 숫자 형태로 만든 뒤 비교합니다.
        const dateA = parseInt(a.happenDt.replace(/-/g, '')) || 0;
        const dateB = parseInt(b.happenDt.replace(/-/g, '')) || 0;
        
        // dateA - dateB : 숫자가 작은 날짜(오래된 날짜)가 위로 올라옵니다.
        return dateA - dateB; 
    });
}

// 데이터 로드
async function loadData() {
    try {
        const snapshot = await get(ref(db, "rescuedAnimals/shelters/list"));
        if (!snapshot.exists()) return;

        const shelters = Object.values(snapshot.val());
        allAnimals = [];
        regionData = {};
        urgentAnimals = [];
        const sidoCounts = {};

        shelters.forEach(s => {
            const info = s.info;
            if (!info) return;

            const parts = (info.orgNm || "").split(" ");
            const sido = parts[0] || "기타";
            const sigungu = parts[1] || "";

            if (!regionData[sido]) regionData[sido] = new Set();
            if (sigungu) regionData[sido].add(sigungu);

            const aniList = info.animals ? Object.values(info.animals) : [];
            sidoCounts[sido] = (sidoCounts[sido] || 0) + aniList.length;

            // 보호소 수용률 계산 (shelter.js와 동일한 로직)
            const capacity = (info.shelterCapacity === "미확인" || isNaN(info.shelterCapacity))
                ? 0
                : Number(info.shelterCapacity);
            const currentAnimals = Number(info.currentAnimals) || 0;
            const isUrgentShelter = capacity > 0 && (currentAnimals / capacity) >= 0.9;

            aniList.forEach(a => {
                let kindCat = "기타";
                const kindNm = a.kindNm || "";
                if (kindNm.includes("개") || kindNm.includes("강아지")) kindCat = "개";
                else if (kindNm.includes("고양이")) kindCat = "고양이";

                const item = {
                    ...a,
                    careNm: info.careNm,
                    orgNm: info.orgNm,
                    careTel: info.careTel || "번호 정보 없음",
                    sido,
                    sigungu,
                    kindCategory: kindCat
                };
                allAnimals.push(item);

                // 수용률 90% 이상인 보호소의 동물은 긴급 입양 대상
                if (isUrgentShelter) urgentAnimals.push(item);
            });
        });

        // 전체 동물 배열을 마감일 기준으로 정렬
        allAnimals = sortByDeadline(allAnimals);
        
        filteredAnimals = [...allAnimals];
        updateRegionChart(sidoCounts);
        initFilterUI();
        renderUrgent();
        goToPage(1);
    } catch (err) {
        console.error(err);
    }
}

// 차트 업데이트
function updateRegionChart(counts) {
    //const tc = document.getElementById('totalCount'); 테스트중

const loadingEl = document.getElementById('chartLoading');
    if (loadingEl) loadingEl.style.display = 'none';

    const tc = document.getElementById('totalCount');
    if (tc) tc.textContent = `총 ${allAnimals.length}마리`;




   // if (tc) tc.textContent = `총 ${allAnimals.length}마리`; 테스트중
    
    const sortedKeys = Object.keys(counts).sort((a, b) => counts[b] - counts[a]);
    const sortedValues = sortedKeys.map(k => counts[k]);
    const ctx = document.getElementById('regionChart');
    
    if (!ctx) return;
    
    if (chartInstance) chartInstance.destroy();
    
    chartInstance = new Chart(ctx.getContext('2d'), {
        type: 'bar',
        data: {
            labels: sortedKeys,
            datasets: [{
                label: '보호 동물 수',
                data: sortedValues,
                backgroundColor: '#f97316',
                borderRadius: 8,
                barThickness: 15
            }]
        },
        options: {
            indexAxis: 'y',
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: false },
                tooltip: {
                    backgroundColor: '#1f2937',
                    padding: 12
                }
            },
            scales: {
                x: {
                    grid: { display: false },
                    border: { display: false }
                },
                y: {
                    grid: { display: false },
                    border: { display: false },
                    ticks: {
                        font: { weight: 'bold', family: 'Pretendard' },
                        color: '#4b5563'
                    }
                }
            }
        }
    });
}

// 동물 카드 생성
function createAnimalCard(it) {
    const rawImg = it.popfile || it.popfile1 || it.filename;
    const fallback = DEFAULT_IMAGES[it.kindCategory] || DEFAULT_IMAGES["기타"];
    const imgUrl = rawImg ? (PROXY_IMG + encodeURIComponent(rawImg)) : fallback;
    const shelterRegion = it.orgNm ? it.orgNm.split(" ").slice(1).join(" ") : "지역 미상";
    const cleanKindNm = it.kindNm.replace(/\[[^\]]*\]/g, '').trim();

    const div = document.createElement("div");
    div.className = "animal-card";
    div.innerHTML = `
        <div class="animal-img-wrapper">
            <img src="${imgUrl}" class="${rawImg ? 'animal-img' : 'animal-img-fallback'}" 
                 onerror="this.src='${fallback}';">
            <div class="animal-badge">${it.sido || "NEW"}</div>
        </div>
        <div class="animal-info">
            <p class="animal-date">구조일자 ${it.happenDt || ""}</p>
            <h5 class="animal-name">${cleanKindNm}</h5>
            <div class="animal-shelter">${it.careNm}</div>
            <div class="animal-footer">
                <span class="animal-link">상세보기 ❯</span>
                <span class="animal-region">${shelterRegion}</span>
            </div>
        </div>`;
    div.onclick = () => showDetail(it);
    return div;
}

// 상세 모달 표시
function showDetail(it) {
    const cleanKindNm = it.kindNm.replace(/\[[^\]]*\]/g, '').trim();
    document.getElementById("mCareNmHeader").textContent = it.careNm;
    document.getElementById("mKindTitle").textContent = cleanKindNm;
    document.getElementById("mSpecs").textContent = `${it.sexCd === 'M' ? '남아' : '여아'} / ${it.colorCd} / ${it.age} / ${it.weight}`;
    document.getElementById("mNoticeNo").textContent = it.noticeNo;
    //document.getElementById("mNoticeDate").textContent = `${it.noticeSdt} ~ ${it.noticeEdt}`; 공고기간
    document.getElementById("mPlace").textContent = it.happenPlace;
    document.getElementById("mMark").textContent = it.specialMark;
    document.getElementById("mShelterInfo").innerHTML = `🏠 ${it.careNm}`;

    const adoptBtn = document.getElementById("mAdoptBtn");
    adoptBtn.textContent = `${it.careTel}`;
    adoptBtn.onclick = () => {
        if (it.careTel !== "번호 정보 없음") {
            location.href = `tel:${it.careTel}`;
        } else {
            alert("전화번호가 없습니다.");
        }
    };

    const locBtn = document.getElementById("mLocBtn");
    locBtn.onclick = () => {
        const searchKeyword = encodeURIComponent(it.careNm);
        window.open(`https://map.kakao.com/link/search/${searchKeyword}`, '_blank');
    };

    currentImages = [it.popfile, it.popfile1, it.popfile2, it.popfile3, it.popfile4, it.filename]
        .filter(src => src && src.trim() !== "");
    currentImages = [...new Set(currentImages)];
    currentImgIdx = 0;
    updateSliderUI(it.kindCategory);

    /* 게이지 생성
    document.getElementById("gaugeList").innerHTML = ["건강", "활동성", "사회성", "친화도"].map(label => `
        <div class="gauge-item">
            <span class="gauge-label">${label}</span>
            <div class="gauge-container">${Array.from({ length: 5 }, (_, i) => `<div class="gauge-box ${i < (Math.floor(Math.random() * 2) + 3) ? 'active' : ''}"></div>`).join('')}</div>
        </div>`).join('');*/

    document.getElementById("modalOverlay").style.display = "flex";
    document.body.style.overflow = "hidden";
}

// 긴급 입양 렌더링
function renderUrgent() {
    const wrapper = document.getElementById("urgentScroll");
    wrapper.innerHTML = "";
    urgentAnimals.slice(0, 15).forEach(it => {
        const slide = document.createElement("div");
        slide.className = "swiper-slide";
        slide.appendChild(createAnimalCard(it));
        wrapper.appendChild(slide);
    });
    if (swiperInstance) swiperInstance.destroy();
    swiperInstance = new Swiper('.swiper-container', {
        slidesPerView: 'auto',
        spaceBetween: 24,
        loop: true,
        autoplay: { delay: 3000 },
        pagination: { el: '.swiper-pagination', clickable: true }
    });
}

// 긴급 모달 열기
window.openUrgentModal = () => {
    const grid = document.getElementById("urgentGrid");
    grid.innerHTML = "";
    if (urgentAnimals.length === 0) {
        grid.innerHTML = "<div class='loading-message'>현재 긴급 입양 대상이 없습니다.</div>";
    } else {
        urgentAnimals.forEach(it => grid.appendChild(createAnimalCard(it)));
    }
    document.getElementById("urgentModalOverlay").style.display = "flex";
    document.body.style.overflow = "hidden";
};

// 긴급 모달 닫기
window.closeUrgentModal = () => {
    document.getElementById("urgentModalOverlay").style.display = "none";
    document.body.style.overflow = "auto";
};

//이게 있어야 상세모달이 최상단에 올라옴
document.body.appendChild(modalOverlay);

// 필터 UI 초기화
function initFilterUI() {
    const sidoSel = document.getElementById("sidoFilter");
    const sigunguSel = document.getElementById("sigunguFilter");
    
    Object.keys(regionData).sort().forEach(s => {
        const opt = document.createElement("option");
        opt.value = s;
        opt.textContent = s;
        sidoSel.appendChild(opt);
    });
    
    sidoSel.onchange = () => {
        const sido = sidoSel.value;
        sigunguSel.innerHTML = '<option value="">시/군/구 선택</option>';
        if (sido && regionData[sido]) {
            sigunguSel.disabled = false;
            Array.from(regionData[sido]).sort().forEach(sg => {
                const opt = document.createElement("option");
                opt.value = sg;
                opt.textContent = sg;
                sigunguSel.appendChild(opt);
            });
        } else {
            sigunguSel.disabled = true;
        }
        applyFilters();
    };
    
    sigunguSel.onchange = applyFilters;
    
    document.getElementById("resetFilter").onclick = () => {
        sidoSel.value = "";
        sigunguSel.value = "";
        sigunguSel.disabled = true;
        applyFilters();
    };
}

// 필터 적용
function applyFilters() {
    const sido = document.getElementById("sidoFilter").value;
    const sigungu = document.getElementById("sigunguFilter").value;
    
    // 필터링
    filteredAnimals = allAnimals.filter(a => (!sido || a.sido === sido) && (!sigungu || a.sigungu === sigungu));
    
    // 필터링된 결과도 마감일 기준으로 정렬
    filteredAnimals = sortByDeadline(filteredAnimals);
    
    goToPage(1);
}

// 페이지 이동
function goToPage(page) {
    const totalPages = Math.ceil(filteredAnimals.length / ITEMS_PER_PAGE);
    currentPage = Math.max(1, Math.min(page, totalPages || 1));
    const grid = document.getElementById("animalGrid");
    grid.innerHTML = "";
    const start = (currentPage - 1) * ITEMS_PER_PAGE;
    const items = filteredAnimals.slice(start, start + ITEMS_PER_PAGE);
    if (items.length === 0) {
        grid.innerHTML = "<div class='loading-message'>결과가 없습니다.</div>";
    } else {
        items.forEach(it => grid.appendChild(createAnimalCard(it)));
    }
    renderPaginationUI();
}

// 페이지네이션 UI 렌더링
function renderPaginationUI() {
    const container = document.getElementById("pagination");
    container.innerHTML = "";
    const totalPages = Math.ceil(filteredAnimals.length / ITEMS_PER_PAGE);

    if (totalPages <= 1) return;

    // 맨 앞으로 버튼
    if (currentPage > 1) {
        const firstBtn = document.createElement("button");
        firstBtn.className = "nav-btn";
        firstBtn.innerHTML = `맨앞`;
        firstBtn.onclick = () => {
            goToPage(1);
            document.getElementById('animalGrid').scrollIntoView({ behavior: 'smooth', block: 'start' });
        };
        container.appendChild(firstBtn);
    }

    // 이전 버튼
    const prevBtn = document.createElement("button");
    prevBtn.className = "nav-btn";
    prevBtn.innerHTML = `❮`;
    prevBtn.disabled = currentPage === 1;
    prevBtn.onclick = () => {
        goToPage(currentPage - 1);
        document.getElementById('animalGrid').scrollIntoView({ behavior: 'smooth', block: 'start' });
    };
    container.appendChild(prevBtn);

    // 페이지 번호
    /*let startPage = Math.max(1, currentPage - 3);
    let endPage = Math.min(totalPages, startPage + 2);

    if (endPage - startPage < 2) {
        startPage = Math.max(1, endPage - 1);
    }*/

        // 페이지 번호 (항상 현재 페이지 기준으로 이동)
const PAGE_RANGE = 3; // 보여줄 페이지 버튼 개수

let startPage = currentPage - Math.floor(PAGE_RANGE / 2);
let endPage = currentPage + Math.floor(PAGE_RANGE / 2);

// 시작 페이지 보정
if (startPage < 1) {
    startPage = 1;
    endPage = PAGE_RANGE;
}

// 마지막 페이지 보정
if (endPage > totalPages) {
    endPage = totalPages;
    startPage = Math.max(1, totalPages - PAGE_RANGE + 1);
}




    for (let i = startPage; i <= endPage; i++) {
        if (i < 1) continue;
        const p = document.createElement("button");
        p.className = i === currentPage ? "page-btn active" : "page-btn";
        p.textContent = i;
        p.onclick = () => {
            goToPage(i);
            document.getElementById('animalGrid').scrollIntoView({ behavior: 'smooth', block: 'start' });
        };
        container.appendChild(p);
    }

    // 다음 버튼
    const nextBtn = document.createElement("button");
    nextBtn.className = "nav-btn";
    nextBtn.innerHTML = `❯`;
    nextBtn.disabled = currentPage === totalPages;
    nextBtn.onclick = () => {
        goToPage(currentPage + 1);
        document.getElementById('animalGrid').scrollIntoView({ behavior: 'smooth', block: 'start' });
    };
    container.appendChild(nextBtn);

    // 맨 뒤로 버튼
    if (currentPage < totalPages) {
        const lastBtn = document.createElement("button");
        lastBtn.className = "nav-btn";
        lastBtn.innerHTML = `맨뒤`;
        lastBtn.onclick = () => {
            goToPage(totalPages);
            document.getElementById('animalGrid').scrollIntoView({ behavior: 'smooth', block: 'start' });
        };
        container.appendChild(lastBtn);
    }
}

// 슬라이더 UI 업데이트
function updateSliderUI(kind = "기타") {
    const mainImg = document.getElementById("mMainImg");
    const thumbContainer = document.getElementById("mThumbnails");
    const fallback = DEFAULT_IMAGES[kind] || DEFAULT_IMAGES["기타"];
    
    if (currentImages.length > 0) {
        mainImg.src = PROXY_IMG + encodeURIComponent(currentImages[currentImgIdx]);
        document.getElementById("mImgCount").textContent = `${currentImgIdx + 1}/${currentImages.length}`;
        thumbContainer.innerHTML = currentImages.map((img, idx) => `
            <div class="modal-thumbnail ${idx === currentImgIdx ? 'active' : ''}" onclick="window.changeIdx(${idx}, '${kind}')">
                <img src="${PROXY_IMG + encodeURIComponent(img)}" onerror="this.src='${fallback}';">
            </div>`).join('');
    }
}

// 이미지 인덱스 변경
window.changeIdx = (idx, kind) => {
    currentImgIdx = idx;
    updateSliderUI(kind);
};

// 이벤트 리스너
document.getElementById("prevBtn").onclick = () => {
    currentImgIdx = (currentImgIdx <= 0) ? currentImages.length - 1 : currentImgIdx - 1;
    updateSliderUI();
};

document.getElementById("nextBtn").onclick = () => {
    currentImgIdx = (currentImgIdx >= currentImages.length - 1) ? 0 : currentImgIdx + 1;
    updateSliderUI();
};

document.getElementById("closeModal").onclick = () => {
    document.getElementById("modalOverlay").style.display = "none";
    document.body.style.overflow = "auto";
};

// DOMContentLoaded 이벤트
window.addEventListener("DOMContentLoaded", loadData);