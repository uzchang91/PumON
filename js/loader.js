// js/loader.js

const loader = {
  container: null,
  bar: null,

  init() {
    this.container = document.getElementById("pageLoader");
    this.bar = this.container?.querySelector(".loader-bar");
  },

  show() {
    if (!this.container || !this.bar) this.init();
    if (!this.container || !this.bar) return;

    this.container.style.display = "block";
    this.bar.style.width = "0%";
  },

  setProgress(percent) {
    if (!this.bar) return;
    this.bar.style.width = `${percent}%`;
  },

  hide() {
    if (!this.container) return;
    this.bar.style.width = "100%";
    setTimeout(() => {
      this.container.style.display = "none";
    }, 300);
  }
};

// 👇 named exports (중요)
export const showLoader = () => loader.show();
export const setLoaderProgress = (p) => loader.setProgress(p);
export const hideLoader = () => loader.hide();
