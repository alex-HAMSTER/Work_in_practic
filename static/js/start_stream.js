(function () {
    const video = document.getElementById("localVideo");
    const canvas = document.getElementById("captureCanvas");
    const ctx = canvas.getContext("2d");
    const startBtn = document.getElementById("startBtn");
    const stopBtn = document.getElementById("stopBtn");
    const statusEl = document.getElementById("status");
    const cameraPlaceholder = document.getElementById("cameraPlaceholder");

    // Dashboard elements
    const streamerChatMessages = document.getElementById("streamerChatMessages");
    const streamerBidsList = document.getElementById("streamerBidsList");
    const streamerPrice = document.getElementById("streamerPrice");
    const streamBadge = document.getElementById("streamBadge");
    const streamerViewerCount = document.getElementById("streamerViewerCount");

    let stream = null;
    let ws = null;
    let captureInterval = null;
    let bannedUsers = new Set();
    const FPS = 60;
    const INTERVAL_MS = 1000 / FPS;

    function getWsUrl() {
        const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
        return `${protocol}//${window.location.host}/ws`;
    }

    function setStatus(tokenKey, fallback) {
        statusEl.setAttribute("data-i18n", tokenKey);
        statusEl.textContent = window.t(tokenKey) || fallback;
    }

    function setBadgeLive(isLive) {
        if (isLive) {
            streamBadge.textContent = "● " + (window.t('badge_live') || 'LIVE');
            streamBadge.className = "stream-live-badge";
        } else {
            streamBadge.textContent = "● " + (window.t('badge_offline') || 'ОФЛАЙН');
            streamBadge.className = "stream-offline-badge";
        }
    }

    function escapeHtml(s) {
        const d = document.createElement("div");
        d.textContent = s;
        return d.innerHTML;
    }

    function appendChat(name, text) {
        const el = document.createElement("div");
        el.className = "chat-message chat-message-mod";
        el.dataset.username = name;

        const isBanned = bannedUsers.has(name);

        el.innerHTML = `
            <div class="chat-msg-content">
                <span class="chat-username">${escapeHtml(name)}:</span> ${escapeHtml(text)}
                ${isBanned ? '<span class="chat-ban-badge">' + (window.t('label_banned') || '🔇') + '</span>' : ''}
            </div>
            <div class="chat-mod-wrap">
                <button class="chat-mod-btn" title="Moderation">⋮</button>
                <div class="chat-mod-menu">
                    ${isBanned
                        ? `<button class="chat-mod-option chat-mod-unban" data-target="${escapeHtml(name)}">
                              <span>🔓</span> <span data-i18n="btn_unban">${window.t('btn_unban') || 'Розблокувати'}</span>
                           </button>`
                        : `<button class="chat-mod-option chat-mod-ban" data-target="${escapeHtml(name)}">
                              <span>🚫</span> <span data-i18n="btn_ban">${window.t('btn_ban') || 'Заблокувати'}</span>
                           </button>`
                    }
                </div>
            </div>
        `;

        // Three-dot button click
        const modBtn = el.querySelector('.chat-mod-btn');
        const modMenu = el.querySelector('.chat-mod-menu');
        modBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            // Close all other open menus
            document.querySelectorAll('.chat-mod-menu.open').forEach(m => {
                if (m !== modMenu) m.classList.remove('open');
            });
            modMenu.classList.toggle('open');
        });

        // Ban / unban action
        const actionBtn = el.querySelector('.chat-mod-option');
        if (actionBtn) {
            actionBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                const target = actionBtn.dataset.target;
                if (actionBtn.classList.contains('chat-mod-ban')) {
                    if (ws && ws.readyState === WebSocket.OPEN) {
                        ws.send(JSON.stringify({ type: 'ban_user', username: target }));
                    }
                } else {
                    if (ws && ws.readyState === WebSocket.OPEN) {
                        ws.send(JSON.stringify({ type: 'unban_user', username: target }));
                    }
                }
                modMenu.classList.remove('open');
            });
        }

        streamerChatMessages.appendChild(el);
        streamerChatMessages.scrollTop = streamerChatMessages.scrollHeight;
    }

    function appendBid(name, amount) {
        const el = document.createElement("div");
        el.className = "bid-item";
        el.innerHTML = `<span class="bid-user">${escapeHtml(name)}</span> <span class="bid-amount">$${amount}</span>`;
        streamerBidsList.insertBefore(el, streamerBidsList.firstChild);
    }

    function refreshBanBadges() {
        // Re-render menu state for all visible chat messages
        streamerChatMessages.querySelectorAll('.chat-message-mod').forEach(el => {
            const name = el.dataset.username;
            const isBanned = bannedUsers.has(name);
            // Update ban badge
            let badge = el.querySelector('.chat-ban-badge');
            if (isBanned && !badge) {
                const content = el.querySelector('.chat-msg-content');
                const b = document.createElement('span');
                b.className = 'chat-ban-badge';
                b.textContent = window.t('label_banned') || '🔇';
                content.appendChild(b);
            } else if (!isBanned && badge) {
                badge.remove();
            }
            // Update menu option
            const modMenu = el.querySelector('.chat-mod-menu');
            if (modMenu) {
                modMenu.innerHTML = isBanned
                    ? `<button class="chat-mod-option chat-mod-unban" data-target="${escapeHtml(name)}">
                          <span>🔓</span> <span data-i18n="btn_unban">${window.t('btn_unban') || 'Розблокувати'}</span>
                       </button>`
                    : `<button class="chat-mod-option chat-mod-ban" data-target="${escapeHtml(name)}">
                          <span>🚫</span> <span data-i18n="btn_ban">${window.t('btn_ban') || 'Заблокувати'}</span>
                       </button>`;
                const actionBtn = modMenu.querySelector('.chat-mod-option');
                if (actionBtn) {
                    actionBtn.addEventListener('click', (e) => {
                        e.stopPropagation();
                        const target = actionBtn.dataset.target;
                        if (actionBtn.classList.contains('chat-mod-ban')) {
                            if (ws && ws.readyState === WebSocket.OPEN) {
                                ws.send(JSON.stringify({ type: 'ban_user', username: target }));
                            }
                        } else {
                            if (ws && ws.readyState === WebSocket.OPEN) {
                                ws.send(JSON.stringify({ type: 'unban_user', username: target }));
                            }
                        }
                        modMenu.classList.remove('open');
                    });
                }
            }
        });
    }

    function handleWsMessage(msg) {
        switch (msg.type) {
            case "chat":
                appendChat(msg.username, msg.text);
                break;
            case "bid":
                appendBid(msg.username, msg.amount);
                break;
            case "price":
                if (streamerPrice) streamerPrice.textContent = "$" + msg.current;
                break;
            case "viewers":
                if (streamerViewerCount) {
                    streamerViewerCount.innerHTML = msg.count + ' <span data-i18n="viewers">' + window.t('viewers') + '</span>';
                }
                break;
            case "ban_list":
                bannedUsers = new Set(msg.banned || []);
                refreshBanBadges();
                break;
        }
    }

    async function startStream() {
        try {
            stream = await navigator.mediaDevices.getUserMedia({ video: true });
            video.srcObject = stream;
            if (cameraPlaceholder) cameraPlaceholder.style.display = "none";
            setStatus("status_connecting", "Камера ввімкнена. Підключаюсь до сервера...");

            ws = new WebSocket(getWsUrl());

            ws.onopen = () => {
                ws.send(JSON.stringify({ type: "join", role: "streamer" }));
                setStatus("status_live", "Стрім іде! Глядачі бачать ваше відео.");
                setBadgeLive(true);
                startBtn.style.display = "none";
                stopBtn.style.display = "inline-block";

                var started = false;
                var startWhenReady = function () {
                    if (!started && video.videoWidth > 0 && video.videoHeight > 0) {
                        started = true;
                        video.removeEventListener("playing", startWhenReady);
                        video.removeEventListener("loadeddata", startWhenReady);
                        startCapture();
                    }
                };
                video.addEventListener("playing", startWhenReady);
                video.addEventListener("loadeddata", startWhenReady);
                if (video.videoWidth > 0 && video.videoHeight > 0) {
                    startWhenReady();
                } else {
                    video.play().catch(function () { });
                    setTimeout(startWhenReady, 50);
                    setTimeout(startWhenReady, 150);
                }
            };

            ws.onmessage = (event) => {
                try {
                    const msg = JSON.parse(event.data);
                    handleWsMessage(msg);
                } catch (e) {
                    console.warn("WS parse error:", e);
                }
            };

            ws.onerror = () => setStatus("status_ws_error", "Помилка WebSocket");
            ws.onclose = () => {
                stopCapture();
                setBadgeLive(false);
                setStatus("status_ws_closed", "З'єднання закрито");
            };
        } catch (err) {
            statusEl.removeAttribute("data-i18n");
            statusEl.textContent = window.t('status_error') + (err.message || window.t('status_no_camera'));
        }
    }

    function startCapture() {
        const MAX_WIDTH = 900;
        const JPEG_QUALITY = 0.4;

        captureInterval = setInterval(() => {
            if (!ws || ws.readyState !== WebSocket.OPEN) return;
            if (video.readyState !== video.HAVE_ENOUGH_DATA) return;

            let w = video.videoWidth;
            let h = video.videoHeight;
            if (!w || !h) return;

            if (w > MAX_WIDTH) {
                h = Math.round((h * MAX_WIDTH) / w);
                w = MAX_WIDTH;
            }
            canvas.width = w;
            canvas.height = h;

            ctx.drawImage(video, 0, 0, w, h);
            try {
                const dataUrl = canvas.toDataURL("image/jpeg", JPEG_QUALITY);
                const base64 = dataUrl.split(",")[1];
                if (base64) {
                    ws.send(JSON.stringify({ type: "frame", data: base64 }));
                }
            } catch (e) {
                console.warn("Capture error:", e);
            }
        }, INTERVAL_MS);
    }

    function stopCapture() {
        if (captureInterval) {
            clearInterval(captureInterval);
            captureInterval = null;
        }
    }

    function stopStream() {
        stopCapture();
        if (ws) {
            ws.close();
            ws = null;
        }
        if (stream) {
            stream.getTracks().forEach((t) => t.stop());
            stream = null;
        }
        video.srcObject = null;
        if (cameraPlaceholder) cameraPlaceholder.style.display = "flex";
        startBtn.style.display = "inline-block";
        stopBtn.style.display = "none";
        setBadgeLive(false);
        setStatus("status_stopped", "Стрім зупинено. Натисніть «Запустити стрім» знову.");
    }

    startBtn.addEventListener("click", startStream);
    stopBtn.addEventListener("click", stopStream);

    // Close mod menus on click outside
    document.addEventListener('click', () => {
        document.querySelectorAll('.chat-mod-menu.open').forEach(m => m.classList.remove('open'));
    });

    window.addEventListener('languageChanged', () => {
        if (statusEl.hasAttribute("data-i18n")) {
            statusEl.textContent = window.t(statusEl.getAttribute("data-i18n"));
        }
        setBadgeLive(streamBadge.classList.contains("stream-live-badge"));
        refreshBanBadges();
    });

})();
