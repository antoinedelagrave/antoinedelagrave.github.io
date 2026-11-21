// ?lang= wins (used to print each PDF), then saved choice, then browser language; same idea for the theme
(function () {
  var q = new URLSearchParams(location.search).get("lang");
  var saved = null;
  try { saved = localStorage.getItem("lang"); } catch (e) {}
  var l = q || saved || (navigator.language || "fr").slice(0, 2);
  l = l === "en" ? "en" : "fr";
  document.documentElement.lang = l;
  document.documentElement.dataset.lang = l;
  // theme before first paint (no light flash): saved choice, then the system setting
  var th = null;
  try { th = localStorage.getItem("theme"); } catch (e) {}
  document.documentElement.dataset.theme = th || (matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");
  document.documentElement.classList.add("js");  // terminal starts closed only when terminal.js can open it
  // if terminal.js fails to load, drop the class so the terminal shows open and static (load errors do not bubble)
  addEventListener("error", function (e) {
    if (e.target && /terminal\.js$/.test(e.target.src || "")) document.documentElement.classList.remove("js");
  }, true);
})();
