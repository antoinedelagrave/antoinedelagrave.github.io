// Hero terminal: tabs, typing animation with idle loop, interactive prompt, copy-on-click email, secret snake tab.
// Without JS the panels render statically; with reduced motion nothing animates.
(function () {
  var html = document.documentElement;
  var term = document.querySelector(".term");
  if (!term) return;

  var reduceMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;
  var LOOP_PAUSE = 6000;  // ms between idle replays
  var PYQCM_VERSION = "2.33.0";  // PyPI, November 2026: bump by hand
  var tabs = [].slice.call(term.querySelectorAll("[role=tab]"));
  var typingTimers = [], loopTimer;

  function t(fr, en) { return html.dataset.lang === "en" ? en : fr; }
  function esc(s) { return s.replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }
  function panelOf(tab) { return document.getElementById(tab.getAttribute("aria-controls")); }
  function current() { return term.querySelector(".body:not([hidden])"); }

  // ---------- tabs ----------
  function selectTab(tab) {
    if (!isOpen()) animateHeight(function () { term.classList.add("opened"); delete term.dataset.exited; });
    tab.hidden = false;
    tabs.forEach(function (x) {
      var on = x === tab;
      x.setAttribute("aria-selected", on);
      x.tabIndex = on ? 0 : -1;
      panelOf(x).hidden = !on;
      resetSession(panelOf(x));  // hidden panels share the grid cell: old output would keep the terminal tall
    });
    if (panelOf(tab).id !== "panel-snake") snake.stop();
    play(panelOf(tab));
  }
  tabs.forEach(function (tab) {
    tab.addEventListener("click", function () { if (tab.getAttribute("aria-selected") !== "true") selectTab(tab); });
    tab.addEventListener("keydown", function (e) {
      if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
      var vis = tabs.filter(function (x) { return !x.hidden; });
      var i = vis.indexOf(tab), n = vis[(i + (e.key === "ArrowRight" ? 1 : vis.length - 1)) % vis.length];
      selectTab(n); n.focus();
    });
  });

  // ---------- typing animation + idle loop ----------
  function play(panel) {
    typingTimers.forEach(clearTimeout); typingTimers = [];
    clearTimeout(loopTimer);
    resetSession(panel);
    var typed = panel.querySelector(".typed"), cmd = typed.dataset[html.dataset.lang];
    if (reduceMotion) { finish(panel); return; }
    panel.classList.add("typing");
    typed.textContent = "";
    var ms = 450;  // a beat on the empty prompt
    cmd.split("").forEach(function (ch, i) {
      ms += 45 + Math.random() * 65;
      typingTimers.push(setTimeout(function () { typed.textContent = cmd.slice(0, i + 1); }, ms));
    });
    typingTimers.push(setTimeout(function () { finish(panel); }, ms + 380));  // Enter
  }
  function finish(panel) {
    typingTimers.forEach(clearTimeout); typingTimers = [];
    var typed = panel.querySelector(".typed");
    typed.textContent = typed.dataset[html.dataset.lang];
    panel.classList.remove("typing");
    if (panel.id === "panel-snake") snake.ready();
    armLoop();
  }
  // replay after a pause, never while the pointer or keyboard focus is on the terminal (:focus-visible, so a
  // mouse click on a tab does not freeze it), never once the visitor has typed in the panel, never for snake
  function inUse() {
    try { return term.matches(":hover") || !!term.querySelector(":focus-visible"); }
    catch (e) { return term.matches(":hover") || term.contains(document.activeElement); }  // Safari < 15.4
  }
  function armLoop() {
    clearTimeout(loopTimer);
    var p = current();
    if (!p || inUse() || p.classList.contains("typing") || p.dataset.used || p.id === "panel-snake" ||
        !isOpen()) return;
    loopTimer = setTimeout(function () { play(current()); }, LOOP_PAUSE);
  }
  term.addEventListener("mouseenter", function () { clearTimeout(loopTimer); });
  term.addEventListener("focusin", function () { if (inUse()) clearTimeout(loopTimer); });
  term.addEventListener("mouseleave", function () { setTimeout(armLoop); });
  term.addEventListener("focusout", function () { setTimeout(armLoop); });

  document.addEventListener("langchange", function () {
    [].forEach.call(term.querySelectorAll(".body"), function (p) {
      if (p.classList.contains("typing") && !p.hidden) play(p);
      else { var typed = p.querySelector(".typed"); typed.textContent = typed.dataset[html.dataset.lang]; }
    });
    snake.render();
  });

  // ---------- interactive prompt ----------
  var history = [], hIdx = 0;
  function resetSession(panel) {
    var s = panel.querySelector(".session");
    if (s) s.textContent = "";
    var input = panel.querySelector("input.cmd");
    panel.classList.remove("cleared");
    delete panel.dataset.used;
    if (input) { input.value = ""; refresh(input); }
  }
  // the input is exactly as wide as its text, so the block cursor and the ghost suggestion sit right after it.
  // ponytail: the block cursor always sits at the end of the line; editing mid-line with Left/Right is not drawn
  function refresh(input) {
    var n = input.value.length;
    input.style.width = n + "ch";
    // WebKit keeps ~2px of caret room inside text fields: at exactly n ch the text scrolls and its first letter is clipped
    var extra = input.scrollWidth - input.clientWidth;
    if (extra > 0) input.style.width = "calc(" + n + "ch + " + extra + "px)";
    input.scrollLeft = 0;
    input.parentNode.querySelector(".ghost").textContent = suggest(input.value, input.closest(".body"));
  }

  // autosuggestion, zsh/fish style: dim completion after the cursor, Tab or Right accepts it.
  // "help" is offered on an untouched prompt; secret commands are never suggested.
  var PUBLIC = ["help", "ls", "cd", "cat", "open", "lang", "whoami", "pwd", "echo", "clear", "exit"];
  function suggest(v, panel) {
    if (!v) return panel.dataset.used ? "" : "help";
    var m = v.match(/^(\S+)\s+(\S*)$/), opts, part;
    if (m) {
      opts = { cd: sectionIds, cat: ["projet.md", "project.md", "contact.md"], open: ["cv.pdf"], lang: ["fr", "en"] }[m[1]];
      part = m[2];
    } else if (!/\s/.test(v)) { opts = PUBLIC; part = v; }
    if (!opts) return "";
    for (var i = 0; i < opts.length; i++) if (opts[i].indexOf(part) === 0 && opts[i] !== part) return opts[i].slice(part.length);
    return "";
  }
  // cursor blink: one clock for every cursor in the terminal, always running (see .term.blink-off)
  if (!reduceMotion) setInterval(function () { term.classList.toggle("blink-off"); }, 550);
  function print(panel, markup) {
    var s = panel.querySelector(".session"), line = document.createElement("div");
    line.innerHTML = markup;
    s.appendChild(line);
    while (s.children.length > 80) s.removeChild(s.firstChild);
    panel.scrollTop = panel.scrollHeight;
  }
  function markUsed(panel) { panel.dataset.used = "1"; clearTimeout(loopTimer); }

  [].forEach.call(term.querySelectorAll(".prompt"), function (line) {
    var panel = line.closest(".body");
    var session = document.createElement("div");
    session.className = "session out";
    session.setAttribute("aria-live", "polite");
    line.parentNode.insertBefore(session, line);

    var input = document.createElement("input");
    input.className = "cmd"; input.type = "text"; input.autocomplete = "off"; input.spellcheck = false;
    input.setAttribute("autocapitalize", "off");
    input.setAttribute("aria-label", "Commande / Command");
    var cursor = line.querySelector(".cursor");
    line.insertBefore(input, cursor);
    var ghost = document.createElement("span");
    ghost.className = "ghost";
    ghost.setAttribute("aria-hidden", "true");
    line.appendChild(ghost);
    refresh(input);

    input.addEventListener("input", function () { markUsed(panel); refresh(input); });
    input.addEventListener("keydown", function (e) {
      var g = ghost.textContent;
      if (e.isComposing || e.keyCode === 229) return;  // dead keys / IME: Enter confirms the accent, not the command
      if (e.key === "Enter") {
        // the terminal consumes Enter: otherwise its default action (button activation) lands wherever the
        // command moved focus, e.g. `exit` focuses the reopen button, which this same Enter then clicked
        e.preventDefault();
        var v = input.value;
        input.value = "";
        run(v, panel);
        refresh(input);
      } else if (g && (e.key === "Tab" || e.key === "ArrowRight")) {  // the drawn cursor is always at the end
        e.preventDefault();  // with nothing to complete, Tab still moves focus
        input.value += g; markUsed(panel); refresh(input);
      } else if (e.key === "ArrowUp" || e.key === "ArrowDown") {
        e.preventDefault();
        if (!history.length) return;
        hIdx = Math.max(0, Math.min(history.length, hIdx + (e.key === "ArrowUp" ? -1 : 1)));
        input.value = history[hIdx] || ""; refresh(input);
      } else if (e.key === "l" && e.ctrlKey) {
        e.preventDefault(); run("clear", panel, true);
      }
    });
  });

  // a click in the terminal acts like clicking a real one: skip the animation, focus the prompt
  term.addEventListener("click", function (e) {
    var mail = e.target.closest('a[href^="mailto:"]');
    if (mail) {
      e.preventDefault();
      var p = mail.closest(".body"), addr = mail.getAttribute("href").slice(7);
      markUsed(p);
      copy(addr).then(function (ok) {
        print(p, ok ? '<span class="ok">✓</span> ' + t("adresse copiée dans le presse-papiers", "address copied to clipboard")
                    : t("copie impossible, voici l'adresse : ", "could not copy, here it is: ") + esc(addr));
      });
      return;
    }
    if (e.target.closest("a, button, input") || String(getSelection())) return;
    if (!isOpen()) { openTerm(); return; }
    var cur = current();
    if (!cur) return;
    if (cur.classList.contains("typing")) finish(cur);
    if (cur.id === "panel-snake") { cur.focus({ preventScroll: true }); return; }
    var input = cur.querySelector("input.cmd");
    if (input) input.focus({ preventScroll: true });
  });

  function copy(text) {
    if (navigator.clipboard && window.isSecureContext) {
      return navigator.clipboard.writeText(text).then(function () { return true; }, function () { return legacyCopy(text); });
    }
    return Promise.resolve(legacyCopy(text));
  }
  function legacyCopy(text) {
    var ta = document.createElement("textarea"), ok = false;
    ta.value = text; ta.style.position = "fixed"; ta.style.opacity = "0";
    document.body.appendChild(ta); ta.select();
    try { ok = document.execCommand("copy"); } catch (e) { ok = false; }
    ta.remove();
    return ok;
  }

  // ---------- commands ----------
  var files = { "projet.md": "panel-projet", "project.md": "panel-projet", "contact.md": "panel-contact" };
  var sectionIds = [].map.call(document.querySelectorAll(".nav-links a"), function (a) { return a.getAttribute("href").slice(1); });
  var aliases = { research: "recherche", education: "formation", projects: "projets", talks: "presentations",
                  presentations: "presentations", awards: "bourses", schools: "ecoles" };

  function kv(rows) {
    return '<div class="kv">' + rows.map(function (r) { return "<span>" + r[0] + '</span><span class="dim">' + r[1] + "</span>"; }).join("") + "</div>";
  }
  function scrollTo(el) { el.scrollIntoView({ behavior: reduceMotion ? "auto" : "smooth", block: "start" }); }

  var commands = {
    help: function (a, p) {
      print(p, kv([
        ["help", t("cette aide", "this help")],
        ["ls", t("lister les sections et fichiers", "list sections and files")],
        ["cd &lt;section&gt;", t("aller à une section de la page", "jump to a page section")],
        ["cat &lt;fichier&gt;", t("afficher projet.md ou contact.md", "show project.md or contact.md")],
        ["open cv.pdf", t("ouvrir le CV en PDF", "open the PDF CV")],
        ["lang fr|en", t("changer de langue", "switch language")],
        ["whoami", t("qui suis-je", "who am I")],
        ["clear", t("effacer le terminal (ctrl+L)", "clear the terminal (ctrl+L)")],
        ["exit", t("fermer le terminal", "close the terminal")]
      ]));
    },
    ls: function (a, p) {
      var dirs = sectionIds.map(function (id) { return '<span class="dir">' + id + "/</span>"; }).join("  ");
      print(p, dirs + "  " + t("projet.md", "project.md") + "  contact.md  cv.pdf");
    },
    cd: function (a, p) {
      var id = a.replace(/^~?\//, "").replace(/\/$/, "").toLowerCase();
      if (!id || id === "~" || id === "..") { scrollTo(document.body); return; }
      id = aliases[id] || id;
      var el = sectionIds.indexOf(id) >= 0 && document.getElementById(id);
      if (el) scrollTo(el); else print(p, "cd: no such file or directory: " + esc(a));
    },
    cat: function (a, p) {
      if (!a) { print(p, "usage: cat &lt;file&gt;"); return; }
      if (a === "cv.pdf") { print(p, t("cat: cv.pdf : fichier binaire, essayez open cv.pdf", "cat: cv.pdf: binary file, try open cv.pdf")); return; }
      var src = files[a] && document.querySelector("#" + files[a] + " dl.intro");
      if (!src) { print(p, "cat: " + esc(a) + ": No such file or directory"); return; }
      var out = src.cloneNode(true);
      out.className = "";  // drop intro/out so clear and typing states do not hide the copy
      p.querySelector(".session").appendChild(out);
      p.scrollTop = p.scrollHeight;
    },
    open: function (a, p) {
      if (a !== "cv.pdf") { print(p, a ? "open: " + esc(a) + ": No such file" : "usage: open cv.pdf"); return; }
      window.open("cv-" + html.dataset.lang + ".pdf", "_blank", "noopener");
      print(p, t("ouverture de cv.pdf…", "opening cv.pdf…"));
    },
    lang: function (a, p) {
      if (a !== "fr" && a !== "en") { print(p, "usage: lang fr|en"); return; }
      if (a !== html.dataset.lang) document.getElementById("lang-toggle").click();
      print(p, a === "en" ? "language: English" : "langue : français");
    },
    whoami: function (a, p) {
      print(p, "Antoine de Lagrave · " + t("doctorant en physique de la matière condensée, Université de Sherbrooke",
                                         "PhD student in condensed matter physics, Université de Sherbrooke"));
    },
    pwd: function (a, p) { print(p, "/home/adl/" + (p.id === "panel-contact" ? "contact" : t("these", "thesis"))); },
    echo: function (a, p) { print(p, esc(a)); },
    clear: function (a, p) { p.querySelector(".session").textContent = ""; p.classList.add("cleared"); },
    exit: function () { closeTerm(); },
    // not listed in help
    sudo: function (a, p) {
      print(p, t("adl n'est pas dans le fichier sudoers. Cet incident sera signalé.",
                 "adl is not in the sudoers file. This incident will be reported."));
    },
    pyqcm: function (a, p) {
      print(p, a === "--version" || a === "-V" ? "pyqcm " + PYQCM_VERSION : "usage: pyqcm --version");
    },
    snake: function () { selectTab(document.getElementById("tab-snake")); }
  };

  function run(raw, panel, silent) {
    markUsed(panel);
    commands.clear("", panel);  // each command replaces the previous screen (the terminal has a fixed size)
    var line = raw.trim();
    if (!silent) print(panel, '<span class="p">$</span> ' + esc(raw));
    if (!line) return;
    history.push(line); hIdx = history.length;
    var parts = line.split(/\s+/), cmd = parts[0], arg = parts.slice(1).join(" ");
    if (Object.prototype.hasOwnProperty.call(commands, cmd)) commands[cmd](arg, panel);
    else print(panel, "zsh: command not found: " + esc(cmd));
  }

  // ---------- open / exit ----------
  // The page loads with the terminal closed (only `.opened` shows the panels, CSS keys on html.js so the
  // no-JS page still shows everything). Opening and `exit` animate the height between the two states.
  var closedMsg = term.querySelector(".closed-msg"), heightTimer;
  function isOpen() { return term.classList.contains("opened"); }
  function animateHeight(mutate) {
    var h0 = term.offsetHeight;  // includes any inline height of an animation still running
    clearTimeout(heightTimer);
    term.style.transition = ""; term.style.height = "";
    mutate();
    var h1 = term.offsetHeight;
    if (reduceMotion || h0 === h1) return;
    term.style.height = h0 + "px";
    void term.offsetHeight;  // commit the start height before transitioning
    term.style.transition = "height .4s cubic-bezier(.22, 1, .36, 1)";
    term.style.height = h1 + "px";
    heightTimer = setTimeout(function () { term.style.height = ""; term.style.transition = ""; }, 450);
  }
  function openTerm() {
    if (isOpen()) return;
    animateHeight(function () { term.classList.add("opened"); delete term.dataset.exited; });
    play(current());
  }
  function closeTerm() {
    clearTimeout(loopTimer); typingTimers.forEach(clearTimeout); snake.stop();
    animateHeight(function () { term.classList.remove("opened"); term.dataset.exited = "1"; });
    closedMsg.focus({ preventScroll: true });
  }
  closedMsg.addEventListener("click", openTerm);

  // ---------- secret tab: snake ----------
  var snake = (function () {
    var panel = document.getElementById("panel-snake");
    if (!panel) return { ready: function () {}, stop: function () {}, render: function () {} };
    var board = panel.querySelector(".board"), status = panel.querySelector(".snake-status");
    var ROWS = 12, cols = 30, body, dir, queue, food, score = 0, timer, state = "idle";
    var best = 0, touch = matchMedia("(pointer: coarse)").matches;
    try { best = +localStorage.getItem("snake-best") || 0; } catch (e) {}

    function same(a, b) { return a[0] === b[0] && a[1] === b[1]; }
    function measure() {
      var probe = document.createElement("span");
      probe.textContent = "0000000000";
      board.appendChild(probe);
      var cw = probe.getBoundingClientRect().width / 10;
      probe.remove();
      // each cell is two characters wide so cells look square at line-height 1, plus the two border columns
      cols = Math.max(10, Math.min(48, Math.floor((board.clientWidth / cw - 2) / 2)));
    }
    function reset() {
      var mid = ROWS >> 1;
      body = [[3, mid], [2, mid], [1, mid]];
      dir = [1, 0]; queue = []; score = 0;
      placeFood();
    }
    function placeFood() {
      var free = [];
      for (var y = 0; y < ROWS; y++) for (var x = 0; x < cols; x++) {
        if (!body.some(function (s) { return s[0] === x && s[1] === y; })) free.push([x, y]);
      }
      food = free.length ? free[Math.floor(Math.random() * free.length)] : null;
    }
    function render() {
      if (state === "idle") return;
      var top = "┌" + new Array(cols + 1).join("──") + "┐", bottom = "└" + new Array(cols + 1).join("──") + "┘";
      var lines = [top];
      for (var y = 0; y < ROWS; y++) {
        var row = "│";
        for (var x = 0; x < cols; x++) {
          var c = [x, y];
          if (same(c, body[0])) row += '<span class="head">██</span>';
          else if (body.some(function (s) { return same(s, c); })) row += '<span class="seg">██</span>';
          else if (food && same(c, food)) row += '<span class="food">@</span>';
          else row += "  ";
        }
        lines.push(row + "│");
      }
      lines.push(bottom);
      board.innerHTML = lines.join("\n");
      var tail = "score " + score + " · best " + best;
      status.innerHTML = {
        ready: touch ? t("touchez pour jouer · glissez pour tourner", "tap to play · swipe to turn")
                     : t("espace ou entrée pour jouer · ←↑↓→ ou WASD · échap pour quitter", "space or enter to play · ←↑↓→ or WASD · esc to quit"),
        run: tail,
        pause: (touch ? t("pause · touchez pour reprendre", "paused · tap to resume") : t("pause · espace pour reprendre", "paused · space to resume")) + " · " + tail,
        over: '<span class="food">game over</span> · ' + tail + " · " + (touch ? t("touchez pour rejouer", "tap to play again") : t("espace pour rejouer", "space to play again"))
      }[state];
    }
    function tick() {
      if (queue.length) dir = queue.shift();
      var h = body[0], n = [h[0] + dir[0], h[1] + dir[1]];
      var eat = food && same(n, food);
      var hit = n[0] < 0 || n[0] >= cols || n[1] < 0 || n[1] >= ROWS ||
                body.slice(0, eat ? body.length : body.length - 1).some(function (s) { return same(s, n); });
      if (hit) { gameOver(); return; }
      body.unshift(n);
      if (eat) {
        score++; placeFood();
        if (!food) { gameOver(); return; }  // board full: you won
        schedule();
      } else body.pop();
      render();
    }
    function schedule() { clearInterval(timer); timer = setInterval(tick, Math.max(65, 130 - score * 3)); }
    function start() { reset(); state = "run"; schedule(); render(); }
    function gameOver() {
      clearInterval(timer); state = "over";
      if (score > best) { best = score; try { localStorage.setItem("snake-best", best); } catch (e) {} }
      render();
    }
    function turn(d) {
      var last = queue.length ? queue[queue.length - 1] : dir;
      if (d[0] === -last[0] && d[1] === -last[1]) return;  // no U-turn into yourself
      if (queue.length < 2) queue.push(d);
    }
    function toggle() {
      if (state === "run") { clearInterval(timer); state = "pause"; render(); }
      else if (state === "pause") { state = "run"; schedule(); render(); }
      else start();
    }
    var keys = { ArrowUp: [0, -1], w: [0, -1], W: [0, -1], ArrowDown: [0, 1], s: [0, 1], S: [0, 1],
                 ArrowLeft: [-1, 0], a: [-1, 0], A: [-1, 0], ArrowRight: [1, 0], d: [1, 0], D: [1, 0] };
    panel.addEventListener("keydown", function (e) {
      if (state === "idle") return;
      var d = keys[e.key];
      if (d) { e.preventDefault(); if (state !== "run") { if (state === "pause") toggle(); else start(); } turn(d); }
      else if (e.key === " " || e.key === "Enter") { e.preventDefault(); toggle(); }
      else if (e.key === "Escape") {
        e.preventDefault();
        var back = document.getElementById("tab-projet");
        selectTab(back); back.focus();
      }
    });
    panel.addEventListener("blur", function () { if (state === "run") toggle(); });
    // touch: tap to start or pause, swipe to turn (board has touch-action: none)
    var tx = 0, ty = 0;
    board.addEventListener("touchstart", function (e) { tx = e.touches[0].clientX; ty = e.touches[0].clientY; }, { passive: true });
    board.addEventListener("touchend", function (e) {
      if (state === "idle") return;
      var dx = e.changedTouches[0].clientX - tx, dy = e.changedTouches[0].clientY - ty;
      if (Math.max(Math.abs(dx), Math.abs(dy)) < 20) { toggle(); return; }
      if (state !== "run") start();
      turn(Math.abs(dx) > Math.abs(dy) ? [dx > 0 ? 1 : -1, 0] : [0, dy > 0 ? 1 : -1]);
    });
    addEventListener("resize", function () { if (state === "ready") { measure(); reset(); render(); } });

    return {
      ready: function () {
        clearInterval(timer); measure(); reset(); state = "ready"; render();
        panel.focus({ preventScroll: true });
      },
      stop: function () { clearInterval(timer); state = "idle"; },
      render: render
    };
  })();

})();
