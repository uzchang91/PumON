// js/navigation.js
export function goPetDetail(desertionNo) {
  window.location.href = `./foster.html?id=${desertionNo}`;
}

export function goShelterDetail(shelterId) {
  window.location.href = `./shelter.html?id=${shelterId}`;
}