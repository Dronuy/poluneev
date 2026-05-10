/* demo.js — orchestrator: sample case loading, viewer init, upload state
   machine. Depends on api.js, viewer.js, overlays.js (loaded before this).
*/
(function () {
  "use strict";

  const CASES = [
    { name: "case_normal",            label: "Normal",           comp: "Normal" },
    { name: "case_alta_confirmed",    label: "Severe Alta",      comp: "Severe" },
    { name: "case_anatomic_variant",  label: "Anatomic variant", comp: "Mild" },
    { name: "case_severe_dysplasia",  label: "Severe PFI",       comp: "Severe" },
    { name: "case_early_dysplasia",   label: "Early dysplasia",  comp: "Moderate" },
  ];

  // Globals consumed by viewer.js / overlays.js
  window.caseData = {};
  window.currentCase = null;
  window.sagSliceIdx = 0;
  window.axSliceIdx = 0;
  window.analyzed = false;
  window.activeAxJump = null;

  // ----------------------- Sample cases -----------------------
  // Monotonic counter — incremented on each selectCase() call. The async
  // body re-checks the token before mutating the viewer, so a slow-loading
  // case can't stomp a faster newer click (rapid-click race).
  let _selectionToken = 0;

  function init() {
    const casesDiv = document.getElementById("cases");
    CASES.forEach(function (c) {
      const div = document.createElement("div");
      div.className = "case-card";
      div.dataset.case = c.name;
      div.setAttribute("role", "listitem");
      div.innerHTML =
        '<div class="label">Case</div>' +
        '<div class="headline">' + c.label + '</div>' +
        '<span class="composite-badge comp-' + c.comp + '" style="font-size:11px;padding:3px 9px;">' + c.comp + '</span>';
      div.onclick = function () { selectCase(c.name); };
      casesDiv.appendChild(div);
    });
    selectCase(CASES[0].name);

    // Keyboard 1..5 jumps cases.
    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape") { window.closeModal(); return; }
      if (e.key >= "1" && e.key <= "5") {
        const idx = parseInt(e.key, 10) - 1;
        if (CASES[idx]) selectCase(CASES[idx].name);
      }
    });

    // Mouse-wheel scrub on viewers
    ["sag", "ax"].forEach(function (p) {
      const canvas = document.getElementById(p + "-canvas");
      canvas.addEventListener("wheel", function (e) {
        e.preventDefault();
        window.scrubSlice(p, e.deltaY > 0 ? +1 : -1);
      }, { passive: false });
    });

    initUpload();
  }

  async function selectCase(name) {
    const myToken = ++_selectionToken;

    window.currentCase = name;
    window.analyzed = false;
    window.activeAxJump = null;
    document.querySelectorAll(".case-card").forEach(function (c) {
      c.classList.toggle("active", c.dataset.case === name);
    });
    const r = document.getElementById("results");
    r.classList.remove("show");
    r.innerHTML = "";
    const btn = document.getElementById("analyze-btn");
    btn.classList.remove("analyzed");
    btn.textContent = "ANALYZE";
    btn.disabled = true;

    // Eagerly clear stale slice img + overlay so the wrong-case-flash
    // window is small even if loadCase awaits a slow network.
    document.getElementById("sag-img").removeAttribute("src");
    document.getElementById("ax-img").removeAttribute("src");
    document.getElementById("sag-svg").innerHTML = "";
    document.getElementById("ax-svg").innerHTML  = "";
    document.getElementById("ax-jumps").innerHTML = "";

    // Un-hide the slice scrubbers in case the previous view was a live
    // upload (renderLiveResult hides them).
    document.querySelectorAll("#sag-panel .viewer-scrubber, #ax-panel .viewer-scrubber")
      .forEach(function (el) { el.style.display = ""; });

    if (!window.caseData[name]) await loadCase(name);
    if (myToken !== _selectionToken) return;   // a newer click superseded us

    const data = window.caseData[name];
    window.sagSliceIdx = (data.overlays && data.overlays.sag && data.overlays.sag.best_slice_idx_0based) || 0;
    window.axSliceIdx  = (data.overlays && data.overlays.ax && data.overlays.ax.predicted_slices_0based && data.overlays.ax.predicted_slices_0based.meas) || 0;
    if (window.sagSliceIdx >= data.meta.sag.n_slices) window.sagSliceIdx = Math.floor(data.meta.sag.n_slices / 2);
    if (window.axSliceIdx >= data.meta.ax.n_slices)   window.axSliceIdx  = Math.floor(data.meta.ax.n_slices / 2);

    // AX jumps
    const jumpsBar = document.getElementById("ax-jumps");
    jumpsBar.innerHTML = "";
    const slices = data.overlays && data.overlays.ax && data.overlays.ax.predicted_slices_0based;
    if (slices) {
      const labels = { meas: "Meas", lti: "LTI", pcl: "PCL", patella: "Tilt", tt: "TT" };
      Object.entries(labels).forEach(function (entry) {
        const key = entry[0], lbl = entry[1];
        const idx = slices[key];
        if (idx === undefined || idx === null) return;
        const b = document.createElement("button");
        b.textContent = lbl;
        b.onclick = function () { window.jumpAxTo(key); };
        b.dataset.key = key;
        jumpsBar.appendChild(b);
      });
    }

    document.getElementById("sag-range").max = data.meta.sag.n_slices;
    document.getElementById("ax-range").max  = data.meta.ax.n_slices;
    window.setSlice("sag", window.sagSliceIdx + 1);
    window.setSlice("ax",  window.axSliceIdx + 1);
    document.getElementById("sag-best-marker").textContent = "(best slice " + (window.sagSliceIdx + 1) + ")";
    document.getElementById("ax-best-marker").textContent  = "";
    btn.disabled = false;
  }

  async function loadCase(name) {
    const meta     = await fetch("/assets/data/" + name + "/slice_metadata.json").then(function (r) { return r.json(); });
    const overlays = await fetch("/assets/data/" + name + "/overlays.json").then(function (r) { return r.json(); });
    const sagSlices = [], axSlices = [];
    for (let i = 1; i <= meta.sag.n_slices; i++) {
      const img = new Image();
      img.src = "/assets/img/" + name + "/sag/" + String(i).padStart(2, "0") + ".png";
      sagSlices.push(img);
    }
    for (let i = 1; i <= meta.ax.n_slices; i++) {
      const img = new Image();
      img.src = "/assets/img/" + name + "/ax/" + String(i).padStart(2, "0") + ".png";
      axSlices.push(img);
    }
    window.caseData[name] = { meta: meta, overlays: overlays, sagSlices: sagSlices, axSlices: axSlices };
  }

  // ----------------------- Analyze (sample case path) -----------------------
  function runAnalyze() {
    const data = window.caseData[window.currentCase]; if (!data) return;
    window.analyzed = true;
    window.drawSagOverlay();
    window.drawAxOverlay();
    window.PoluneevOverlays.showResults(data.overlays);
    const btn = document.getElementById("analyze-btn");
    btn.classList.add("analyzed");
    btn.textContent = "ANALYZED ✓ (re-click to re-draw)";
    document.getElementById("results").scrollIntoView({ behavior: "smooth", block: "start" });
  }
  window.runAnalyze = runAnalyze;

  // ----------------------- Upload state machine -----------------------
  let uploadAbort = null;

  function initUpload() {
    const zone       = document.getElementById("upload-zone");
    const fileZip    = document.getElementById("upload-file");      // ZIP picker
    const fileFolder = document.getElementById("upload-folder");    // webkitdirectory
    const pickZip    = document.getElementById("upload-pick-zip");
    const pickFolder = document.getElementById("upload-pick-folder");

    // Background click on the zone (not on a button) opens the folder picker
    // by default — folder upload is the most common use case.
    zone.addEventListener("click", function (e) {
      if (e.target.closest && e.target.closest(".upload-pickers")) return;
      fileFolder.click();
    });
    pickFolder.addEventListener("click", function (e) {
      e.stopPropagation();
      fileFolder.click();
    });
    pickZip.addEventListener("click", function (e) {
      e.stopPropagation();
      fileZip.click();
    });
    zone.addEventListener("keydown", function (e) {
      if (e.key === "Enter" || e.key === " ") { e.preventDefault(); fileFolder.click(); }
    });

    ["dragenter", "dragover"].forEach(function (ev) {
      zone.addEventListener(ev, function (e) {
        e.preventDefault(); e.stopPropagation();
        zone.classList.add("dragging");
      });
    });
    ["dragleave", "drop"].forEach(function (ev) {
      zone.addEventListener(ev, function (e) {
        e.preventDefault(); e.stopPropagation();
        zone.classList.remove("dragging");
      });
    });

    zone.addEventListener("drop", async function (e) {
      // Drop can carry plain Files (single ZIP, single .dcm) OR
      // DataTransferItems with directory entries (folder drag-drop).
      // Walk both paths to a uniform File[] before dispatching.
      const dt = e.dataTransfer;
      let files = [];
      try {
        if (dt && dt.items && dt.items.length) {
          showProgress("Scanning folder…");
          setProgressBar(0);
          setProgressMeta("");
          files = await collectFromDataTransferItems(dt.items);
        } else {
          files = Array.from(dt && dt.files || []);
        }
      } catch (err) {
        showError(err && err.message ? err.message : "Could not read drop.");
        return;
      }
      if (files.length) handleUpload(files);
    });
    function onPickerChange(input) {
      return function () {
        const files = Array.from(input.files || []);
        if (files.length) handleUpload(files);
        input.value = "";   // allow re-upload of same selection
      };
    }
    fileZip.addEventListener("change",    onPickerChange(fileZip));
    fileFolder.addEventListener("change", onPickerChange(fileFolder));
  }

  // ---- DataTransferItem walker ----------------------------------------
  // Recursively walk webkit FileSystemEntry tree, collecting File objects
  // tagged with a `webkitRelativePath`-equivalent so JSZip preserves the
  // folder structure. Filters to .dcm + extensionless (raw DICOM) at
  // collection time so we don't waste bandwidth zipping README.txt.
  function collectFromDataTransferItems(itemList) {
    const entries = [];
    for (let i = 0; i < itemList.length; i++) {
      const it = itemList[i];
      const e = it && (it.webkitGetAsEntry ? it.webkitGetAsEntry() : null);
      if (e) entries.push(e);
      else if (it && it.kind === "file" && it.getAsFile) {
        const f = it.getAsFile();
        if (f) entries.push({ __file: f });
      }
    }
    return walkEntries(entries);
  }
  async function walkEntries(entries) {
    const out = [];
    for (const entry of entries) {
      if (entry.__file) {
        out.push(entry.__file);
        continue;
      }
      if (entry.isFile) {
        const f = await new Promise(function (res, rej) {
          entry.file(function (file) {
            // Tag the path so the ZIP preserves folder structure even on
            // browsers without webkitRelativePath on dropped files.
            try {
              Object.defineProperty(file, "webkitRelativePath", {
                value: entry.fullPath ? entry.fullPath.replace(/^\//, "") : file.name,
              });
            } catch (_) { /* read-only on some browsers — JSZip will fall back to f.name */ }
            res(file);
          }, rej);
        });
        if (acceptDicomFile(f)) out.push(f);
      } else if (entry.isDirectory) {
        const children = await readAllEntries(entry.createReader());
        const sub = await walkEntries(children);
        out.push(...sub);
      }
    }
    return out;
  }
  function readAllEntries(reader) {
    // readEntries returns at most ~100 per call; loop until empty.
    return new Promise(function (resolve, reject) {
      const all = [];
      function pull() {
        reader.readEntries(function (batch) {
          if (!batch.length) return resolve(all);
          all.push(...batch);
          pull();
        }, reject);
      }
      pull();
    });
  }
  function acceptDicomFile(f) {
    if (!f) return false;
    const n = (f.name || "").toLowerCase();
    if (n.endsWith(".dcm") || n.endsWith(".dicom")) return true;
    if (n === "dicomdir") return true;
    // Single-file ZIP drop is allowed at the top.
    if (n.endsWith(".zip")) return true;
    // Extensionless files often ARE raw DICOM — accept if the upload
    // looks like a folder drop (multiple files) rather than a stray
    // single non-DICOM file. We can't read pixel headers cheaply
    // client-side; let backend's magic-byte filter reject non-DICOM.
    if (n.indexOf(".") < 0) return true;
    return false;
  }

  async function handleUpload(files) {
    hideUploadError();
    showProgress("Validating…");
    setProgressBar(0);
    setProgressMeta("Detected " + files.length + " file" + (files.length === 1 ? "" : "s"));

    // Pre-flight: count, size, min file count
    if (files.length === 0) {
      showError("No DICOM files found in this folder.");
      return;
    }
    if (files.length > 1000) {
      showError("Folder contains too many files (" + files.length +
                "; max 1000). Please upload a single MRI study.");
      return;
    }
    // Single-file ZIP path bypasses the 8-file minimum (the ZIP itself
    // probably contains a study).
    const zipDrop = files.length === 1 && /\.zip$/i.test(files[0].name);
    if (!zipDrop && files.length < 8) {
      showError("Folder has " + files.length + " file" +
                (files.length === 1 ? "" : "s") +
                " but a DICOM series usually has 8+ slices. " +
                "Please drop the full study folder.");
      return;
    }
    const totalBytes = files.reduce(function (s, f) { return s + f.size; }, 0);
    if (totalBytes > 500 * 1024 * 1024) {
      showError("Folder size exceeds 500 MB limit (" +
                Math.round(totalBytes / 1024 / 1024) + " MB).");
      return;
    }

    let blob, filename;
    try {
      const r = await window.PoluneevAPI.buildZipFromFiles(files);
      blob = r.blob; filename = r.filename;
    } catch (e) {
      showError(e.message || "Could not build ZIP from upload.");
      return;
    }

    showProgress("Uploading…");
    setProgressMeta(Math.round(blob.size / 1024 / 1024) + " MB");

    uploadAbort = new AbortController();
    let body;
    try {
      body = await window.PoluneevAPI.analyze({
        blob: blob,
        filename: filename,
        signal: uploadAbort.signal,
        onProgress: function (pct) {
          setProgressBar(pct);
          if (pct >= 99) showProgress("Analyzing…");
        },
      });
    } catch (e) {
      showError(e.message || "Analysis failed.");
      return;
    }

    showProgress("Analysis complete.");
    setProgressBar(100);
    setTimeout(hideProgress, 1500);

    renderLiveResult(body.result || {});
  }

  function renderLiveResult(liveResult) {
    // Build a synthetic "case" so we reuse the same viewer + result panel
    // path the sample cases use. Live uploads ship 4 measurement slice
    // PNGs (Phase 4-Slices.backend) but no scrollable series; we fan them
    // out so SAG has 1 slice + AX has 3 (LTI / Meas / PCL) reachable via
    // the existing AX jump buttons.
    const adapted = window.PoluneevOverlays.adaptLiveResult(liveResult);
    const slicesB64 = liveResult.measurement_slices_b64 || {};

    function dataUrl(b64) {
      return b64 ? ("data:image/png;base64," + b64) : "";
    }
    function makeImg(src) {
      const img = new Image();
      if (src) img.src = src;
      return img;
    }

    // SAG: single slot with the measurement slice (or empty placeholder).
    const sagSlices = [ makeImg(dataUrl(slicesB64.sag_measurement)) ];

    // AX: three slots in display order [LTI, Meas, PCL]. Empty slots
    // become blank placeholders; the jump buttons below filter to slots
    // that actually have a slice.
    const axOrder = [
      { key: "lti",  label: "LTI",  src: dataUrl(slicesB64.ax_lti)  },
      { key: "meas", label: "Meas", src: dataUrl(slicesB64.ax_meas) },
      { key: "pcl",  label: "PCL",  src: dataUrl(slicesB64.ax_pcl)  },
    ];
    const axSlices = axOrder.map(function (e) { return makeImg(e.src); });
    const defaultAxIdx = (function () {
      // Prefer Meas (most informative), then LTI, then PCL, then 0.
      for (const want of ["meas", "lti", "pcl"]) {
        const i = axOrder.findIndex(function (e) { return e.key === want && e.src; });
        if (i >= 0) return i;
      }
      return 0;
    })();

    window.caseData["__live_upload"] = {
      meta: {
        sag: { n_slices: sagSlices.length },
        ax:  { n_slices: axSlices.length  },
      },
      overlays: adapted,
      sagSlices: sagSlices,
      axSlices: axSlices,
      // Mark this case so viewer.js / scrub handlers can switch to
      // single-slice / fixed-views mode.
      _liveUpload: true,
      _axOrder: axOrder,
    };
    window.currentCase = "__live_upload";
    window.analyzed = false;   // we don't render landmark overlays for live uploads (Phase 5)
    window.activeAxJump = null;
    document.querySelectorAll(".case-card").forEach(function (c) { c.classList.remove("active"); });

    // Clear stale overlays + reset counters/markers.
    document.getElementById("sag-svg").innerHTML = "";
    document.getElementById("ax-svg").innerHTML  = "";
    document.getElementById("sag-best-marker").textContent = "";
    document.getElementById("ax-best-marker").textContent  = "";

    // Hide the slice scrubbers (they'd show "1 / 1" with nothing to scrub
    // through). Re-shown next time the user clicks a sample case.
    document.querySelectorAll("#sag-panel .viewer-scrubber, #ax-panel .viewer-scrubber")
      .forEach(function (el) { el.style.display = "none"; });

    // Set SAG image + label.
    document.getElementById("sag-range").max = sagSlices.length;
    document.getElementById("sag-range").value = 1;
    document.getElementById("sag-img").src = sagSlices[0].src || "";
    document.getElementById("sag-counter").textContent = "Measurement slice";

    // Build AX jump buttons — only for slots that actually have a slice.
    const jumpsBar = document.getElementById("ax-jumps");
    jumpsBar.innerHTML = "";
    axOrder.forEach(function (entry, i) {
      if (!entry.src) return;
      const b = document.createElement("button");
      b.textContent = entry.label;
      b.dataset.liveAxIdx = String(i);
      b.onclick = function () { setLiveAxSlice(i); };
      jumpsBar.appendChild(b);
    });
    setLiveAxSlice(defaultAxIdx);

    const btn = document.getElementById("analyze-btn");
    btn.disabled = true;
    btn.textContent = "Live result rendered ↓";
    btn.classList.add("analyzed");

    // Disclaimer banner above results
    const r = document.getElementById("results");
    const banner =
      '<div class="banner banner-info" style="margin-bottom:14px;">' +
      '<strong>Live upload.</strong> Measurement slices with AI annotations ' +
      'shown - each panel shows the slice the AI used and the landmarks it ' +
      'placed to compute the indices below. Sample cases include full ' +
      'series for browsing.' +
      '</div>';
    window.PoluneevOverlays.showResults(adapted);
    r.insertAdjacentHTML("afterbegin", banner);
    r.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function setLiveAxSlice(i) {
    const data = window.caseData["__live_upload"];
    if (!data || !data._liveUpload) return;
    const img = data.axSlices[i];
    if (!img || !img.src) return;
    document.getElementById("ax-img").src = img.src;
    document.getElementById("ax-svg").innerHTML = "";
    const label = (data._axOrder[i] && data._axOrder[i].label) || "";
    document.getElementById("ax-counter").textContent = label ? (label + " slice") : "-";
    document.querySelectorAll("#ax-jumps button").forEach(function (b) {
      b.classList.toggle("active", parseInt(b.dataset.liveAxIdx, 10) === i);
    });
  }

  // --- progress / error UI helpers ---
  function showProgress(label) {
    document.getElementById("upload-progress").classList.add("show");
    document.getElementById("upload-status").textContent = label;
  }
  function hideProgress() {
    document.getElementById("upload-progress").classList.remove("show");
  }
  function setProgressBar(pct) {
    document.getElementById("upload-fill").style.width = Math.min(100, Math.max(0, pct)) + "%";
  }
  function setProgressMeta(text) {
    document.getElementById("upload-meta").textContent = text;
  }
  function showError(msg) {
    hideProgress();
    const el = document.getElementById("upload-error");
    el.classList.add("show");
    document.getElementById("upload-error-text").textContent = msg;
    setTimeout(hideUploadError, 12000);
  }
  function hideUploadError() {
    document.getElementById("upload-error").classList.remove("show");
  }

  // ----------------------- Boot -----------------------
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
