// 드롭다운 기능
const trigger = document.getElementById("accTrigger");
const menu = document.getElementById("accOptions");

let isOpen = false;

trigger.addEventListener("click", (e) => {
  e.stopPropagation();

  if (!isOpen) {
    menu.style.display = "flex";

    // 👇 forces initial render
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        menu.classList.add("open");
      });
    });

    isOpen = true;
  } else {
    closeMenu();
  }
});

document.addEventListener("click", closeMenu);

document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") closeMenu();
});

function closeMenu() {
  if (!isOpen) return;

  menu.classList.remove("open");

  setTimeout(() => {
    menu.style.display = "none";
  }, 250);

  isOpen = false;
}

// ========== 임시보호 가능 체크박스 기능 ==========
const protectableCheckbox = document.getElementById("protectable");
const protectableLi = protectableCheckbox?.closest("li");

// 로그인 상태 확인 및 userType에 따른 UI 처리
auth.onAuthStateChanged(async (user) => {
  if (!user || !protectableLi) return;

  try {
    const snapshot = await database.ref('users/' + user.uid).once('value');
    const userData = snapshot.val();

    if (!userData) return;

    // shelter 유저는 임시보호 가능 옵션 숨김
    if (userData.userType === 'shelter') {
      protectableLi.style.display = 'none';
      return;
    }

    // foster 유저는 표시하고 현재 상태 반영
    protectableLi.style.display = 'flex';

    if (userData.fosterInfo?.isAvailable !== undefined) {
      protectableCheckbox.checked = userData.fosterInfo.isAvailable;
    }

    // 체크박스 변경 이벤트 리스너
    protectableCheckbox.addEventListener('change', async () => {
      const newValue = protectableCheckbox.checked;

      try {
        await database.ref('users/' + user.uid + '/fosterInfo/isAvailable').set(newValue);
        console.log(`[acc-options] isAvailable 변경: ${newValue}`);
      } catch (error) {
        console.error('[acc-options] isAvailable 업데이트 실패:', error);
        // 실패 시 원래 상태로 복원
        protectableCheckbox.checked = !newValue;
      }
    });

  } catch (error) {
    console.error('[acc-options] 사용자 정보 조회 실패:', error);
  }
});
