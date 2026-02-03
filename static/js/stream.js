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
            ws.send(JSON.stringify({
                type: "join",
                role: "viewer",
                username: u
            }));
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

        ws.onerror = () => {};
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
                viewerCount.textContent = formatViewers(msg.count);
                break;
            case "chat":
                appendChat(msg.username, msg.text);
                break;
            case "bid":
                appendBid(msg.username, msg.amount);
                break;
            case "price":
                productPrice.textContent = "$" + msg.current;
                bidAmount.min = msg.current + 1;
                bidAmount.placeholder = "$" + (msg.current + 1);
                break;
            case "live_status":
                if (!msg.is_live) {
                    streamImage.style.display = "none";
                    streamImage.src = "";
                    placeholder.style.display = "flex";
                    placeholder.querySelector("p").textContent = "Ожидание стрима...";
                }
                break;
        }
    }

    function formatViewers(n) {
        if (n >= 1000) {
            return (n / 1000).toFixed(1) + "K viewers";
        }
        return n + " viewers";
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
            var name = this.getAttribute("data-name");
            mainImage.src = src;
            productTitle.textContent = name;
            document.querySelectorAll(".thumb").forEach(function (t) {
                t.classList.remove("thumb-active");
            });
            this.classList.add("thumb-active");
        });
    });

    connect();
})();
