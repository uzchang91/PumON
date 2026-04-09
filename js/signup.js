// Firebase는 firebase-auth.js에서 초기화됨
// auth와 database 객체는 전역으로 사용 가능

/*
  [기능 정의]

  냥..
  input입력 - api 데이터 조회(구현전) - 회원가입버튼눌렀을때 db저장되는 로직
*/

// DOM요소 (보호소)
const selectShelterBtn = document.getElementById("btn-select-shelter");

const shelterEmailEl = document.getElementById("shelter-email");
const shelterPwEl = document.getElementById("shelter-password");
const shelterPwcEl = document.getElementById("shelter-password-confirm");
const shelterMgEl = document.getElementById("shelter-manager-name");
const shelterMgpEl = document.getElementById("shelter-manager-phone");

const shelterOwnerNameEl = document.getElementById("shelter-owner-name");
const shelterBizNmEl = document.getElementById("shelter-business-number");
const shelterNmEl = document.getElementById("shelter-name");
const shelterRegNmEl = document.getElementById("shelter-registration-number");
const shelterAddressEl = document.getElementById("shelter-address");

// DOM요소 (임보)
const selectFosterBtn = document.getElementById("btn-select-foster");

const userEmailEl = document.getElementById("user-email");
const userPwEl = document.getElementById("user-password");
const userPwcEl = document.getElementById("user-password-confirm");

const userNameEl = document.getElementById("user-name");
const userPhoneEl = document.getElementById("user-phone");
const userAddressEl = document.getElementById("user-address");

//배열
const userPrefDogEl = document.getElementById("user-prefer-dog");
const userPrefCatEl = document.getElementById("user-prefer-cat");
const userPrefEctEl = document.getElementById("user-prefer-etc");
//배열
const usersizeSEl = document.getElementById("user-size-small");
const usersizeMEl = document.getElementById("user-size-medium");
const usersizeLEl = document.getElementById("user-size-large");
// 조건문
const userExpNEl = document.getElementById("user-experience-no");
const userExpYEl = document.getElementById("user-experience-yes");
const userExpYNmEl = document.getElementById("user-experience-yesNm");
//배열
const userCareMediEl = document.getElementById("user-care-medicine");
const userCaredisabledEl = document.getElementById("user-care-disabled");
const userCareSeniorEl = document.getElementById("user-care-senior");

const userCertNmEl = document.getElementById("user-cert-number");

// DOM요소 (전송)
const beforeBtn = document.getElementById("btn-before");
const signUpBtn = document.getElementById("btn-signup");

// DOM요소 (div)
const shelterBox = document.querySelector(".signup-shelter");
const fosterBox = document.querySelector(".signup-users");
const signupSelectBox = document.getElementById("signupSelect");
const signupBtnGroup = document.getElementById("signupBtnGroup");

/////////////////////////////////////////////////////



// 전역 변수
let selectedUserType = null;

// 1. 보호소
// Step 1: 보호소 선택
selectShelterBtn.addEventListener("click", () => {
  selectedUserType = 'shelter';
  signupSelectBox.classList.add("hidden");
  shelterBox.classList.remove("hidden");
  fosterBox.classList.add("hidden");
  signupBtnGroup.classList.remove("hidden");
  console.log("보호소버튼클릭완료", selectedUserType);
});

// Step 2: 회원가입 함수
const signUpShelter = async () => {
  // 1. 값 가져오기
  const email = shelterEmailEl.value;
  const password = shelterPwEl.value;
  const passwordConfirm = shelterPwcEl.value;

  // 2. 비밀번호 확인
  if (password !== passwordConfirm) {
    alert('비밀번호가 일치하지 않습니다.');
    // 추후 일치하지 않음 문구 html 내부요소 삽입으로 표시
    return;
  }

  try {
    // 3. Firebase Auth 회원가입
    const userCredential = await auth.createUserWithEmailAndPassword(email, password);
    const userId = userCredential.user.uid;

    // 4. DB에 저장할 데이터
    const userData = {
      userType: selectedUserType,
      email: email,
      createdAt: new Date().toISOString(),
      shelterInfo: {
        managerName: shelterMgEl.value,
        managerPhone: shelterMgpEl.value,
        type: document.querySelector('input[name="shelter-type"]:checked').value,
        ownerName: shelterOwnerNameEl.value,
        businessNumber: shelterBizNmEl.value,
        name: shelterNmEl.value,
        regNum: shelterRegNmEl.value,
        address: shelterAddressEl.value,
      }
    };
    console.log(userData, "데이터입력값확인");

    // 5. Realtime DB에 저장
    await database.ref('users/' + userId).set(userData);

    alert('회원가입 완료!');
    location.href = '../index.html';

  } catch (error) {
    alert('오류: ' + error.message);
  }
  console.log("보호소회원가입완료");

}




// 2. 임시보호
// Step 1: 임시보호자 선택
selectFosterBtn.addEventListener("click", () => {
  selectedUserType = 'foster';
  signupSelectBox.classList.add("hidden");
  fosterBox.classList.remove("hidden");
  shelterBox.classList.add("hidden");
  signupBtnGroup.classList.remove("hidden");
  console.log("개인버튼클릭완료", selectedUserType);
});

// Step 2: 회원가입 함수
const signUpFoster = async () => {
  const email = userEmailEl.value;
  const password = userPwEl.value;
  const passwordConfirm = userPwcEl.value;

  if (password !== passwordConfirm) {
    alert('비밀번호가 일치하지 않습니다.');
    // 엔터이벤트로 바로 html에 뜨게 뭘 좀 연결해야겟슴
    return;
  }


  try {
    const userCredential = await auth.createUserWithEmailAndPassword(email, password);
    const userId = userCredential.user.uid;

    // 체크박스 수집 (배열)
    const preferAnimals = [];
    if (userPrefDogEl.checked) preferAnimals.push('dog');
    if (userPrefCatEl.checked) preferAnimals.push('cat');
    if (userPrefEctEl.checked) preferAnimals.push('etc');

    const preferSizes = [];
    if (usersizeSEl.checked) preferSizes.push('소형');
    if (usersizeMEl.checked) preferSizes.push('중형');
    if (usersizeLEl.checked) preferSizes.push('대형');

    const specialCare = [];
    if (userCareMediEl.checked) specialCare.push('medicine');
    if (userCaredisabledEl.checked) specialCare.push('disabled');
    if (userCertNmEl.checked) specialCare.push('senior');

    // 반려동물 양육 유무
    // - 경험 유 text input
    let experienceYears = 0;

    if (userExpNEl.checked) {
      experienceYears = 0;
    }
    if (userExpYEl.checked) {
      experienceYears = parseInt(userExpYNmEl.value);
    }

    // DB에 저장할 데이터    
    const userData = {
      userType: selectedUserType,
      email: email,
      createdAt: new Date().toISOString(),
      fosterInfo: {
        name: userNameEl.value,
        phone: userPhoneEl.value,
        address: userAddressEl.value,
        maxPeriod: document.querySelector('input[name="user-period"]:checked').value,
        preferAnimals: preferAnimals,
        preferSizes: preferSizes,
        experience: document.querySelector('input[name="user-experience"]:checked').value,
        experienceYears: experienceYears,
        specialCare: specialCare, // 선택사항 없으면 빈배열로 저장
        cert: document.querySelector('input[name="user-cert"]:checked').value,
        certNumber: userCertNmEl.value,
        isAvailable: true, // 임시보호가능상태 : 가입시 true, 추후 toggle 버튼, 상태업데이트
      }
    };
    console.log(userData);

    await database.ref('users/' + userId).set(userData);
    alert('임시보호자 회원가입 완료!');
    location.href = '../index.html';

  } catch (error) {
    alert('오류: ' + error.message);
  }
};

// Step 3: 회원가입 버튼이벤트 연결
signUpBtn.addEventListener("click", async () => {
  if (selectedUserType === 'shelter') {
    await signUpShelter();
  } else if (selectedUserType === 'foster') {
    await signUpFoster();
  } else {
    alert('회원 유형을 선택해주세요.');
  }
  console.log("회원가입버튼클릭했다");
});

// Step 4: 이전 버튼 이벤트 연결
beforeBtn.addEventListener("click", () => {
  // 선택 화면으로 돌아가기
  signupSelectBox.classList.remove("hidden");
  shelterBox.classList.add("hidden");
  fosterBox.classList.add("hidden");
  signupBtnGroup.classList.add("hidden");
  selectedUserType = null;
  console.log("이전버튼클릭 - 선택화면으로 돌아감");
});

