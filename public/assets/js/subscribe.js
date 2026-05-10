/* subscribe.js — Stay-informed form handler.
   Posts to the Cloudflare Worker at SUBSCRIBE_URL. After Phase B.6c
   (wrangler deploy) the user pastes the workers.dev URL here OR
   configures a custom domain (subscribe.poluneev.com) and uses that.

   Worker contract:
     POST /subscribe
     Body: { "email": "..." }
     200  { "success": true }
     400  { "success": false, "reason": "Invalid email." }
     409  { "success": false, "reason": "Already subscribed." }
     429  { "success": false, "reason": "Rate limit. Try again later." }
     500  { "success": false, "reason": "..." }
*/
(function () {
  "use strict";

  // ---- Config ----------------------------------------------------------
  // Update after `wrangler deploy` in worker/. Two acceptable forms:
  //   * workers.dev:   https://poluneev-subscribe.<account>.workers.dev
  //   * custom domain: https://subscribe.poluneev.com
  // The frontend silently no-ops if the URL is left as the placeholder,
  // showing the user a 'configuration pending' message instead of a
  // network error.
  const SUBSCRIBE_URL = "https://subscribe.poluneev.com";
  const CONFIGURED = !/<not-yet-deployed>/.test(SUBSCRIBE_URL);

  const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

  const form    = document.getElementById("sub-form");
  const input   = document.getElementById("sub-email");
  const btn     = document.getElementById("sub-btn");
  const statusN = document.getElementById("sub-status");
  if (!form || !input || !btn || !statusN) return;

  function setStatus(text, kind) {
    statusN.textContent = text || "";
    statusN.classList.toggle("is-success", kind === "success");
    statusN.classList.toggle("is-error",   kind === "error");
  }

  form.addEventListener("submit", async function (e) {
    e.preventDefault();
    setStatus("");
    const email = input.value.trim().toLowerCase();
    if (!EMAIL_RE.test(email)) {
      setStatus("Please enter a valid email address.", "error");
      input.focus();
      return;
    }
    if (!CONFIGURED) {
      setStatus(
        "Subscribe form is not yet configured. Email contact@poluneev.com instead.",
        "error"
      );
      return;
    }

    btn.disabled = true;
    const oldLabel = btn.textContent;
    btn.textContent = "Subscribing…";

    try {
      const r = await fetch(SUBSCRIBE_URL + "/subscribe", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ email: email }),
      });
      let body = null;
      try { body = await r.json(); } catch (_) {}
      if (r.ok && body && body.success) {
        setStatus("Subscribed. Thank you.", "success");
        form.reset();
        return;
      }
      if (r.status === 409) {
        setStatus("This email is already subscribed.", "success");
        form.reset();
        return;
      }
      if (r.status === 429) {
        setStatus(
          (body && body.reason) ||
          "Rate limit reached. Try again in an hour or email contact@poluneev.com.",
          "error"
        );
        return;
      }
      setStatus(
        (body && body.reason) ||
        "Subscription failed. Try again or email contact@poluneev.com.",
        "error"
      );
    } catch (err) {
      setStatus(
        "Subscription failed. Try again or email contact@poluneev.com.",
        "error"
      );
    } finally {
      btn.disabled = false;
      btn.textContent = oldLabel;
    }
  });
})();
