const trigger = document.getElementById("accTrigger");
const menu = document.getElementById("accOptions");

let isOpen = false;

trigger.addEventListener("click", (e) => {
  e.stopPropagation();

  if (!isOpen) {
    menu.style.display = "flex";

    // force initial render for transition
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

// ⬇️ close only when clicking OUTSIDE trigger + menu
document.addEventListener("click", (e) => {
  if (!isOpen) return;

  if (
    trigger.contains(e.target) ||
    menu.contains(e.target)
  ) {
    return;
  }

  closeMenu();
});

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
