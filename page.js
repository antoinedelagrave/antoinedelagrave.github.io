// language toggle, dark mode toggle and table-of-contents scroll-spy
var html = document.documentElement;
document.getElementById("lang-toggle").onclick = function () {
  var l = html.dataset.lang === "fr" ? "en" : "fr";
  html.dataset.lang = html.lang = l;
  try { localStorage.setItem("lang", l); } catch (e) {}
  document.dispatchEvent(new Event("langchange"));
};

// theme: the button cycles automatic -> light -> dark; automatic follows the system setting live
var themeBtn = document.getElementById("theme-toggle");
var sysDark = matchMedia("(prefers-color-scheme: dark)");
var THEME_LABEL = { auto: ["Thème : automatique", "Theme: automatic"], light: ["Thème : clair", "Theme: light"], dark: ["Thème : sombre", "Theme: dark"] };
function applyTheme() {
  var pref = html.dataset.themePref;
  html.dataset.theme = pref === "auto" ? (sysDark.matches ? "dark" : "light") : pref;
  themeBtn.title = THEME_LABEL[pref][html.dataset.lang === "en" ? 1 : 0];
  themeBtn.setAttribute("aria-label", themeBtn.title);
}
applyTheme();
themeBtn.onclick = function () {
  var pref = { auto: "light", light: "dark", dark: "auto" }[html.dataset.themePref];
  html.dataset.themePref = pref;
  try { if (pref === "auto") localStorage.removeItem("theme"); else localStorage.setItem("theme", pref); } catch (e) {}
  applyTheme();
};
sysDark.addEventListener("change", applyTheme);
document.addEventListener("langchange", applyTheme);

// scroll-spy: the active section is the last one whose top has passed 30% of the viewport
var tocLinks = [].slice.call(document.querySelectorAll(".nav-links a"));
var tocSecs = tocLinks.map(function (a) { return document.querySelector(a.getAttribute("href")); });
var spyQueued = false;
function spy() {
  spyQueued = false;
  var cur = -1, mark = innerHeight * 0.3;
  tocSecs.forEach(function (sec, i) { if (sec.getBoundingClientRect().top <= mark) cur = i; });
  if (innerHeight + scrollY >= document.documentElement.scrollHeight - 2) cur = tocSecs.length - 1;
  tocLinks.forEach(function (a, i) {
    a.classList.toggle("active", i === cur);
    if (i === cur) a.setAttribute("aria-current", "true"); else a.removeAttribute("aria-current");
  });
}
function queueSpy() { if (!spyQueued) { spyQueued = true; requestAnimationFrame(spy); } }
addEventListener("scroll", queueSpy, { passive: true });
addEventListener("resize", queueSpy);
spy();
