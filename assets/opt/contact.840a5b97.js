(function () {
  var overlay = document.getElementById("contactOverlay");
  var form = document.getElementById("contactForm");
  if (!overlay || !form) return;

  function openContactModal(source) {
    document.getElementById("contactSource").value = source;
    overlay.hidden = false;
  }

  function closeContactModal() {
    overlay.hidden = true;
  }

  window.openContactModal = openContactModal;
  window.closeContactModal = closeContactModal;

  overlay.addEventListener("click", function (e) {
    if (e.target === overlay) closeContactModal();
  });

  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape") closeContactModal();
  });

  form.addEventListener("submit", async function (e) {
    e.preventDefault();
    var statusEl = document.getElementById("contactStatus");
    var btn = form.querySelector(".contact-submit");
    var payload = {
      name: form.name.value.trim(),
      email: form.email.value.trim(),
      message: form.message.value.trim(),
      source: form.source.value,
      website: form.website.value,
    };
    btn.disabled = true;
    btn.classList.add("is-loading");
    statusEl.textContent = "Sending your message...";
    statusEl.className = "contact-status";

    var controller = new AbortController();
    var timeoutId = setTimeout(function () { controller.abort(); }, 15000);

    try {
      var res = await fetch("/api/contact", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });
      clearTimeout(timeoutId);
      if (!res.ok) throw new Error("Request failed");
      statusEl.textContent = "Thanks — we'll get back to you soon.";
      statusEl.className = "contact-status ok";
      form.reset();
      btn.classList.remove("is-loading");
      btn.disabled = false;
      setTimeout(closeContactModal, 1800);
    } catch (err) {
      clearTimeout(timeoutId);
      var timedOut = err && err.name === "AbortError";
      statusEl.textContent = timedOut
        ? "This is taking longer than expected — please try again in a moment, or email hello@5280content.com directly."
        : "Something went wrong — please try again, or email hello@5280content.com directly.";
      statusEl.className = "contact-status err";
      btn.disabled = false;
      btn.classList.remove("is-loading");
    }
  });
})();
