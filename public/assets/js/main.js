/* main.js — landing nav burger + smooth scroll. */
(function () {
  "use strict";

  const burger = document.querySelector(".nav-burger");
  const links  = document.querySelector(".nav-links");
  if (burger && links) {
    burger.addEventListener("click", () => {
      const open = links.classList.toggle("is-open");
      burger.setAttribute("aria-expanded", open ? "true" : "false");
    });
    // Close burger on link click (mobile)
    links.querySelectorAll("a").forEach((a) => {
      a.addEventListener("click", () => {
        if (links.classList.contains("is-open")) {
          links.classList.remove("is-open");
          burger.setAttribute("aria-expanded", "false");
        }
      });
    });
  }
})();
