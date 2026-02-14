document.getElementById("startBtn").addEventListener("click", async () => {
  const btn = document.getElementById("startBtn");
  const status = document.getElementById("status");

  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

  if (!tab.url || (!tab.url.includes("x.com/") && !tab.url.includes("twitter.com/"))) {
    status.textContent = "⚠️ Please navigate to your Following page on X first.";
    status.classList.add("visible");
    return;
  }

  if (!tab.url.includes("/following")) {
    status.textContent = "⚠️ Go to your profile → Following tab first.";
    status.classList.add("visible");
    return;
  }

  btn.textContent = "Scanning...";
  btn.classList.remove("btn-primary");
  btn.classList.add("btn-disabled");
  btn.disabled = true;

  status.textContent = "📡 Scrolling through your following list...";
  status.classList.add("visible");

  chrome.tabs.sendMessage(tab.id, { action: "startScan" }, (response) => {
    if (chrome.runtime.lastError) {
      status.textContent = "⚠️ Couldn't connect. Try refreshing the page.";
      btn.textContent = "Start Scanning";
      btn.classList.add("btn-primary");
      btn.classList.remove("btn-disabled");
      btn.disabled = false;
      return;
    }
    if (response && response.started) {
      status.textContent = "✅ Scanning started! You can close this popup.";
    }
  });
});
