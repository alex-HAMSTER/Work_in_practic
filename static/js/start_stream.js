(function () {
    const video = document.getElementById("localVideo");
    const canvas = document.getElementById("captureCanvas");
    const ctx = canvas.getContext("2d");
    const startBtn = document.getElementById("startBtn");
    const stopBtn = document.getElementById("stopBtn");
    const statusEl = document.getElementById("status");

    let stream = null;
    let ws = null;
    let captureInterval = null;
    const FPS = 60;
    const INTERVAL_MS = 1000 / FPS;
    console.log("INTERVAL_MS", INTERVAL_MS);

    function getWsUrl() {
        const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
        return `${protocol}//${window.location.host}/ws`;
    }

    function setStatus(tokenKey, fallback) {
        statusEl.setAttribute("data-i18n", tokenKey);
        statusEl.textContent = window.t(tokenKey) || fallback;
    }

    async function startStream() {
        try {
            stream = await navigator.mediaDevices.getUserMedia({ video: true });
            video.srcObject = stream;
            setStatus("status_connecting", "Камера включена. Подключаюсь к серверу...");

            ws = new WebSocket(getWsUrl());

            ws.onopen = () => {
                ws.send(JSON.stringify({ type: "join", role: "streamer" }));
                setStatus("status_live", "Стрим идёт! Зрители видят ваше видео.");
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

            ws.onerror = () => setStatus("status_ws_error", "Ошибка WebSocket");
            ws.onclose = () => {
                stopCapture();
                setStatus("status_ws_closed", "Соединение закрыто");
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
        startBtn.style.display = "inline-block";
        stopBtn.style.display = "none";
        setStatus("status_stopped", "Стрим остановлен. Нажмите «Запустить стрим» снова.");
    }

    startBtn.addEventListener("click", startStream);
    stopBtn.addEventListener("click", stopStream);

    window.addEventListener('languageChanged', () => {
        if (statusEl.hasAttribute("data-i18n")) {
            statusEl.textContent = window.t(statusEl.getAttribute("data-i18n"));
        }
    });

})();
