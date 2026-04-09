import { db } from "./firebase-config.js";
import {
  ref,
  set,
  push,
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-database.js";

/*
  ⚠️ 개발 전용
  1) /users 전체 삭제
  2) 랜덤 임시보호자(userType=foster) N명 생성
  - UID: push() 랜덤 키
  - 이름: 한글 3글자
  - 지역: 시/도 목록 기반 랜덤 주소
  - preferAnimals 등 랜덤
*/

// ============================================

const SEED_COUNT = 145; // 생성 인원 수 (원하는 숫자로 변경)

// 이미지처럼 시/도 목록(표준 명칭)
const REGIONS = [
  "서울특별시",
  "부산광역시",
  "대구광역시",
  "인천광역시",
  "광주광역시",
  "세종특별자치시",
  "대전광역시",
  "울산광역시",
  "경기도",
  "강원특별자치도",
  "충청북도",
  "충청남도",
  "전북특별자치도",
  "전라남도",
  "경상북도",
  "경상남도",
  "제주특별자치도",
];

// 간단 구/군/동 랜덤 조합용 토큰
const DISTRICTS = ["중구", "서구", "남구", "북구", "동구", "서초구", "강남구", "송파구", "달서구", "수성구"];
const TOWNS = ["중앙동", "역삼동", "사직동", "양산동", "우동", "화정동", "반월동", "정자동", "연동", "대연동"];

// 한글 성/이름(자음/모음 기반 단순 랜덤)
const FAMILY = ["김", "이", "박", "최", "정", "강", "조", "윤", "장", "임", "한", "오", "서", "신", "권"];
const GIVEN1 = ["민", "서", "도", "예", "지", "하", "준", "현", "수", "우", "재", "은", "다", "아", "태"];
const GIVEN2 = ["준", "빈", "영", "훈", "진", "원", "림", "연", "경", "호", "윤", "나", "민", "수", "혁"];

const PERIODS = ["1~3개월", "3~6개월", "6개월이상"];
const SIZES = ["소형", "중형", "대형"];
const ANIMALS = ["dog", "cat", "etc"];

// ---------------- helpers ----------------
const rand = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;
const pick = (arr) => arr[rand(0, arr.length - 1)];
const shuffle = (arr) => arr.slice().sort(() => Math.random() - 0.5);

function randomKoreanName3() {
  return `${pick(FAMILY)}${pick(GIVEN1)}${pick(GIVEN2)}`; // 3글자
}

function randomPhone() {
  // 010-XXXX-XXXX 형태로 하이픈 포함
  const mid = String(rand(0, 9999)).padStart(4, "0");
  const last = String(rand(0, 9999)).padStart(4, "0");
  return `010-${mid}-${last}`;
}

function randomEmail(name) {
  // 완전 랜덤이면서도 충돌 낮게
  const id = `${name}${rand(100, 9999)}`.toLowerCase();
  return `${id}@example.com`;
}

function randomAddress() {
  // 경기도 약간 가중치 (약 15%), 나머지 균등 분배
  const random = Math.random();
  let region;

  if (random < 0.15) {
    region = "경기도";
  } else {
    region = pick(REGIONS);
  }

  const district = pick(DISTRICTS);
  const town = pick(TOWNS);
  // 시/도 + 구/군 + 동 (간단)
  return `${region} ${district} ${town}`;
}

function randomSubset(list, { min = 1, max = 3 } = {}) {
  const count = rand(min, Math.min(max, list.length));
  return shuffle(list).slice(0, count);
}

function buildRandomFosterUser() {
  const name = randomKoreanName3();
  const phone = randomPhone();
  const email = randomEmail(name);

  // 숙련자(2년 이상) 비율: 전체의 15% 미만 (약 13%)
  const random = Math.random();
  let hasExperience, experienceYears;

  if (random < 0.13) {
    // 13% 숙련자 (2년 이상)
    hasExperience = true;
    experienceYears = rand(2, 8);
  } else if (random < 0.40) {
    // 27% 경험 있지만 초보 (1년)
    hasExperience = true;
    experienceYears = 1;
  } else {
    // 60% 경험 없음
    hasExperience = false;
    experienceYears = 0;
  }

  return {
    userType: "foster",
    email,
    createdAt: new Date().toISOString(),
    fosterInfo: {
      name,
      phone,
      address: randomAddress(),

      cert: "cert-dog",                 // 필요하면 cert도 랜덤화 가능
      certNumber: String(rand(100000000, 999999999)),

      experience: hasExperience ? "Y" : "N",
      experienceYears: experienceYears,

      isAvailable: true,
      maxPeriod: pick(PERIODS),

      preferAnimals: randomSubset(ANIMALS, { min: 1, max: 3 }),
      preferSizes: randomSubset(SIZES, { min: 1, max: 2 }),

      specialCare: [],                  // 필요하면 랜덤 문구 넣기 가능
    },
  };
}

// ---------------- main ----------------
async function resetAndSeedUsers() {
  console.group("🧨 Seed Start: Reset /users & Create Random Foster Users");

  try {

    // 1) 랜덤 생성
    console.log(`2) 랜덤 임시보호자 ${SEED_COUNT}명 생성 중...`);
    const createdUids = [];

    for (let i = 0; i < SEED_COUNT; i++) {
      const newRef = push(ref(db, "users"));
      const uid = newRef.key;

      await set(newRef, buildRandomFosterUser());

      createdUids.push(uid);

      // 너무 많은 로그가 싫으면 i % 10 === 0 같은 조건으로 줄여도 됨
      console.log(`✅ 생성 ${i + 1}/${SEED_COUNT}:`, uid);
    }

    console.groupEnd();

    console.group("🎉 Seed Completed");
    console.log("총 생성 수:", createdUids.length);
    console.log("생성된 UID 예시(앞 10개):", createdUids.slice(0, 10));
    console.log("참고: 실행할 때마다 /users가 초기화됩니다.");
    console.groupEnd();
  } catch (err) {
    console.error("❌ Seed 실패:", err);
    console.groupEnd();
  }
}

resetAndSeedUsers();
