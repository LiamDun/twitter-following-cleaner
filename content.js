/**
 * Following Cleaner for X
 * Tinder-style swipe UI to clean up your X/Twitter following list.
 *
 * This content script runs on x.com/*/following pages.
 * It scans visible UserCell elements, presents a swipe overlay,
 * and can execute unfollows by clicking the native UI buttons.
 */
(() => {
  // ═══════════════════════════════════════════
  // STATE
  // ═══════════════════════════════════════════
  let allAccounts = [];
  let displayOrder = [];
  let currentIndex = 0;
  let kept = [];
  let unfollowed = [];
  let isAnimating = false;
  let isDragging = false;
  let dragStartX = 0;
  let dragX = 0;
  let orderMode = "random"; // "oldest" or "random"
  let overlayEl = null;
  let phase = "idle"; // "idle" | "scanning" | "swiping" | "results" | "unfollowing"

  // ═══════════════════════════════════════════
  // LISTEN FOR POPUP
  // ═══════════════════════════════════════════
  chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (msg.action === "startScan") {
      sendResponse({ started: true });
      startScanning();
    }
  });

  // ═══════════════════════════════════════════
  // SCANNING
  // ═══════════════════════════════════════════
  async function startScanning() {
    if (phase === "scanning") return;
    phase = "scanning";

    // Show scanning overlay
    showScanningOverlay();

    const accounts = new Map();
    let lastCount = 0;
    let noNewCount = 0;

    // Scroll to top first
    window.scrollTo(0, 0);
    await sleep(500);

    while (noNewCount < 6) {
      const cells = document.querySelectorAll('[data-testid="UserCell"]');
      cells.forEach(cell => {
        try {
          let handle = "";
          const links = cell.querySelectorAll('a[role="link"]');
          for (const link of links) {
            const href = link.getAttribute("href");
            if (href && href.match(/^\/[A-Za-z0-9_]+$/) && !href.includes("/status/")) {
              handle = href.replace("/", "@");
              break; // First match is the profile link, not bio mentions
            }
          }

          if (!handle || accounts.has(handle)) return;

          // Display name
          const nameSpans = cell.querySelectorAll('a[role="link"] span');
          let displayName = nameSpans.length > 0 ? nameSpans[0].textContent : handle;

          // Bio - find text that isn't the name or handle or button text
          let bio = "";
          const allDirs = cell.querySelectorAll('[dir="auto"]');
          allDirs.forEach(d => {
            const text = d.textContent.trim();
            if (!text) return;
            // Skip if inside a button, role=button, or a follow-related test element
            if (d.closest('button') || d.closest('[role="button"]')) return;
            const testEl = d.closest('[data-testid]');
            if (testEl && /follow/i.test(testEl.getAttribute('data-testid'))) return;
            // Skip the display name and handle
            if (text === displayName) return;
            if (/^@[A-Za-z0-9_]+$/.test(text)) return; // standalone handle
            // Skip any text that looks like button UI text
            if (/^(Click to (Un)?follow|Following$)/i.test(text)) return;
            if (/^Click to/.test(text)) return;
            // Skip parent elements whose text includes child text we'd skip
            // (e.g. a parent that contains both bio and name gets name's full text)
            // Prefer leaf-level or near-leaf elements
            const childDirs = d.querySelectorAll('[dir="auto"]');
            if (childDirs.length > 2) return; // too high up the tree, skip
            // Bio is usually the longest remaining text
            if (text.length > bio.length) {
              bio = text;
            }
          });

          // Avatar
          const img = cell.querySelector('img[src*="profile_images"]');
          const avatar = img ? img.src : "";

          accounts.set(handle, { displayName, handle, bio, avatar });
        } catch (e) {}
      });

      // Update scanning overlay
      updateScanCount(accounts.size);

      if (accounts.size === lastCount) {
        noNewCount++;
      } else {
        noNewCount = 0;
        lastCount = accounts.size;
      }

      window.scrollBy(0, 2000);
      await sleep(150);
    }

    allAccounts = Array.from(accounts.values());
    // Reverse so oldest first (X shows newest first)
    allAccounts.reverse();
    displayOrder = shuffle([...allAccounts]);

    // Scroll back to top
    window.scrollTo(0, 0);
    await sleep(300);

    phase = "swiping";
    currentIndex = 0;
    kept = [];
    unfollowed = [];
    showSwipeOverlay();
  }

  // ═══════════════════════════════════════════
  // SCANNING OVERLAY
  // ═══════════════════════════════════════════
  function showScanningOverlay() {
    removeOverlay();
    overlayEl = el("div", { className: "fc-overlay" }, [
      el("div", { className: "fc-scan-box" }, [
        el("div", { className: "fc-scan-spinner" }),
        el("h2", { textContent: "Scanning your following list...", className: "fc-scan-title" }),
        el("p", { id: "fc-scan-count", textContent: "0 accounts found", className: "fc-scan-count" }),
      ]),
    ]);
    document.body.appendChild(overlayEl);
  }

  function updateScanCount(n) {
    const el = document.getElementById("fc-scan-count");
    if (el) el.textContent = `${n} accounts found`;
  }

  // ═══════════════════════════════════════════
  // SWIPE OVERLAY
  // ═══════════════════════════════════════════
  function showSwipeOverlay() {
    removeOverlay();
    overlayEl = el("div", { className: "fc-overlay" }, [buildSwipeUI()]);
    document.body.appendChild(overlayEl);
    bindKeys();

    // Also try to scroll the background following list to the current account
    scrollBgToAccount(displayOrder[currentIndex]);
  }

  function buildSwipeUI() {
    const account = displayOrder[currentIndex];
    const done = currentIndex >= displayOrder.length;
    const progress = ((kept.length + unfollowed.length) / displayOrder.length) * 100;

    const container = el("div", { className: "fc-container" });

    // Header
    const header = el("div", { className: "fc-header" }, [
      el("h1", { innerHTML: "Following Cleaner", className: "fc-title" }),
      el("p", {
        textContent: done ? "All done!" : `${currentIndex + 1} of ${displayOrder.length}`,
        className: "fc-subtitle",
      }),
    ]);

    // Order toggle
    const toggle = el("div", { className: "fc-toggle", onclick: toggleOrder }, [
      el("span", { textContent: orderMode === "oldest" ? "Oldest first" : "Random" }),
      el("div", { className: `fc-toggle-track ${orderMode === "random" ? "active" : ""}` }, [
        el("div", { className: "fc-toggle-thumb" }),
      ]),
    ]);
    header.appendChild(toggle);
    container.appendChild(header);

    // Progress bar
    const progressBar = el("div", { className: "fc-progress-track" }, [
      el("div", { className: "fc-progress-fill", style: `width:${progress}%` }),
    ]);
    container.appendChild(progressBar);

    // Card area
    const cardArea = el("div", { className: "fc-card-area" });

    if (done) {
      cardArea.appendChild(
        el("div", { className: "fc-done" }, [
          el("div", { textContent: "✨", className: "fc-done-emoji" }),
          el("h2", { textContent: "All reviewed!", className: "fc-done-title" }),
          el("p", {
            textContent: `${unfollowed.length} to unfollow · ${kept.length} to keep`,
            className: "fc-done-sub",
          }),
          el("button", {
            textContent: "View Results",
            className: "fc-btn-results",
            onclick: () => showResults(),
          }),
        ])
      );
    } else {
      // Preview card behind
      if (currentIndex + 1 < displayOrder.length) {
        cardArea.appendChild(el("div", { className: "fc-card-preview" }));
      }

      // Main card
      const card = el("div", {
        id: "fc-main-card",
        className: "fc-card",
      });

      // Swipe labels
      card.appendChild(el("div", { id: "fc-label-keep", className: "fc-swipe-label fc-label-keep" }, [
        el("span", { textContent: "KEEP" }),
      ]));
      card.appendChild(el("div", { id: "fc-label-bye", className: "fc-swipe-label fc-label-bye" }, [
        el("span", { textContent: "BYE" }),
      ]));

      // Avatar
      const avatarEl = el("div", { className: "fc-avatar" });
      if (account.avatar) {
        const img = el("img", { src: account.avatar, className: "fc-avatar-img" });
        img.onerror = () => { img.style.display = "none"; };
        avatarEl.appendChild(img);
      }
      avatarEl.appendChild(el("span", {
        textContent: account.displayName.charAt(0).toUpperCase(),
        className: "fc-avatar-fallback",
      }));
      card.appendChild(avatarEl);

      // Name (clickable)
      const nameLink = el("a", {
        href: `https://x.com/${account.handle.replace("@", "")}`,
        target: "_blank",
        rel: "noopener noreferrer",
        className: "fc-name-link",
      }, [el("h2", { textContent: account.displayName, className: "fc-card-name" })]);
      nameLink.addEventListener("pointerdown", e => e.stopPropagation());
      card.appendChild(nameLink);

      // Handle (clickable)
      const handleLink = el("a", {
        href: `https://x.com/${account.handle.replace("@", "")}`,
        target: "_blank",
        rel: "noopener noreferrer",
        className: "fc-handle-link",
      }, [el("span", { textContent: account.handle })]);
      handleLink.addEventListener("pointerdown", e => e.stopPropagation());
      card.appendChild(handleLink);

      // Bio
      card.appendChild(el("p", {
        textContent: account.bio || "No bio",
        className: "fc-card-bio",
      }));

      // Open in new tab button
      const peekBtn = el("button", {
        textContent: "↗ Open profile",
        className: "fc-peek-btn",
        onclick: (e) => {
          e.stopPropagation();
          window.open(`https://x.com/${account.handle.replace("@", "")}`, "_blank");
        },
      });
      peekBtn.addEventListener("pointerdown", e => e.stopPropagation());
      card.appendChild(peekBtn);

      // Drag handlers
      card.addEventListener("pointerdown", onPointerDown);
      cardArea.appendChild(card);

      // Action buttons
      const actions = el("div", { className: "fc-actions" }, [
        el("button", {
          innerHTML: "✕",
          className: "fc-btn-unfollow",
          onclick: () => doSwipe("left"),
        }),
        el("button", {
          innerHTML: "↩",
          className: "fc-btn-undo",
          onclick: () => undoSwipe(),
          title: "Undo last swipe",
        }),
        el("button", {
          innerHTML: "☰",
          className: "fc-btn-menu",
          onclick: () => showResults(),
          title: "View results so far",
        }),
        el("button", {
          innerHTML: "♥",
          className: "fc-btn-keep",
          onclick: () => doSwipe("right"),
        }),
      ]);
      container.appendChild(cardArea);
      container.appendChild(actions);

      // Keyboard hint
      container.appendChild(el("p", {
        textContent: "← Unfollow · Z Undo · Keep →",
        className: "fc-hint",
      }));
    }

    if (done) container.appendChild(cardArea);

    // Stats bar
    const stats = el("div", { className: "fc-stats", onclick: () => showResults(), style: "cursor:pointer" }, [
      el("div", { className: "fc-stat" }, [
        el("div", { textContent: unfollowed.length, className: "fc-stat-num fc-red" }),
        el("div", { textContent: "UNFOLLOW", className: "fc-stat-label" }),
      ]),
      el("div", { className: "fc-stat" }, [
        el("div", { textContent: displayOrder.length - currentIndex, className: "fc-stat-num fc-muted" }),
        el("div", { textContent: "REMAINING", className: "fc-stat-label" }),
      ]),
      el("div", { className: "fc-stat" }, [
        el("div", { textContent: kept.length, className: "fc-stat-num fc-green" }),
        el("div", { textContent: "KEEP", className: "fc-stat-label" }),
      ]),
    ]);
    container.appendChild(stats);

    return container;
  }

  // ═══════════════════════════════════════════
  // RESULTS VIEW
  // ═══════════════════════════════════════════
  function showResults() {
    removeOverlay();
    phase = "results";
    let filter = "unfollow";

    overlayEl = el("div", { className: "fc-overlay" });
    const container = el("div", { className: "fc-container" });

    function renderResults() {
      container.innerHTML = "";

      // Header
      container.appendChild(el("div", { className: "fc-results-header" }, [
        el("button", {
          textContent: "← Back",
          className: "fc-back-btn",
          onclick: () => {
            phase = "swiping";
            showSwipeOverlay();
          },
        }),
        el("h1", { textContent: "Results", className: "fc-results-title" }),
      ]));

      // Filter tabs
      const tabs = el("div", { className: "fc-tabs" }, [
        el("button", {
          textContent: `Unfollow (${unfollowed.length})`,
          className: `fc-tab ${filter === "unfollow" ? "fc-tab-active-red" : ""}`,
          onclick: () => { filter = "unfollow"; renderResults(); },
        }),
        el("button", {
          textContent: `Keep (${kept.length})`,
          className: `fc-tab ${filter === "keep" ? "fc-tab-active-green" : ""}`,
          onclick: () => { filter = "keep"; renderResults(); },
        }),
      ]);
      container.appendChild(tabs);

      // List
      const list = filter === "unfollow" ? unfollowed : kept;
      const listEl = el("div", { className: "fc-results-list" });
      list.forEach((a, i) => {
        const row = el("div", { className: "fc-result-row" }, [
          el("div", { className: "fc-result-avatar" }, [
            a.avatar
              ? (() => {
                  const img = el("img", { src: a.avatar, className: "fc-result-avatar-img" });
                  img.onerror = () => { img.style.display = "none"; };
                  return img;
                })()
              : null,
            el("span", { textContent: a.displayName.charAt(0).toUpperCase(), className: "fc-result-avatar-letter" }),
          ].filter(Boolean)),
          el("div", { className: "fc-result-info" }, [
            el("a", {
              href: `https://x.com/${a.handle.replace("@", "")}`,
              target: "_blank",
              className: "fc-result-name",
              textContent: a.displayName,
            }),
            el("span", { textContent: a.handle, className: "fc-result-handle" }),
          ]),
          // Move button
          el("button", {
            textContent: filter === "unfollow" ? "Keep" : "Remove",
            className: `fc-move-btn ${filter === "unfollow" ? "fc-move-keep" : "fc-move-remove"}`,
            onclick: () => {
              if (filter === "unfollow") {
                unfollowed.splice(i, 1);
                kept.push(a);
              } else {
                kept.splice(i, 1);
                unfollowed.push(a);
              }
              renderResults();
            },
          }),
        ]);
        listEl.appendChild(row);
      });
      container.appendChild(listEl);

      // Execute unfollows button
      if (unfollowed.length > 0) {
        container.appendChild(el("button", {
          textContent: `⚡ Execute ${unfollowed.length} Unfollows`,
          className: "fc-execute-btn",
          onclick: () => executeUnfollows(),
        }));
        container.appendChild(el("p", {
          textContent: "Unfollows are throttled (~5s each) to reduce risk. You can cancel anytime.",
          className: "fc-execute-warn",
        }));
      }
    }

    renderResults();
    overlayEl.appendChild(container);
    document.body.appendChild(overlayEl);
  }

  // ═══════════════════════════════════════════
  // EXECUTE UNFOLLOWS
  // ═══════════════════════════════════════════
  let unfollowAbort = false;

  async function executeUnfollows() {
    phase = "unfollowing";
    unfollowAbort = false;
    removeOverlay();

    overlayEl = el("div", { className: "fc-overlay" });
    const container = el("div", { className: "fc-container" });

    const statusTitle = el("h2", { textContent: "Unfollowing...", className: "fc-unfollow-title" });
    const statusSub = el("p", { textContent: "", className: "fc-unfollow-sub" });
    const progressTrack = el("div", { className: "fc-progress-track" }, [
      el("div", { id: "fc-unfollow-progress", className: "fc-progress-fill fc-progress-red" }),
    ]);
    const logBox = el("div", { className: "fc-unfollow-log" });
    const cancelBtn = el("button", {
      textContent: "Cancel",
      className: "fc-cancel-btn",
      onclick: () => { unfollowAbort = true; },
    });

    container.appendChild(statusTitle);
    container.appendChild(progressTrack);
    container.appendChild(statusSub);
    container.appendChild(logBox);
    container.appendChild(cancelBtn);
    overlayEl.appendChild(container);
    document.body.appendChild(overlayEl);

    let completed = 0;
    let failed = 0;

    for (let i = 0; i < unfollowed.length; i++) {
      if (unfollowAbort) break;

      const account = unfollowed[i];
      statusSub.textContent = `${i + 1} of ${unfollowed.length}: ${account.displayName} (${account.handle})`;

      const success = await unfollowOne(account);
      if (success) {
        completed++;
        addLog(logBox, `✅ Unfollowed ${account.displayName}`, "fc-log-ok");
      } else {
        failed++;
        addLog(logBox, `❌ Failed: ${account.displayName}`, "fc-log-fail");
      }

      const pct = ((i + 1) / unfollowed.length) * 100;
      const bar = document.getElementById("fc-unfollow-progress");
      if (bar) bar.style.width = `${pct}%`;

      // Random delay 3-7 seconds
      if (i < unfollowed.length - 1 && !unfollowAbort) {
        const delay = 3000 + Math.random() * 4000;
        await sleep(delay);
      }
    }

    statusTitle.textContent = unfollowAbort ? "Cancelled" : "Done!";
    statusSub.textContent = `${completed} unfollowed, ${failed} failed${unfollowAbort ? ` (stopped at ${completed + failed}/${unfollowed.length})` : ""}`;
    cancelBtn.textContent = "Close";
    cancelBtn.onclick = () => {
      removeOverlay();
      phase = "idle";
    };
  }

  async function unfollowOne(account) {
    try {
      // Scroll through the following list to find this person's cell
      window.scrollTo(0, 0);
      await sleep(300);

      for (let attempt = 0; attempt < 80; attempt++) {
        const cells = document.querySelectorAll('[data-testid="UserCell"]');
        for (const cell of cells) {
          const links = cell.querySelectorAll('a[role="link"]');
          let cellHandle = "";
          for (const link of links) {
            const href = link.getAttribute("href");
            if (href && href.match(/^\/[A-Za-z0-9_]+$/) && !href.includes("/status/")) {
              cellHandle = href.replace("/", "@");
              break;
            }
          }

          if (cellHandle.toLowerCase() === account.handle.toLowerCase()) {
            // Found the cell, look for the Following button
            const btn = cell.querySelector('[data-testid$="-unfollow"]');
            if (btn) {
              btn.click();
              await sleep(500);

              // Confirm unfollow in the dialog
              const confirmBtn = document.querySelector('[data-testid="confirmationSheetConfirm"]');
              if (confirmBtn) {
                confirmBtn.click();
                await sleep(300);
                return true;
              }
            }
            return false;
          }
        }

        window.scrollBy(0, 400);
        await sleep(200);
      }

      return false;
    } catch (e) {
      console.error("Unfollow failed:", e);
      return false;
    }
  }

  function addLog(container, text, cls) {
    const line = el("div", { textContent: text, className: `fc-log-line ${cls}` });
    container.insertBefore(line, container.firstChild);
  }

  // ═══════════════════════════════════════════
  // PEEK - scroll BG to account & trigger hover
  // ═══════════════════════════════════════════
  function scrollBgToAccount(account) {
    // Fire and forget, just a best effort to show the right spot
    if (!account) return;
    // Don't await, it runs in background
  }

  // ═══════════════════════════════════════════
  // SWIPE MECHANICS
  // ═══════════════════════════════════════════
  function undoSwipe() {
    if (isAnimating || currentIndex === 0) return;
    currentIndex--;
    // Check if the account was in kept or unfollowed and remove it
    const account = displayOrder[currentIndex];
    const keptIdx = kept.findIndex(a => a.handle === account.handle);
    if (keptIdx !== -1) kept.splice(keptIdx, 1);
    const unfIdx = unfollowed.findIndex(a => a.handle === account.handle);
    if (unfIdx !== -1) unfollowed.splice(unfIdx, 1);
    showSwipeOverlay();
  }

  function doSwipe(direction) {
    if (isAnimating || currentIndex >= displayOrder.length) return;
    isAnimating = true;

    const card = document.getElementById("fc-main-card");
    if (card) {
      card.style.transition = "all 0.3s cubic-bezier(0.25, 0.46, 0.45, 0.94)";
      card.style.transform = `translateX(${direction === "left" ? -600 : 600}px) rotate(${direction === "left" ? -30 : 30}deg)`;
      card.style.opacity = "0";
    }

    setTimeout(() => {
      if (direction === "right") {
        kept.push(displayOrder[currentIndex]);
      } else {
        unfollowed.push(displayOrder[currentIndex]);
      }
      currentIndex++;
      isAnimating = false;
      showSwipeOverlay();
    }, 300);
  }

  function onPointerDown(e) {
    if (isAnimating) return;
    // Don't start drag on links/buttons
    if (e.target.closest("a") || e.target.closest("button")) return;
    isDragging = true;
    dragStartX = e.clientX;
    dragX = 0;
    document.addEventListener("pointermove", onPointerMove);
    document.addEventListener("pointerup", onPointerUp);
  }

  function onPointerMove(e) {
    if (!isDragging) return;
    dragX = e.clientX - dragStartX;
    const card = document.getElementById("fc-main-card");
    if (card) {
      card.style.transition = "none";
      card.style.transform = `translateX(${dragX}px) rotate(${dragX * 0.05}deg)`;
    }

    const keepLabel = document.getElementById("fc-label-keep");
    const byeLabel = document.getElementById("fc-label-bye");
    const opacity = Math.min(Math.abs(dragX) / 150, 1);

    if (keepLabel) keepLabel.style.opacity = dragX > 30 ? opacity : 0;
    if (byeLabel) byeLabel.style.opacity = dragX < -30 ? opacity : 0;
  }

  function onPointerUp() {
    if (!isDragging) return;
    isDragging = false;
    document.removeEventListener("pointermove", onPointerMove);
    document.removeEventListener("pointerup", onPointerUp);

    if (Math.abs(dragX) > 100) {
      doSwipe(dragX > 0 ? "right" : "left");
    } else {
      const card = document.getElementById("fc-main-card");
      if (card) {
        card.style.transition = "all 0.2s ease";
        card.style.transform = "translateX(0) rotate(0)";
      }
      const keepLabel = document.getElementById("fc-label-keep");
      const byeLabel = document.getElementById("fc-label-bye");
      if (keepLabel) keepLabel.style.opacity = 0;
      if (byeLabel) byeLabel.style.opacity = 0;
    }
    dragX = 0;
  }

  // ═══════════════════════════════════════════
  // KEYBOARD
  // ═══════════════════════════════════════════
  function bindKeys() {
    document.removeEventListener("keydown", onKeyDown);
    document.addEventListener("keydown", onKeyDown);
  }

  function onKeyDown(e) {
    if (phase !== "swiping") return;
    if (e.key === "ArrowLeft" || e.key === "a") { e.preventDefault(); doSwipe("left"); }
    if (e.key === "ArrowRight" || e.key === "d") { e.preventDefault(); doSwipe("right"); }
    if (e.key === "z" || e.key === "Backspace") { e.preventDefault(); undoSwipe(); }
  }

  // ═══════════════════════════════════════════
  // ORDER TOGGLE
  // ═══════════════════════════════════════════
  function toggleOrder() {
    orderMode = orderMode === "oldest" ? "random" : "oldest";
    // Only reorder the remaining (unswiped) accounts
    const alreadySwiped = displayOrder.slice(0, currentIndex);
    const remaining = displayOrder.slice(currentIndex);
    if (orderMode === "oldest") {
      // Sort remaining by their position in the original allAccounts array
      remaining.sort((a, b) => allAccounts.indexOf(a) - allAccounts.indexOf(b));
    } else {
      shuffle(remaining);
    }
    displayOrder = [...alreadySwiped, ...remaining];
    showSwipeOverlay();
  }

  function shuffle(arr) {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  }

  // ═══════════════════════════════════════════
  // UTILITIES
  // ═══════════════════════════════════════════
  function el(tag, props = {}, children = []) {
    const e = document.createElement(tag);
    for (const [k, v] of Object.entries(props)) {
      if (k === "className") e.className = v;
      else if (k === "innerHTML") e.innerHTML = v;
      else if (k === "textContent") e.textContent = v;
      else if (k === "style" && typeof v === "string") e.setAttribute("style", v);
      else if (k.startsWith("on")) e[k] = v;
      else e.setAttribute(k, v);
    }
    children.forEach(c => { if (c) e.appendChild(c); });
    return e;
  }

  function removeOverlay() {
    if (overlayEl) {
      overlayEl.remove();
      overlayEl = null;
    }
  }

  function sleep(ms) {
    return new Promise(r => setTimeout(r, ms));
  }
})();
