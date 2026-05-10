/* api.js — backend communication for live DICOM uploads.
   Talks to https://api.poluneev.com (production) or
   http://localhost:8000 (local dev when host == localhost). */
(function () {
  "use strict";

  const isLocal =
    location.hostname === "localhost" || location.hostname === "127.0.0.1";

  // Production: api.poluneev.com (after Phase 4.4 tunnel split).
  // Pre-cutover: backend currently lives at the apex poluneev.com /healthz —
  // detect by trying api.poluneev.com first and falling back if needed.
  // For static deploy we just hard-code; the env that hits this code on
  // staging.poluneev.com / poluneev.com always reaches api.poluneev.com.
  const API_BASE = isLocal ? "http://localhost:8000" : "https://api.poluneev.com";

  /* Health probe — returns parsed JSON or throws. */
  async function health() {
    const r = await fetch(API_BASE + "/healthz", { method: "GET" });
    if (!r.ok) throw new Error("backend " + r.status);
    return r.json();
  }

  /* Fetch a pre-computed sample case's sanitized JSON from the backend.
     Useful when the sample case JSONs in /assets/data/ are deliberately
     served via the backend so live + sample share one schema. */
  async function fetchSample(label) {
    const r = await fetch(API_BASE + "/sample-cases/" + encodeURIComponent(label));
    if (!r.ok) throw new Error("sample-cases " + r.status);
    return r.json();
  }

  /* POST a ZIP blob to /analyze with progress reporting.

     Options:
       blob       — the ZIP to upload (Blob or File)
       filename   — display name in multipart
       onProgress — function(pct: 0..100, loaded, total)
       signal     — AbortSignal
       study_id   — optional cohort id (smoke / cohort validation only)

     Returns the parsed JSON body of /analyze. Throws Error on
     network / non-2xx. */
  function analyze(opts) {
    const blob = opts.blob;
    const filename = opts.filename || "study.zip";
    const onProgress = opts.onProgress || function () {};
    const signal = opts.signal || null;
    const studyId = opts.study_id || null;

    return new Promise(function (resolve, reject) {
      const fd = new FormData();
      fd.append("file", blob, filename);

      const xhr = new XMLHttpRequest();
      const url = API_BASE + "/analyze" +
        (studyId ? "?study_id=" + encodeURIComponent(studyId) : "");
      xhr.open("POST", url, true);
      xhr.timeout = 180000;  // 3 min — pipeline cold + upload + headroom

      xhr.upload.addEventListener("progress", function (e) {
        if (!e.lengthComputable) return;
        const pct = (e.loaded / e.total) * 100;
        onProgress(pct, e.loaded, e.total);
      });
      xhr.addEventListener("load", function () {
        if (xhr.status === 0) {
          reject(new Error("Network error"));
          return;
        }
        let body;
        try { body = JSON.parse(xhr.responseText); }
        catch (e) { reject(new Error("Invalid JSON from backend")); return; }
        if (xhr.status === 429) {
          reject(new Error("Rate limit exceeded. " + (body.note || "Try again later.")));
          return;
        }
        if (xhr.status === 413) {
          reject(new Error("Upload too large (max 500 MB)."));
          return;
        }
        if (xhr.status >= 400) {
          reject(new Error(body.reason || ("Backend error " + xhr.status)));
          return;
        }
        if (!body.success) {
          reject(new Error(body.reason || "Analysis failed."));
          return;
        }
        resolve(body);
      });
      xhr.addEventListener("error", function () {
        reject(new Error("Network error reaching backend."));
      });
      xhr.addEventListener("timeout", function () {
        reject(new Error("Request timed out after 3 minutes."));
      });
      if (signal) {
        signal.addEventListener("abort", function () { xhr.abort(); });
      }
      xhr.send(fd);
    });
  }

  /* Build a ZIP from a list of File entries (drag-drop folder).

     Uses JSZip from CDN. If the user dropped a single .zip it's returned
     as-is. */
  async function buildZipFromFiles(files) {
    if (files.length === 1 && /\.zip$/i.test(files[0].name)) {
      return { blob: files[0], filename: files[0].name };
    }
    if (typeof JSZip === "undefined") {
      throw new Error("JSZip failed to load (offline?). Drop a .zip instead.");
    }
    const zip = new JSZip();
    for (const f of files) {
      // webkitRelativePath preserves folder structure when dragging a dir;
      // otherwise fall back to f.name.
      const arc = f.webkitRelativePath || f.name;
      zip.file(arc, f);
    }
    const blob = await zip.generateAsync({ type: "blob", compression: "DEFLATE", compressionOptions: { level: 6 } });
    return { blob: blob, filename: "study.zip" };
  }

  // Expose
  window.PoluneevAPI = {
    BASE: API_BASE,
    health: health,
    fetchSample: fetchSample,
    analyze: analyze,
    buildZipFromFiles: buildZipFromFiles,
  };
})();
