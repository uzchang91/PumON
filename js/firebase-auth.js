///////////////////////////////////////////////
// Firebase Compat SDK 초기화
// ⚠️ 중앙 설정: firebase-init.js 참조
///////////////////////////////////////////////

// Firebase 설정 (pum-test3)
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

const app = firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();
const database = firebase.database();

///////////////////////////////////////////////
// 인증 관련 함수
///////////////////////////////////////////////

// 로그인 상태검증 함수
async function checkAuth(requiredUserType = null) {
    return new Promise((resolve, reject) => {
        const unsubscribe = auth.onAuthStateChanged(async (user) => {
            unsubscribe();

            try {
                if (!user) {
                    console.log("로그아웃");

                    // 로그인/회원가입 페이지가 아닐 때만 리다이렉트
                    if (!location.pathname.includes('login.html') && !location.pathname.includes('signup.html')) {
                        alert('로그인이 필요합니다.');
                        // location.href = './pages/login.html';
                    }
                    reject('Not logged in');
                    return;
                }

                const snapshot = await database.ref('users/' + user.uid).once('value');
                const userData = snapshot.val();

                if (!userData) {
                    alert('사용자 정보를 찾을 수 없습니다.');
                    await auth.signOut();
                    location.href = './login.html';
                    reject('User data not found');
                    return;
                }

                if (requiredUserType && userData.userType !== requiredUserType) {
                    alert('접근 권한이 없습니다.');
                    location.href = './login.html';
                    reject('Unauthorized');
                    return;
                }

                console.log(`로그인중: ${userData.userType}`);
                resolve(userData);
            } catch (error) {
                console.error('checkAuth error:', error);
                reject(error);
            }
        }, (authError) => {
            unsubscribe();
            console.error('onAuthStateChanged error:', authError);
            reject(authError);
        });
    });
}

// checkAuth() 사용 방법
// - 파라미터 없음: 로그인 상태만 확인
// - "shelter" 또는 "foster": 해당 권한만 허용
// - resolve: 로그인 성공 + 권한 있음
// - reject: 로그인 안 됨 또는 권한 없음

///////////////////////////////////////////////
// 헤더 UI 업데이트 함수
///////////////////////////////////////////////
function updateHeaderUI(user, userData) {
    const accLoading = document.getElementById('accLoading');
    const accGuest = document.getElementById('accGuest');
    const accUser = document.getElementById('accUser');
    const accName = document.getElementById('accName');
    const accRole = document.getElementById('accRole');

    // 로딩 스피너 숨김
    if (accLoading) accLoading.style.display = 'none';

    if (user && userData) {
        // 로그인 상태
        if (accGuest) accGuest.style.display = 'none';
        if (accUser) accUser.style.display = 'flex';
        if (accName) accName.textContent = userData.fosterInfo?.name || userData.shelterInfo?.name || '사용자';
        if (accRole) {
            const roleMap = { foster: '임시 보호자', shelter: '보호소' };
            accRole.textContent = roleMap[userData.userType] || userData.userType;
        }
    } else {
        // 비로그인 상태
        if (accGuest) accGuest.style.display = 'flex';
        if (accUser) accUser.style.display = 'none';
    }
}

// 페이지 로드 시 인증 상태 확인 및 UI 업데이트
auth.onAuthStateChanged(async (user) => {
    if (user) {
        try {
            const snapshot = await database.ref('users/' + user.uid).once('value');
            const userData = snapshot.val();
            updateHeaderUI(user, userData);
        } catch (error) {
            console.error('헤더 UI 업데이트 실패:', error);
            updateHeaderUI(null, null);
        }
    } else {
        updateHeaderUI(null, null);
    }
});

///////////////////////////////////////////////
// 페이지 접근 제어 함수
///////////////////////////////////////////////

// 특정 권한이 필요한 페이지 접근 제어
// requiredUserType: 'shelter' 또는 'foster'
// redirectUrl: 접근 불가 시 이동할 URL
let requireAuthChecked = false; // 첫 인증 체크 완료 여부

function requireAuth(requiredUserType, redirectUrl = '../index.html') {
    // 페이지 콘텐츠를 먼저 숨김
    document.documentElement.style.visibility = 'hidden';
    requireAuthChecked = false;

    auth.onAuthStateChanged(async (user) => {
        // 첫 체크만 리다이렉트 처리 (이후 로그아웃 등은 기존 리스너가 처리)
        if (requireAuthChecked) return;
        requireAuthChecked = true;

        // 비로그인 상태
        if (!user) {
            alert('로그인이 필요한 페이지입니다.');
            location.href = redirectUrl;
            return;
        }

        try {
            const snapshot = await database.ref('users/' + user.uid).once('value');
            const userData = snapshot.val();

            // 사용자 데이터 없음
            if (!userData) {
                alert('사용자 정보를 찾을 수 없습니다.');
                location.href = redirectUrl;
                return;
            }

            // 권한 불일치
            if (userData.userType !== requiredUserType) {
                alert('접근 권한이 없습니다.');
                location.href = redirectUrl;
                return;
            }

            // 접근 허용 - 페이지 콘텐츠 표시
            document.documentElement.style.visibility = 'visible';
            console.log(`${requiredUserType} 권한 확인 완료`);
        } catch (error) {
            console.error('권한 확인 오류:', error);
            location.href = redirectUrl;
        }
    });
}
