(function () {
    const streamImage = document.getElementById("streamImage");
    const placeholder = document.getElementById("placeholder");
    const viewerCount = document.getElementById("viewerCount");
    const productPrice = document.getElementById("productPrice");
    const buyNowBtn = document.getElementById("buyNowBtn");
    const chatMessages = document.getElementById("chatMessages");
    const usernameInput = document.getElementById("usernameInput");
    const chatInput = document.getElementById("chatInput");
    const sendChatBtn = document.getElementById("sendChatBtn");
    const bidsList = document.getElementById("bidsList");
    const bidAmount = document.getElementById("bidAmount");
    const placeBidBtn = document.getElementById("placeBidBtn");

    let ws = null;
    let username = "Anonymous";

    function getWsUrl() {
        const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
        return `${protocol}//${window.location.host}/ws`;
    }

    function connect() {
        ws = new WebSocket(getWsUrl());
        const u = usernameInput.value.trim() || "Anonymous";
        username = u;

        ws.onopen = () => {
            window._activeWs = ws;
            ws.send(JSON.stringify({
                type: "join",
                role: "viewer",
                username: u
            }));
            window.dispatchEvent(new Event('wsReady'));
        };

        ws.onmessage = (event) => {
            try {
                const msg = JSON.parse(event.data);
                handleMessage(msg);
            } catch (e) {
                console.warn("Parse error:", e);
            }
        };

        ws.onclose = () => {
            setTimeout(connect, 1000);
        };

        ws.onerror = () => { };
    }

    function handleMessage(msg) {
        switch (msg.type) {
            case "frame":
                if (msg.data) {
                    streamImage.src = "data:image/jpeg;base64," + msg.data;
                    streamImage.style.display = "block";
                    placeholder.style.display = "none";
                }
                break;
            case "viewers":
                window.lastViewerCount = msg.count;
                viewerCount.textContent = formatViewers(msg.count);
                break;
            case "chat":
                appendChat(msg.username, msg.text);
                break;
            case "bid":
                appendBid(msg.username, msg.amount);
                break;
            case "price":
                window.lastCurrentPrice = msg.current;
                productPrice.textContent = "$" + msg.current;
                bidAmount.min = msg.current + 1;
                bidAmount.placeholder = "$" + (msg.current + 1);
                break;
            case "live_status":
                if (!msg.is_live) {
                    streamImage.style.display = "none";
                    streamImage.src = "";
                    placeholder.style.display = "flex";
                    placeholder.querySelector("p").textContent = window.t('waiting_stream');
                }
                break;
            case "you_are_banned":
                applyBanState(msg.banned);
                break;
        }
    }

    function applyBanState(isBanned) {
        const chatWrap = document.querySelector('.chat-input-wrap');
        const bidWrap = document.querySelector('.bid-input-wrap');
        if (isBanned) {
            // Disable chat
            chatInput.disabled = true;
            sendChatBtn.disabled = true;
            chatInput.placeholder = window.t('banned_chat_placeholder') || 'Ви заблоковані';
            // Disable bids
            bidAmount.disabled = true;
            placeBidBtn.disabled = true;
            buyNowBtn.disabled = true;
            // Show ban notice
            if (!document.getElementById('banNotice')) {
                const notice = document.createElement('div');
                notice.id = 'banNotice';
                notice.className = 'ban-notice';
                notice.textContent = window.t('ban_notice') || 'Вас заблоковано модератором. Чат та ставки недоступні.';
                chatWrap.parentElement.insertBefore(notice, chatWrap);
            }
        } else {
            chatInput.disabled = false;
            sendChatBtn.disabled = false;
            chatInput.placeholder = window.t('placeholder_chat') || 'Send a message...';
            bidAmount.disabled = false;
            placeBidBtn.disabled = false;
            buyNowBtn.disabled = false;
            const notice = document.getElementById('banNotice');
            if (notice) notice.remove();
        }
    }

    function formatViewers(n) {
        if (n >= 1000) {
            return (n / 1000).toFixed(1) + " " + window.t('k_viewers');
        }
        return n + " " + window.t('viewers');
    }

    function appendChat(name, text) {
        const el = document.createElement("div");
        el.className = "chat-message";
        el.innerHTML = `<span class="chat-username">${escapeHtml(name)}:</span> ${escapeHtml(text)}`;
        chatMessages.appendChild(el);
        chatMessages.scrollTop = chatMessages.scrollHeight;
    }

    function appendBid(name, amount) {
        const el = document.createElement("div");
        el.className = "bid-item";
        el.innerHTML = `<span class="bid-user">${escapeHtml(name)}</span> <span class="bid-amount">$${amount}</span>`;
        bidsList.insertBefore(el, bidsList.firstChild);
    }

    function escapeHtml(s) {
        const div = document.createElement("div");
        div.textContent = s;
        return div.innerHTML;
    }

    function sendChat() {
        const text = chatInput.value.trim();
        if (!text || !ws || ws.readyState !== WebSocket.OPEN) return;

        const u = usernameInput.value.trim() || "Anonymous";
        username = u;

        ws.send(JSON.stringify({
            type: "chat",
            username: u,
            text: text
        }));
        chatInput.value = "";
    }

    function sendBid() {
        if (!ws || ws.readyState !== WebSocket.OPEN) return;

        const val = parseInt(bidAmount.value, 10);
        if (isNaN(val) || val < 1) return;

        const u = usernameInput.value.trim() || "Anonymous";
        username = u;

        ws.send(JSON.stringify({
            type: "bid",
            username: u,
            amount: val
        }));
        bidAmount.value = "";
    }

    function sendBuyNow() {
        if (!ws || ws.readyState !== WebSocket.OPEN) return;

        const u = usernameInput.value.trim() || "Anonymous";
        username = u;

        ws.send(JSON.stringify({
            type: "buy_now",
            username: u
        }));
    }

    chatInput.addEventListener("keydown", (e) => {
        if (e.key === "Enter") sendChat();
    });
    sendChatBtn.addEventListener("click", sendChat);
    placeBidBtn.addEventListener("click", sendBid);
    buyNowBtn.addEventListener("click", sendBuyNow);

    var mainImage = document.getElementById("mainProductImage");
    var productTitle = document.getElementById("productTitle");
    document.querySelectorAll(".thumb").forEach(function (thumb) {
        thumb.addEventListener("click", function () {
            var src = this.getAttribute("src");
            var nameKey = this.getAttribute("data-name");
            mainImage.src = src;
            productTitle.textContent = window.t(nameKey);
            productTitle.setAttribute("data-i18n", nameKey);
            document.querySelectorAll(".thumb").forEach(function (t) {
                t.classList.remove("thumb-active");
            });
            this.classList.add("thumb-active");
        });
    });

    window.addEventListener('languageChanged', () => {
        if (window.lastViewerCount !== undefined) {
            viewerCount.textContent = formatViewers(window.lastViewerCount);
        }
        if (placeholder.style.display !== "none") {
            placeholder.querySelector("p").textContent = window.t('waiting_stream');
        }
        // update thumbnail titles
        var activeThumb = document.querySelector(".thumb-active");
        if (activeThumb) {
            productTitle.textContent = window.t(activeThumb.getAttribute("data-name"));
        }
    });

    connect();
})();
