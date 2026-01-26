// Get the modal
const modal = document.getElementById("tosModal");

// Get the button that opens the modal
const btn = document.getElementById("tos");

// Get the <span> element that closes the modal
const closeEl = document.getElementsByClassName("close")[0];

// When the user clicks on the button, open the modal
btn.onclick = function () {
  modal.style.display = "block";
  document.body.classList.add("modal-open");
}

// When the user clicks on <span> (x), close the modal
closeEl.onclick = function () {
  modal.style.display = "none";
  document.body.classList.remove("modal-open");
}

// When the user clicks anywhere outside of the modal, close it
window.onclick = function (event) {
  if (event.target == modal) {
    modal.style.display = "none";
    document.body.classList.remove("modal-open");
  }
} 