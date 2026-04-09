// DOM요소 로드 후 로직 실행
document.addEventListener('DOMContentLoaded', () => {
    // DOM 요소 가져오기
    const emailEl = document.getElementById("email");
    const passwordEl = document.getElementById("password");
    const loginBtn = document.getElementById("loginBtn");
    const logoutBtn = document.getElementById("logoutBtn");

    // 로그인 함수!!!
    const logIn = async (e) => {
        e.preventDefault();

        const email = emailEl.value;
        const password = passwordEl.value;

        try {
            // Firebase Auth 로그인
            const userCredential = await auth.signInWithEmailAndPassword(email, password);
            const userId = userCredential.user.uid;

            // DB에서 사용자 정보 가져오기
            const snapshot = await database.ref('users/' + userId).once('value');
            const userData = snapshot.val();

            if (!userData) {
                alert('사용자 정보를 찾을 수 없습니다.');
                return;
            }

            // 로그인 성공 시 index.html 이동
            alert('로그인 성공!');
            location.href = "../index.html";


        } catch (error) {
            console.error('로그인 오류:', error);

            if (error.code === 'auth/user-not-found') {
                alert('등록되지 않은 이메일입니다.');
            } else if (error.code === 'auth/wrong-password') {
                alert('비밀번호가 틀렸습니다.');
            } else if (error.code === 'auth/invalid-email') {
                alert('이메일 형식이 올바르지 않습니다.');
            } else {
                alert('로그인 실패: ' + error.message);
            }
        }
    };

    // 로그아웃 함... 수...
    const logOut = async (e) => {
        e.preventDefault();
        try {
            await auth.signOut();
            alert('로그아웃 되었습니다.');
            const isInPages = location.pathname.includes('/pages/');
            location.href = isInPages ? './login.html' : './pages/login.html';
        } catch (error) {
            console.error('로그아웃 오류:', error);
            alert('로그아웃 실패');
        }
    };


    // 버튼 이벤트 연결
    if(loginBtn) loginBtn.addEventListener("click", logIn);
    if(logoutBtn) logoutBtn.addEventListener("click", logOut);

    if (!location.pathname.includes('login.html') && !location.pathname.includes('signup.html')) {
        checkAuth().catch(error => {
            console.error('Auth check failed:', error);
        });
    }
});