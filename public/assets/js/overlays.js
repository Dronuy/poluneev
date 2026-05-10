/* overlays.js — result panel rendering for sample cases AND live uploads.
   Works on the pfi-engine v3 schema (sample case JSONs already in
   public/assets/data/) and on the backend's poluneev.v1 schema (live
   /analyze response). adaptLiveResult() converts live responses into the
   same shape so showResults() has one code path.
*/
(function () {
  "use strict";
  const PHENOTYPE_REC = {
    "Normal":   "No PFI features identified. No specific imaging follow-up indicated.",
    "Mild":     "Single-domain finding. Clinical correlation suggested.",
    "Moderate": "Multiple PFI features. MSK or sports-medicine consult suggested if symptomatic.",
    "Severe":   "Severe PFI features across multiple domains. MSK fellowship referral and surgical workup consideration.",
  };
  const fmt = window.PoluneevViewer.fmt;

  function verdictCls(v) {
    if (!v || v === "Normal" || v === "normal") return "v-normal";
    if (v === "Borderline" || (typeof v === "string" && v.indexOf("Borderline") >= 0)) return "v-borderline";
    return "v-abnormal";
  }
  function panelHtml(title, vText, vCls, body) {
    const inner = Array.isArray(body) ? body.join("") : body;
    return '<div class="domain-panel expanded">' +
      '<div class="domain-header">' +
        '<h3>' + title + '</h3>' +
        '<div class="right">' +
          '<span class="domain-verdict ' + vCls + '">' + vText + '</span>' +
          '<span class="chevron">&#x25BE;</span>' +
        '</div>' +
      '</div>' +
      '<div class="domain-body">' + inner + '</div>' +
    '</div>';
  }
  function idxRow(name, value, unit, verdict, ref) {
    const dec = (typeof value === "number" && Math.abs(value) < 1) ? 3 : 2;
    return '<div class="idx-card">' +
      '<div>' +
        '<div class="name">' + name + '</div>' +
        '<div class="ref">' + (ref || "") + '</div>' +
      '</div>' +
      '<div class="right">' +
        '<span class="value">' + fmt(value, dec) + (unit || "") + '</span>' +
        '<span class="verdict ' + verdictCls(verdict) + '">' + (verdict || "—") + '</span>' +
      '</div>' +
    '</div>';
  }

  // ---------- Render result panel ----------
  function showResults(overlays) {
    // overlays is the pfi-engine v3 schema (sample case) — see
    // adaptLiveResult below for live responses.
    const comp = overlays.composite_phenotype || "Normal";
    const rec  = PHENOTYPE_REC[comp] || overlays.recommendation || "";
    const sag  = overlays.sag || {}; const ax = overlays.ax || {};
    const sagInd = sag.indices || {}; const axInd = ax.indices || {};

    let html = '<div class="composite-card">' +
      '<div>' +
        '<div class="composite-headline">Composite phenotype</div>' +
        '<span class="composite-badge comp-' + comp + '">' + comp + '</span>' +
      '</div>' +
      '<div class="composite-rec">' + rec + '</div>' +
    '</div>';

    // Domain A — Patellar Height
    const phPositive =
      (sagInd.IS && (sagInd.IS.category === "Alta" || sagInd.IS.category === "Baja")) ||
      (sagInd.CDI && (sagInd.CDI.category === "Alta" || sagInd.CDI.category === "Baja")) ||
      (sagInd.PTI && (sagInd.PTI.category === "Alta" || sagInd.PTI.category === "Baja"));
    const phVerdict = phPositive ? ["alta/baja", "v-abnormal"] : ["Normal", "v-normal"];
    html += panelHtml("A — Patellar Height", phVerdict[0], phVerdict[1], [
      idxRow("Insall-Salvati (IS)", sagInd.IS && sagInd.IS.value, "", sagInd.IS && sagInd.IS.category, "Insall 1971 / Miller 1996 / Shabshin 2004"),
      idxRow("Caton-Deschamps (CDI)", sagInd.CDI && sagInd.CDI.value, "", sagInd.CDI && sagInd.CDI.category, "Caton 1982"),
      idxRow("Patellotrochlear (PTI)", sagInd.PTI && sagInd.PTI.value, "", sagInd.PTI && sagInd.PTI.category, "Biedert 2006"),
    ]);

    // Domain B — Trochlear Morphology
    let n = 0;
    if (axInd.Cart_LTI && axInd.Cart_LTI.verdict === "Abnormal") n++;
    if (axInd.Cart_SA  && axInd.Cart_SA.verdict  === "Abnormal") n++;
    if (axInd.Cart_TD  && axInd.Cart_TD.verdict  === "Abnormal") n++;
    if (axInd.Bone_TFA && axInd.Bone_TFA.verdict === "Abnormal") n++;
    const grade =
      n === 0 ? ["No dysplasia", "v-normal"] :
      n === 1 ? ["Low grade",     "v-borderline"] :
      n <= 3  ? ["Moderate",      "v-borderline"] :
                ["High grade",    "v-abnormal"];
    html += panelHtml("B — Trochlear Morphology", grade[0], grade[1], [
      '<div style="font-size:10px;color:var(--d-text2);margin:6px 0 4px;font-weight:600;">Cart screening (Tanaka 2023)</div>',
      idxRow("Cart Sulcus Angle",         axInd.Cart_SA  && axInd.Cart_SA.value,  "°",     axInd.Cart_SA  && axInd.Cart_SA.verdict,  axInd.Cart_SA  && axInd.Cart_SA.reference),
      idxRow("Cart LTI",                  axInd.Cart_LTI && axInd.Cart_LTI.value, "°",     axInd.Cart_LTI && axInd.Cart_LTI.verdict, axInd.Cart_LTI && axInd.Cart_LTI.reference),
      idxRow("Cart Trochlear Depth (TD)", axInd.Cart_TD  && axInd.Cart_TD.value,  " mm",   axInd.Cart_TD  && axInd.Cart_TD.verdict,  axInd.Cart_TD  && axInd.Cart_TD.reference),
      '<div style="font-size:10px;color:var(--d-text2);margin:10px 0 4px;font-weight:600;">Bone corroboration (Pfirrmann / Carrillon)</div>',
      idxRow("Bone Sulcus Angle",         axInd.Bone_SA  && axInd.Bone_SA.value,  "°",     axInd.Bone_SA  && axInd.Bone_SA.verdict,  axInd.Bone_SA  && axInd.Bone_SA.reference),
      idxRow("Bone LTI",                  axInd.Bone_LTI && axInd.Bone_LTI.value, "°",     axInd.Bone_LTI && axInd.Bone_LTI.verdict, axInd.Bone_LTI && axInd.Bone_LTI.reference),
      idxRow("Bone Trochlear Depth",      axInd.Bone_TD  && axInd.Bone_TD.value,  " mm",   axInd.Bone_TD  && axInd.Bone_TD.verdict,  axInd.Bone_TD  && axInd.Bone_TD.reference),
      idxRow("Bone Trochlear Facet Asym", axInd.Bone_TFA && axInd.Bone_TFA.value, " ratio",axInd.Bone_TFA && axInd.Bone_TFA.verdict, axInd.Bone_TFA && axInd.Bone_TFA.reference),
    ]);

    // Domain C — Lateralization
    const lat = axInd.PT_TG_cart;
    html += panelHtml("C — Lateralization", (lat && lat.verdict) || "Normal", verdictCls(lat && lat.verdict), [
      idxRow("Patellar Tendon - Trochlear Groove", lat && lat.value, " mm", lat && lat.verdict, "Hinckel 2015"),
    ]);

    // Domain D — Patellar Tilt
    const tilt = axInd.Patellar_Tilt;
    html += panelHtml("D — Patellar Tilt", (tilt && tilt.verdict) || "Normal", verdictCls(tilt && tilt.verdict), [
      idxRow("Patellar Tilt", tilt && tilt.value, "°", tilt && tilt.verdict, "Sallay 1996"),
    ]);

    if (overlays.discordance_flags && overlays.discordance_flags.length) {
      html += '<div class="flags-section"><h3>📌 Discordance flags</h3>';
      overlays.discordance_flags.forEach(function (f) {
        html += '<div class="flag-card"><div class="flag-title">' + f.title + '</div>' +
                '<div class="flag-text">' + f.text + '</div></div>';
      });
      html += '</div>';
    }

    const intern = ax.internal || {};
    if (intern.Cart_TFA || intern.sPT_TG_cart) {
      html += '<div class="internal-section">' +
        '<h3>Internal verification (supplementary)</h3>' +
        '<div class="label">Computed for internal consistency only — not primary screening output.</div>';
      if (intern.Cart_TFA && intern.Cart_TFA.value != null) {
        html += '<div class="internal-row"><span class="iname">Cart-TFA (cart-bone consistency check)</span>' +
                '<span class="ival">' + fmt(intern.Cart_TFA.value, 3) + '</span></div>';
      }
      if (intern.sPT_TG_cart && intern.sPT_TG_cart.value != null) {
        html += '<div class="internal-row"><span class="iname">Signed PT-TG (AP-axis check)</span>' +
                '<span class="ival">' + fmt(intern.sPT_TG_cart.value, 2) + ' mm</span></div>';
      }
      html += '</div>';
    }

    html += '<button id="report-btn" onclick="generateReport()">Generate text report</button>';

    const r = document.getElementById("results");
    r.innerHTML = html;
    r.classList.add("show");
    document.querySelectorAll(".domain-header").forEach(function (h) {
      h.onclick = function () { h.parentElement.classList.toggle("expanded"); };
    });
  }

  // ---------- Adapter: live /analyze response (poluneev.v1) -> overlays shape ----------
  function adaptLiveResult(liveResult) {
    // Live response: result.indices_per_domain.{domain_a,b,c,d} of arrays.
    // Build a sag/ax indices structure compatible with showResults.
    const ipd = liveResult.indices_per_domain || {};
    const a = ipd.domain_a || [];
    const b = ipd.domain_b || [];
    const c = ipd.domain_c || [];
    const d = ipd.domain_d || [];
    function get(arr, name) { return arr.find(function (x) { return x.name === name; }); }
    function val(x) { return x && x.value; }
    function ver(x) { return x && (x.verdict === "abnormal" ? "Abnormal" : x.verdict === "normal" ? "Normal" : x.verdict); }
    function cat(x) { return x && (x.category || (x.verdict === "abnormal" ? "Abnormal" : x.verdict === "normal" ? "Normal" : x.verdict)); }
    function ref(x) { return x && x.literature_reference; }

    const sagInd = {
      IS:  get(a, "IS")  ? { value: val(get(a, "IS")),  category: cat(get(a, "IS"))  } : null,
      CDI: get(a, "CDI") ? { value: val(get(a, "CDI")), category: cat(get(a, "CDI")) } : null,
      PTI: get(a, "PTI") ? { value: val(get(a, "PTI")), category: cat(get(a, "PTI")) } : null,
    };
    const axInd = {};
    ["Cart_SA", "Cart_LTI", "Cart_TD", "Bone_SA", "Bone_LTI", "Bone_TD", "Bone_TFA"].forEach(function (n) {
      const x = get(b, n);
      if (x) axInd[n] = { value: val(x), verdict: ver(x), reference: ref(x) };
    });
    const ptg = get(c, "PT_TG_cart");
    if (ptg) axInd.PT_TG_cart = { value: val(ptg), verdict: ver(ptg) };
    const tilt = get(d, "Patellar_Tilt");
    if (tilt) axInd.Patellar_Tilt = { value: val(tilt), verdict: ver(tilt) };

    const grade = (liveResult.phenotype_summary && liveResult.phenotype_summary.composite_grade) || "normal";
    const compMap = { normal: "Normal", mild: "Mild", moderate: "Moderate", severe: "Severe" };
    const composite = compMap[grade] || "Normal";
    const flags = (liveResult.discordance_flags || []).map(function (f) {
      return { title: f.flag, text: f.message };
    });

    return {
      sag: { indices: sagInd },
      ax:  { indices: axInd, internal: {} },  // overlays not rendered for live uploads in v1
      composite_phenotype: composite,
      discordance_flags: flags,
      headline: composite,
      recommendation: PHENOTYPE_REC[composite] || "",
      summary: "Live upload analysis complete.",
    };
  }

  // ---------- Text report (modal) ----------
  function generateReport() {
    const data = window.caseData[window.currentCase]; if (!data) return;
    const ovl = data.overlays;
    const lines = [];
    lines.push("PATELLOFEMORAL INSTABILITY ASSESSMENT (automated)");
    lines.push("");
    lines.push("Case      : " + (ovl.headline || ""));
    lines.push("Composite : " + (ovl.composite_phenotype || ""));
    lines.push("");
    lines.push("PATELLAR HEIGHT (SAG)");
    ["IS", "CDI", "PTI"].forEach(function (k) {
      const i = ovl.sag && ovl.sag.indices && ovl.sag.indices[k]; if (!i) return;
      lines.push("  " + k.padEnd(4) + " " + fmt(i.value, 3) + "  (" + i.category + ")");
    });
    lines.push("");
    lines.push("TROCHLEAR MORPHOLOGY (AX)");
    lines.push("  Cart (Tanaka 2023):");
    ["Cart_SA", "Cart_LTI", "Cart_TD"].forEach(function (k) {
      const i = ovl.ax && ovl.ax.indices && ovl.ax.indices[k]; if (!i) return;
      lines.push("    " + k.padEnd(10) + " " + fmt(i.value, 2) + " (" + i.verdict + ")");
    });
    lines.push("  Bone (Pfirrmann/Carrillon):");
    ["Bone_SA", "Bone_LTI", "Bone_TD", "Bone_TFA"].forEach(function (k) {
      const i = ovl.ax && ovl.ax.indices && ovl.ax.indices[k]; if (!i) return;
      lines.push("    " + k.padEnd(10) + " " + fmt(i.value, 2) + " (" + i.verdict + ")");
    });
    lines.push("");
    const lat = ovl.ax && ovl.ax.indices && ovl.ax.indices.PT_TG_cart;
    if (lat) lines.push("LATERALIZATION (Hinckel 2015)\n  PT-TG = " + fmt(lat.value, 1) + " mm (" + lat.verdict + ")\n");
    const tilt = ovl.ax && ovl.ax.indices && ovl.ax.indices.Patellar_Tilt;
    if (tilt) lines.push("PATELLAR TILT (Sallay 1996)\n  " + fmt(tilt.value, 1) + "° (" + tilt.verdict + ")\n");
    if (ovl.discordance_flags && ovl.discordance_flags.length) {
      lines.push("FLAGS:");
      ovl.discordance_flags.forEach(function (f) { lines.push("  - " + f.title + "\n    " + f.text); });
      lines.push("");
    }
    lines.push("RECOMMENDATION: " + (ovl.recommendation || PHENOTYPE_REC[ovl.composite_phenotype] || ""));
    lines.push("");
    lines.push("---");
    lines.push("FOR RESEARCH USE ONLY. Pre-publication prototype.");
    document.getElementById("report-text").textContent = lines.join("\n");
    document.getElementById("modal-bg").classList.add("show");
  }
  function closeModal(e) {
    if (e && e.target.id !== "modal-bg" && e.type === "click") return;
    document.getElementById("modal-bg").classList.remove("show");
  }
  function copyReport() {
    navigator.clipboard.writeText(document.getElementById("report-text").textContent).then(function () {
      const b = document.getElementById("copy-btn");
      b.classList.add("copied"); b.textContent = "Copied!";
      setTimeout(function () { b.classList.remove("copied"); b.textContent = "Copy to clipboard"; }, 1500);
    });
  }

  window.PoluneevOverlays = {
    showResults: showResults,
    adaptLiveResult: adaptLiveResult,
    generateReport: generateReport,
    closeModal: closeModal,
    copyReport: copyReport,
  };
  window.showResults = showResults;
  window.generateReport = generateReport;
  window.closeModal = closeModal;
  window.copyReport = copyReport;
})();
