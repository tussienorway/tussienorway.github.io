(function () {
  var toggle = document.querySelector(".nav-toggle");
  var nav = document.getElementById("meny");
  if (!toggle || !nav) return;

  function closeNav() {
    toggle.setAttribute("aria-expanded", "false");
    document.body.classList.remove("nav-open");
  }

  toggle.addEventListener("click", function () {
    var open = toggle.getAttribute("aria-expanded") === "true";
    toggle.setAttribute("aria-expanded", open ? "false" : "true");
    document.body.classList.toggle("nav-open", !open);
  });

  nav.addEventListener("click", function (event) {
    if (event.target.closest("a")) closeNav();
  });

  document.addEventListener("keydown", function (event) {
    if (event.key === "Escape") closeNav();
  });

  document.addEventListener("click", function (event) {
    if (!document.body.classList.contains("nav-open")) return;
    if (nav.contains(event.target) || toggle.contains(event.target)) return;
    closeNav();
  });

  var services = Array.prototype.slice.call(document.querySelectorAll(".service"));
  services.forEach(function (item) {
    item.addEventListener("toggle", function () {
      if (!item.open) return;
      services.forEach(function (other) {
        if (other !== item) other.open = false;
      });
    });
  });
})();
