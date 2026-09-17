// toast.js - Error and notification toast management

export function ensureErrorToast() {
  if (typeof document === "undefined") return null;
  let el = document.getElementById("error-toast");
  if (!el) {
    el = document.createElement("div");
    el.id = "error-toast";
    el.className = "hidden";
    el.setAttribute("role", "alert");
    el.setAttribute("aria-live", "polite");
    el.style.cssText = "position:fixed;bottom:76px;left:50%;transform:translateX(-50%);background:#21262d;color:#f85149;border:1px solid #da3633;border-radius:6px;padding:8px 14px;font-size:12px;z-index:9999;max-width:80vw;overflow-wrap:break-word;word-break:break-word;box-shadow:0 4px 12px rgba(0,0,0,0.4);";
    document.body.appendChild(el);
  }
  return el;
}

export function showErrorToast(msg) {
  if (typeof document === "undefined") return;
  const el = ensureErrorToast();
  if (!el) return;
  el.textContent = msg;
  el.classList.remove("hidden");
  el.style.display = "block";
  clearTimeout(showErrorToast._tid);
  showErrorToast._tid = setTimeout(() => {
    el.classList.add("hidden");
    el.style.display = "none";
  }, 4000);
}
