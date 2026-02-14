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

  try {
    await chrome.scripting.insertCSS({
      target: { tabId: tab.id },
      files: ["styles.css"],
    });
    await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      files: ["content.js"],
    });

    status.textContent = "✅ Scanning started! You can close this popup.";
    status.classList.add("visible");
  } catch (err) {
    status.textContent = "⚠️ Failed: " + err.message;
    status.classList.add("visible");
    btn.textContent = "Start Scanning";
    btn.classList.add("btn-primary");
    btn.classList.remove("btn-disabled");
    btn.disabled = false;
  }
});
