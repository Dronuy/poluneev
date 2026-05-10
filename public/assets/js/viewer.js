/* viewer.js — slice loading + scrubbing + SVG overlay drawing.
   Ported from pfi-engine/index.html inline JS, minor adjustments to use
   /assets/img/<case>/sag,ax/*.png paths.

   Globals it uses (set by demo.js):
     window.caseData     - { case_name: { meta, overlays, sagSlices, axSlices } }
     window.currentCase  - string
     window.sagSliceIdx  - 0-based current SAG slice
     window.axSliceIdx   - 0-based current AX slice
     window.analyzed     - boolean
     window.activeAxJump - 'meas' | 'lti' | 'pcl' | 'patella' | 'tt' | null
*/
(function () {
  "use strict";
  const SVG_NS = "http://www.w3.org/2000/svg";

  // ---------- Slice scrubbing ----------
  function setSlice(panel, oneBasedIdx) {
    const data = window.caseData[window.currentCase];
    if (!data) return;
    const total = panel === "sag" ? data.meta.sag.n_slices : data.meta.ax.n_slices;
    let i = parseInt(oneBasedIdx, 10);
    if (isNaN(i)) i = 1;
    if (i < 1) i = 1;
    if (i > total) i = total;
    if (panel === "sag") window.sagSliceIdx = i - 1;
    else window.axSliceIdx = i - 1;

    document.getElementById(panel + "-img").src =
      (panel === "sag" ? data.sagSlices : data.axSlices)[i - 1].src;
    document.getElementById(panel + "-counter").textContent = i + " / " + total;
    document.getElementById(panel + "-idx").textContent = "slice " + i + " / " + total;
    document.getElementById(panel + "-range").value = i;

    if (window.analyzed) {
      panel === "sag" ? drawSagOverlay() : drawAxOverlay();
    } else {
      document.getElementById(panel + "-svg").innerHTML = "";
    }
    if (panel === "ax") updateAxJumpsActiveState();
  }

  function scrubSlice(panel, delta) {
    const cur = parseInt(document.getElementById(panel + "-range").value, 10);
    setSlice(panel, cur + delta);
  }

  function jumpAxTo(key) {
    const data = window.caseData[window.currentCase];
    if (!data) return;
    const idx = data.overlays && data.overlays.ax &&
      data.overlays.ax.predicted_slices_0based &&
      data.overlays.ax.predicted_slices_0based[key];
    if (idx === undefined || idx === null) return;
    window.activeAxJump = key;
    setSlice("ax", idx + 1);
  }

  function updateAxJumpsActiveState() {
    const data = window.caseData[window.currentCase];
    if (!data) return;
    const slices = (data.overlays && data.overlays.ax &&
                    data.overlays.ax.predicted_slices_0based) || {};
    const cur = window.axSliceIdx;
    document.querySelectorAll("#ax-jumps button").forEach(function (b) {
      b.classList.toggle("active", slices[b.dataset.key] === cur);
    });
  }

  // ---------- SVG primitives ----------
  function drawLine(svg, p1, p2, stroke, width, dashed) {
    if (!p1 || !p2) return;
    width = width || 2;
    const ln = document.createElementNS(SVG_NS, "line");
    ln.setAttribute("x1", p1[0]); ln.setAttribute("y1", p1[1]);
    ln.setAttribute("x2", p2[0]); ln.setAttribute("y2", p2[1]);
    ln.setAttribute("stroke", stroke);
    ln.setAttribute("stroke-width", width);
    ln.setAttribute("stroke-linecap", "round");
    if (dashed) ln.setAttribute("stroke-dasharray", "6 4");
    svg.appendChild(ln);
  }
  function drawDot(svg, p, fill, r) {
    if (!p) return;
    r = r || 4;
    const c = document.createElementNS(SVG_NS, "circle");
    c.setAttribute("cx", p[0]); c.setAttribute("cy", p[1]); c.setAttribute("r", r);
    c.setAttribute("fill", fill);
    c.setAttribute("stroke", "#fff");
    c.setAttribute("stroke-width", "0.8");
    svg.appendChild(c);
  }
  function drawTextLabel(svg, anchor, dx, dy, text, color) {
    if (!anchor) return;
    const tx = anchor[0] + dx, ty = anchor[1] + dy;
    const padX = 4, padY = 2, fontSize = 11;
    const w = text.length * 5.6 + padX * 2;
    const rect = document.createElementNS(SVG_NS, "rect");
    rect.setAttribute("x", tx); rect.setAttribute("y", ty - fontSize - 1);
    rect.setAttribute("width", w); rect.setAttribute("height", fontSize + padY * 2);
    rect.setAttribute("fill", "rgba(0,0,0,0.6)");
    rect.setAttribute("rx", "2");
    svg.appendChild(rect);
    const t = document.createElementNS(SVG_NS, "text");
    t.setAttribute("x", tx + padX); t.setAttribute("y", ty + 2);
    t.setAttribute("fill", color || "#fff");
    t.setAttribute("font-size", fontSize);
    t.setAttribute("font-family", "system-ui, sans-serif");
    t.setAttribute("font-weight", "600");
    t.textContent = text;
    svg.appendChild(t);
  }
  function textEl(x, y, text, color, size) {
    color = color || "#fff"; size = size || 12;
    const t = document.createElementNS(SVG_NS, "text");
    t.setAttribute("x", x); t.setAttribute("y", y);
    t.setAttribute("fill", color); t.setAttribute("font-size", size);
    t.setAttribute("font-family", "system-ui, sans-serif");
    t.textContent = text;
    return t;
  }
  function verdictHex(v) {
    if (!v) return "#fff";
    if (v === "Normal") return "#4CAF50";
    if (v === "Borderline" || (typeof v === "string" && v.indexOf("Borderline") >= 0)) return "#FFC107";
    return "#F44336";
  }
  function fmt(v, dec) {
    if (v === null || v === undefined) return "-";
    return typeof v === "number" ? v.toFixed(dec == null ? 2 : dec) : String(v);
  }

  // ---------- SAG overlay ----------
  function drawSagOverlay() {
    const data = window.caseData[window.currentCase]; if (!data) return;
    const svg = document.getElementById("sag-svg");
    svg.innerHTML = "";
    const sag = data.overlays && data.overlays.sag;
    if (!sag) return;
    const onBest = window.sagSliceIdx === sag.best_slice_idx_0based;
    if (!onBest) {
      svg.appendChild(textEl(20, 30,
        "IS / CDI / PTI computed at best slice - scroll to highlighted slice",
        "#FFD700", 12));
      return;
    }
    const lm = sag.landmarks_512px || {};
    const ind = sag.indices || {};
    drawLine(svg, lm["is_patella_top"], lm["is_patella_bottom"], "var(--ovly-cyan)");
    drawLine(svg, lm["is_patella_bottom"], lm["is_tibial_tuberosity"], "var(--ovly-yellow)");
    drawDot(svg, lm["is_patella_top"], "var(--ovly-cyan)");
    drawDot(svg, lm["is_patella_bottom"], "var(--ovly-cyan)");
    drawDot(svg, lm["is_tibial_tuberosity"], "var(--ovly-yellow)");
    drawTextLabel(svg, lm["is_patella_top"], 8, -8,
      "IS = " + fmt(ind.IS && ind.IS.value, 3) + " " + (ind.IS && ind.IS.category || ""),
      verdictHex(ind.IS && ind.IS.category));

    drawLine(svg, lm["cd_cd_cartilage_top"], lm["cd_cd_cartilage_bottom"], "var(--ovly-cyan)");
    drawLine(svg, lm["cd_cd_cartilage_bottom"], lm["cd_cd_tibial_plateau"], "var(--ovly-yellow)");
    drawDot(svg, lm["cd_cd_cartilage_top"], "var(--ovly-cyan)", 2.5);
    drawDot(svg, lm["cd_cd_cartilage_bottom"], "var(--ovly-cyan)", 2.5);
    drawDot(svg, lm["cd_cd_tibial_plateau"], "var(--ovly-yellow)");
    drawTextLabel(svg, lm["cd_cd_cartilage_bottom"], 8, 14,
      "CDI = " + fmt(ind.CDI && ind.CDI.value, 3) + " " + (ind.CDI && ind.CDI.category || ""),
      verdictHex(ind.CDI && ind.CDI.category));

    drawLine(svg, lm["pti_pti_pc_top"], lm["pti_pti_pc_bot"], "var(--ovly-cyan)", 1.5);
    drawDot(svg, lm["pti_pti_pc_top"], "var(--ovly-cyan)");
    drawDot(svg, lm["pti_pti_pc_bot"], "var(--ovly-cyan)");
    drawLine(svg, lm["pti_pti_tc_top"], lm["pti_pti_tc_bot"], "var(--ovly-yellow)", 1.5);
    drawDot(svg, lm["pti_pti_tc_top"], "var(--ovly-yellow)");
    drawDot(svg, lm["pti_pti_tc_bot"], "var(--ovly-yellow)");
    drawTextLabel(svg, lm["pti_pti_tc_bot"], 8, 14,
      "PTI = " + fmt(ind.PTI && ind.PTI.value, 3) + " " + (ind.PTI && ind.PTI.category || ""),
      verdictHex(ind.PTI && ind.PTI.category));
  }

  // ---------- AX overlay ----------
  function drawAxOverlay() {
    const data = window.caseData[window.currentCase]; if (!data) return;
    const svg = document.getElementById("ax-svg");
    svg.innerHTML = "";
    const ax = data.overlays && data.overlays.ax; if (!ax) return;
    const slices = ax.predicted_slices_0based || {};
    const cur = window.axSliceIdx;
    const pcl = ax.pcl_landmarks_512px || {};

    // PCL slice
    if (cur === slices.pcl) {
      drawLine(svg, pcl["PCL_med"], pcl["PCL_lat"], "var(--ovly-white)", 1.5);
      drawDot(svg, pcl["PCL_med"], "var(--ovly-white)");
      drawDot(svg, pcl["PCL_lat"], "var(--ovly-white)");
      drawTextLabel(svg, pcl["PCL_med"], -10, -8, "PCL line (reference)", "#FFFFFF");
    }

    // LTI slice
    if (cur === slices.lti) {
      const ltil = ax.lti_landmarks_512px || {};
      if (ltil.LTI_prox && ltil.LTI_dist) {
        drawLine(svg, ltil.LTI_prox, ltil.LTI_dist, "var(--ovly-cyan)", 2);
        drawDot(svg, ltil.LTI_prox, "var(--ovly-cyan)");
        drawDot(svg, ltil.LTI_dist, "var(--ovly-cyan)");
      }
      if (ltil.LTI_prox_bone && ltil.LTI_dist_bone) {
        drawLine(svg, ltil.LTI_prox_bone, ltil.LTI_dist_bone, "var(--ovly-orange)", 2, true);
        drawDot(svg, ltil.LTI_prox_bone, "var(--ovly-orange)");
        drawDot(svg, ltil.LTI_dist_bone, "var(--ovly-orange)");
      }
      if (pcl.PCL_med && pcl.PCL_lat) {
        drawLine(svg, pcl.PCL_med, pcl.PCL_lat, "var(--ovly-white)", 1, true);
      }
      const lti  = ax.indices && ax.indices.Cart_LTI;
      const blti = ax.indices && ax.indices.Bone_LTI;
      if (ltil.LTI_dist) drawTextLabel(svg, ltil.LTI_dist, 8, -10,
        "Cart LTI = " + fmt(lti && lti.value, 1) + "° " + (lti && lti.verdict || ""),
        verdictHex(lti && lti.verdict));
      if (ltil.LTI_dist_bone) drawTextLabel(svg, ltil.LTI_dist_bone, 8, 18,
        "Bone LTI = " + fmt(blti && blti.value, 1) + "° " + (blti && blti.verdict || ""),
        verdictHex(blti && blti.verdict));
    }

    // Meas slice (cart + bone SA / TD / TFA)
    if (cur === slices.meas) {
      const meas = ax.meas_landmarks_512px || {};
      if (meas.Med_facet && meas.Sulcus && meas.Lat_facet) {
        drawLine(svg, meas.Med_facet, meas.Sulcus,    "var(--ovly-cyan)", 2);
        drawLine(svg, meas.Sulcus,    meas.Lat_facet, "var(--ovly-red)",  2);
        drawLine(svg, meas.Med_facet, meas.Lat_facet, "var(--ovly-green)", 1, true);
        drawDot(svg, meas.Med_facet, "var(--ovly-cyan)");
        drawDot(svg, meas.Sulcus,    "var(--ovly-green)");
        drawDot(svg, meas.Lat_facet, "var(--ovly-red)");
      }
      if (meas.Med_bone && meas.Sulcus_bone && meas.Lat_bone) {
        drawLine(svg, meas.Med_bone,    meas.Sulcus_bone, "var(--ovly-orange)", 1.5, true);
        drawLine(svg, meas.Sulcus_bone, meas.Lat_bone,    "var(--ovly-orange)", 1.5, true);
        drawDot(svg, meas.Med_bone,    "var(--ovly-orange)");
        drawDot(svg, meas.Sulcus_bone, "var(--ovly-orange)");
        drawDot(svg, meas.Lat_bone,    "var(--ovly-orange)");
      }
      const csa  = ax.indices && ax.indices.Cart_SA;
      const ctd  = ax.indices && ax.indices.Cart_TD;
      const btfa = ax.indices && ax.indices.Bone_TFA;
      if (meas.Sulcus) drawTextLabel(svg, meas.Sulcus, -10, 24,
        "Cart SA = " + fmt(csa && csa.value, 1) + "° " + (csa && csa.verdict || "") +
        " · TD = " + fmt(ctd && ctd.value, 2) + " mm " + (ctd && ctd.verdict || ""),
        verdictHex(csa && csa.verdict));
      if (meas.Sulcus_bone) drawTextLabel(svg, meas.Sulcus_bone, -10, 38,
        "Bone TFA = " + fmt(btfa && btfa.value, 3) + " " + (btfa && btfa.verdict || ""),
        verdictHex(btfa && btfa.verdict));
    }

    // Patella slice — Tilt
    if (cur === slices.patella) {
      const patl = ax.patella_landmarks_512px || {};
      if (patl.Patella_med_edge && patl.Patella_lat_edge) {
        drawLine(svg, patl.Patella_med_edge, patl.Patella_lat_edge, "var(--ovly-yellow)", 2);
        drawDot(svg, patl.Patella_med_edge, "var(--ovly-yellow)");
        drawDot(svg, patl.Patella_lat_edge, "var(--ovly-yellow)");
        if (pcl.PCL_med && pcl.PCL_lat) {
          drawLine(svg, pcl.PCL_med, pcl.PCL_lat, "var(--ovly-white)", 1, true);
        }
        const tilt = ax.indices && ax.indices.Patellar_Tilt;
        drawTextLabel(svg, patl.Patella_lat_edge, 8, -10,
          "Patellar Tilt = " + fmt(tilt && tilt.value, 1) + "° " + (tilt && tilt.verdict || ""),
          verdictHex(tilt && tilt.verdict));
      }
    }

    // TT slice — perpendicular-to-PCL geometry (Hinckel 2017)
    if (cur === slices.tt) {
      const tt   = ax.tt_landmarks_512px   || {};
      const meas = ax.meas_landmarks_512px || {};
      if (tt.TT_anterior && meas.Sulcus && pcl.PCL_med && pcl.PCL_lat) {
        const dx = pcl.PCL_lat[0] - pcl.PCL_med[0];
        const dy = pcl.PCL_lat[1] - pcl.PCL_med[1];
        const L  = Math.hypot(dx, dy);
        const ux = dx / L, uy = dy / L;
        const nx = -uy,    ny = ux;
        drawLine(svg, pcl.PCL_med, pcl.PCL_lat, "var(--ovly-white)", 1, true);
        const tg  = meas.Sulcus, ext = 220;
        drawLine(svg,
          [tg[0] - nx*ext, tg[1] - ny*ext],
          [tg[0] + nx*ext, tg[1] + ny*ext],
          "var(--ovly-cyan)", 1, true);
        drawDot(svg, tg, "var(--ovly-cyan)", 5);
        drawLine(svg,
          [tt.TT_anterior[0] - nx*ext, tt.TT_anterior[1] - ny*ext],
          [tt.TT_anterior[0] + nx*ext, tt.TT_anterior[1] + ny*ext],
          "var(--ovly-yellow)", 1, true);
        drawDot(svg, tt.TT_anterior, "var(--ovly-yellow)", 6);
        const t_tg = (tg[0]-pcl.PCL_med[0])*ux + (tg[1]-pcl.PCL_med[1])*uy;
        const t_tt = (tt.TT_anterior[0]-pcl.PCL_med[0])*ux + (tt.TT_anterior[1]-pcl.PCL_med[1])*uy;
        const foot_tg = [pcl.PCL_med[0] + t_tg*ux, pcl.PCL_med[1] + t_tg*uy];
        const foot_tt = [pcl.PCL_med[0] + t_tt*ux, pcl.PCL_med[1] + t_tt*uy];
        drawLine(svg, foot_tg, foot_tt, "var(--ovly-green)", 2.5);
        drawDot(svg, foot_tg, "var(--ovly-cyan)", 4);
        drawDot(svg, foot_tt, "var(--ovly-yellow)", 4);
        const pttg = ax.indices && ax.indices.PT_TG_cart;
        drawTextLabel(svg, tt.TT_anterior, 8, -10,
          "PT-TG = " + fmt(pttg && pttg.value, 1) + " mm " + (pttg && pttg.verdict || ""),
          verdictHex(pttg && pttg.verdict));
      }
    }
  }

  // Expose
  window.PoluneevViewer = {
    setSlice: setSlice,
    scrubSlice: scrubSlice,
    jumpAxTo: jumpAxTo,
    drawSagOverlay: drawSagOverlay,
    drawAxOverlay: drawAxOverlay,
    fmt: fmt,
  };
  // Inline-onclick handlers in demo.html call these by bare name; expose globally too.
  window.setSlice = setSlice;
  window.scrubSlice = scrubSlice;
  window.jumpAxTo = jumpAxTo;
  window.drawSagOverlay = drawSagOverlay;
  window.drawAxOverlay = drawAxOverlay;
})();
