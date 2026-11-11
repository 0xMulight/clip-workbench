(() => {
  "use strict";

  /**
   * 剪辑方案（必须用单线程核心）：
   * - @ffmpeg/ffmpeg 0.12.15（本目录 vendor/，避免跨域 Worker）
   * - @ffmpeg/core 0.12.10 官方单线程核心（CDN）
   * GitHub Pages 无法设置 COOP/COEP，多线程 @ffmpeg/core-mt 需要 SharedArrayBuffer，会失败。
   * 官方文档：https://ffmpegwasm.netlify.app/docs/overview
   *           https://ffmpegwasm.netlify.app/docs/getting-started/usage
   */
  const CORE_VERSION = "0.12.10";
  const CORE_CDNS = [
    `https://cdn.jsdelivr.net/npm/@ffmpeg/core@${CORE_VERSION}/dist/umd`,
    `https://unpkg.com/@ffmpeg/core@${CORE_VERSION}/dist/umd`,
  ];
  const WASM_HINT_BYTES = 32232419;

  const { parseClock, formatClock, validateClip, escapeHtml, parseRecipe, looksLikeXUrl, extractXUrl } = ClipLogic;

  const state = {
    file: null,
    fileBuffer: null,
    duration: 0,
    sourceUrl: null,
    ffmpeg: null,
    loading: null,
    lastLog: "",
    resultUrls: [],
  };

  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => [...el.querySelectorAll(s)];

  function ensureTrailingSlash() {
    if (location.protocol === "file:") return;
    const path = location.pathname;
    if (!path.endsWith("/") && !path.split("/").pop().includes(".")) {
      location.replace(path + "/" + location.search + location.hash);
    }
  }
  ensureTrailingSlash();

  function setEngineStatus(kind, text, percent) {
    const el = $("#engine-status");
    el.className = "status " + (kind || "");
    el.textContent = text;
    const bar = $("#engine-bar");
    const fill = $("#engine-bar-fill");
    if (percent == null) {
      bar.classList.add("hidden");
      fill.style.width = "0%";
    } else {
      bar.classList.remove("hidden");
      fill.style.width = Math.max(0, Math.min(100, percent)) + "%";
    }
  }

  function setHint(text, kind) {
    const el = $("#hint");
    el.textContent = text;
    el.className = "hint" + (kind ? " " + kind : "");
  }

  async function toBlobURL(url, mimeType, onProgress) {
    const res = await fetch(url);
    if (!res.ok) {
      throw new Error(`下载失败（HTTP ${res.status}）：${url}`);
    }
    const total = parseInt(res.headers.get("Content-Length") || "0", 10);
    if (!res.body) {
      const buf = await res.arrayBuffer();
      if (onProgress) onProgress({ received: buf.byteLength, total: total || buf.byteLength });
      return URL.createObjectURL(new Blob([buf], { type: mimeType }));
    }
    const reader = res.body.getReader();
    const chunks = [];
    let received = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value);
      received += value.length;
      if (onProgress) onProgress({ received, total });
    }
    const buf = new Uint8Array(received);
    let offset = 0;
    for (const chunk of chunks) {
      buf.set(chunk, offset);
      offset += chunk.length;
    }
    if (onProgress) onProgress({ received, total: total || received });
    return URL.createObjectURL(new Blob([buf], { type: mimeType }));
  }

  function formatBytes(n) {
    if (!n || n < 0) return "";
    if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
    return `${(n / (1024 * 1024)).toFixed(1)} MB`;
  }

  async function loadFromCdn(base, label) {
    setEngineStatus("loading", `正在从 ${label} 下载剪辑引擎脚本…`, 1);
    const coreURL = await toBlobURL(`${base}/ffmpeg-core.js`, "text/javascript", ({ received, total }) => {
      const t = total || received;
      const pct = t ? Math.min(8, (received / t) * 8) : 2;
      setEngineStatus(
        "loading",
        `正在下载剪辑引擎脚本… ${formatBytes(received)}${total ? " / " + formatBytes(total) : ""}`,
        pct
      );
    });
    setEngineStatus("loading", "正在下载剪辑引擎（约 32 MB，只需加载一次）…", 8);
    const wasmURL = await toBlobURL(`${base}/ffmpeg-core.wasm`, "application/wasm", ({ received, total }) => {
      const t = total || WASM_HINT_BYTES;
      const pct = 8 + Math.min(90, (received / t) * 90);
      setEngineStatus(
        "loading",
        `正在下载剪辑引擎（约 32 MB）… ${formatBytes(received)} / ${formatBytes(t)}`,
        pct
      );
    });
    return { coreURL, wasmURL };
  }

  async function loadEngine() {
    if (state.ffmpeg && state.ffmpeg.loaded) return state.ffmpeg;
    if (state.loading) return state.loading;

    state.loading = (async () => {
      if (typeof FFmpegWASM === "undefined" || !FFmpegWASM.FFmpeg) {
        throw new Error("未能加载本地剪辑脚本 vendor/ffmpeg.js，请检查网络或刷新页面。");
      }
      let lastError = null;
      for (const base of CORE_CDNS) {
        const label = base.includes("jsdelivr") ? "jsDelivr" : "unpkg";
        const ffmpeg = new FFmpegWASM.FFmpeg();
        ffmpeg.on("log", ({ message }) => {
          if (message) state.lastLog = message;
        });
        try {
          const urls = await loadFromCdn(base, label);
          setEngineStatus("loading", "正在初始化剪辑引擎…", 96);
          await ffmpeg.load(urls);
          state.ffmpeg = ffmpeg;
          setEngineStatus("ok", "剪辑引擎已就绪。视频只会在你的浏览器里处理，不会上传到服务器。", 100);
          setTimeout(() => {
            const bar = $("#engine-bar");
            if (state.ffmpeg && state.ffmpeg.loaded) bar.classList.add("hidden");
          }, 800);
          return ffmpeg;
        } catch (err) {
          lastError = err;
          console.warn(`从 ${label} 加载失败`, err);
          try { ffmpeg.terminate(); } catch (_) {}
        }
      }
      throw lastError || new Error("剪辑引擎加载失败");
    })();

    try {
      return await state.loading;
    } catch (err) {
      state.loading = null;
      const message = readableError(err, "剪辑引擎加载失败。请检查网络后刷新，或点「重新加载引擎」。");
      setEngineStatus("bad", message, null);
      throw err;
    }
  }

  function readableError(err, fallback) {
    const raw = (err && (err.message || String(err))) || "";
    if (!raw) return fallback;
    if (/Failed to fetch|NetworkError|Load failed|ERR_INTERNET/i.test(raw)) {
      return "网络出错，剪辑引擎（约 32 MB）没能下载完整。请检查网络后重试。";
    }
    if (/SharedArrayBuffer|cross-origin isolated|COOP|COEP/i.test(raw)) {
      return "当前页面环境不支持多线程剪辑。本站已使用单线程引擎，若仍看到这条提示，请刷新后再试。";
    }
    if (/memory|out of memory|OOM|Cannot enlarge memory/i.test(raw)) {
      return "浏览器内存不够，换一段更短或分辨率更低的视频再试。";
    }
    if (/ffmpeg is not loaded/i.test(raw)) {
      return "剪辑引擎还没就绪，请等加载完成后再剪，或点「重新加载引擎」。";
    }
    return raw;
  }

  function addRow(clip = {}) {
    const tr = document.createElement("tr");
    const point = escapeHtml(clip.point || "");
    tr.innerHTML = `
      <td><input class="start" placeholder="08:50" value="${escapeHtml(clip.start || "")}"></td>
      <td><input class="end" placeholder="09:49" value="${escapeHtml(clip.end || "")}"></td>
      <td><input class="title" placeholder="标题" value="${escapeHtml(clip.title || "")}" data-point="${point}"></td>
      <td class="check"><input class="rec" type="checkbox" ${clip.recommend ? "checked" : ""}></td>
    `;
    $("#rows").appendChild(tr);
  }

  function readClips() {
    return $$("#rows tr")
      .map((tr) => ({
        start: $(".start", tr).value.trim(),
        end: $(".end", tr).value.trim(),
        title: $(".title", tr).value.trim(),
        point: $(".title", tr).dataset.point || "",
        recommend: $(".rec", tr).checked,
      }))
      .filter((c) => c.start && c.end);
  }

  function revokeSource() {
    if (state.sourceUrl) {
      URL.revokeObjectURL(state.sourceUrl);
      state.sourceUrl = null;
    }
  }

  function revokeResults() {
    for (const url of state.resultUrls) URL.revokeObjectURL(url);
    state.resultUrls = [];
  }

  function showSource(file, duration, url) {
    state.file = file;
    state.duration = duration;
    state.fileBuffer = null;
    revokeSource();
    state.sourceUrl = url;
    $("#source-box").classList.remove("hidden");
    $("#editor").classList.remove("hidden");
    const video = $("#source-video");
    video.src = url;
    $("#source-meta").textContent = `${file.name} · ${formatClock(duration)} · ${formatBytes(file.size)}`;
  }

  function readDuration(file) {
    return new Promise((resolve, reject) => {
      const url = URL.createObjectURL(file);
      const video = document.createElement("video");
      video.preload = "metadata";
      const cleanupFail = () => URL.revokeObjectURL(url);
      video.onloadedmetadata = () => {
        const duration = video.duration;
        if (!Number.isFinite(duration) || duration <= 0) {
          cleanupFail();
          reject(new Error("读不到这段视频的准确时长。请换成常见的 MP4 或 WebM 再试。"));
          return;
        }
        resolve({ duration, url });
      };
      video.onerror = () => {
        cleanupFail();
        reject(new Error("浏览器无法读取这段视频。请改用常见的 MP4 或 WebM。"));
      };
      video.src = url;
    });
  }

  async function handleFile(file) {
    if (!file) return;
    setHint("正在读取视频信息…");
    try {
      const { duration, url } = await readDuration(file);
      showSource(file, duration, url);
      if (!$$("#rows tr").length) addRow();
      setHint("视频已在本地打开，不会上传。核对时间戳后点「开始剪辑」。");
    } catch (err) {
      setHint(readableError(err, "无法读取这段视频。"), "bad");
    }
  }

  const fileInput = $("#file");
  $("#pick-btn").addEventListener("click", () => fileInput.click());
  fileInput.addEventListener("change", () => {
    const file = fileInput.files && fileInput.files[0];
    handleFile(file);
  });

  const drop = $("#drop");
  ["dragenter", "dragover"].forEach((type) => {
    drop.addEventListener(type, (e) => {
      e.preventDefault();
      drop.classList.add("over");
    });
  });
  ["dragleave", "drop"].forEach((type) => {
    drop.addEventListener(type, (e) => {
      e.preventDefault();
      if (type === "dragleave" && e.target !== drop) return;
      drop.classList.remove("over");
    });
  });
  drop.addEventListener("drop", (e) => {
    const file = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
    if (file) handleFile(file);
  });

  $("#add-row").addEventListener("click", () => addRow());

  const X_GUIDE = "公开网页没法直接下载推特视频。请先把原片保存到电脑再上传。若要粘贴链接后自动下载并按配方拼接，请用本机版：双击「启动沐光切片.bat」，或运行 python app.py。";

  function flashXCallout() {
    const el = $("#x-callout");
    el.classList.add("flash");
    el.scrollIntoView({ behavior: "smooth", block: "nearest" });
    setTimeout(() => el.classList.remove("flash"), 1600);
  }

  function applyRecipe(data, message) {
    $("#rows").innerHTML = "";
    (data.clips || []).forEach(addRow);
    $("#editor").classList.remove("hidden");
    if (data.source_url) {
      $("#x-url").value = data.source_url;
    }
    const count = (data.clips || []).length;
    let text = message || `已导入 ${count} 段时间戳。`;
    if (data.source_url) {
      text += " " + X_GUIDE;
    }
    setHint(text, data.source_url ? "bad" : "");
    if (data.source_url) flashXCallout();
  }

  function importRecipeText(text) {
    try {
      const data = parseRecipe(text);
      applyRecipe(data);
      return true;
    } catch (err) {
      if (err && err.code === "X_URL") {
        const url = err.url || extractXUrl(text);
        if (url) $("#x-url").value = url;
        flashXCallout();
        setHint(X_GUIDE, "bad");
        return false;
      }
      setHint(err.message || "无法识别这份配方。", "bad");
      return false;
    }
  }

  $("#import-recipe").addEventListener("click", () => {
    const text = $("#recipe").value;
    if (!text.trim()) {
      setHint("请先把配方粘贴到上面的文本框，或点「加载示例配方」。", "bad");
      return;
    }
    importRecipeText(text);
  });

  $("#example-btn").addEventListener("click", async () => {
    setHint("正在加载示例配方…");
    try {
      const res = await fetch("examples/dwarkesh-clocktower.json");
      if (!res.ok) throw new Error("加载示例失败（HTTP " + res.status + "）");
      const data = parseRecipe(await res.text());
      $("#recipe").value = JSON.stringify(
        { title: data.title, author: data.author, source_url: data.source_url, note: data.note, clips: data.clips },
        null,
        2
      );
      applyRecipe(data, "已填入 Dwarkesh 那条视频的 5 个时间戳。请自行上传对应原片后再剪辑，仓库里不含视频文件。");
    } catch (err) {
      setHint(readableError(err, "加载示例失败。若你是直接打开 HTML 文件，请改用本地静态服务器或 GitHub Pages。"), "bad");
    }
  });

  $("#recipe-file-btn").addEventListener("click", () => $("#recipe-file").click());
  $("#recipe-file").addEventListener("change", async () => {
    const file = $("#recipe-file").files && $("#recipe-file").files[0];
    $("#recipe-file").value = "";
    if (!file) return;
    try {
      const text = await file.text();
      $("#recipe").value = text;
      importRecipeText(text);
    } catch (err) {
      setHint(readableError(err, "无法读取这个配方文件。"), "bad");
    }
  });

  $("#x-form").addEventListener("submit", (e) => {
    e.preventDefault();
    const value = $("#x-url").value.trim();
    if (!value) {
      flashXCallout();
      setHint(X_GUIDE, "bad");
      return;
    }
    if (looksLikeXUrl(value) || extractXUrl(value)) {
      const url = extractXUrl(value) || value;
      $("#x-url").value = url;
      flashXCallout();
      setHint(X_GUIDE, "bad");
      return;
    }
    setHint("请填写完整的 x.com 或 twitter.com 帖子链接。公开网页不会去下载它，只会提示你改用本机版或自行上传原片。", "bad");
    flashXCallout();
  });

  $("#reload-engine").addEventListener("click", () => {
    if (state.ffmpeg) {
      try { state.ffmpeg.terminate(); } catch (_) {}
      state.ffmpeg = null;
    }
    state.loading = null;
    setEngineStatus("loading", "正在重新加载剪辑引擎…", 0);
    loadEngine().catch(() => {});
  });

  function sourceExt(file) {
    const name = (file && file.name) || "source.mp4";
    const dot = name.lastIndexOf(".");
    const ext = dot >= 0 ? name.slice(dot).toLowerCase() : "";
    if (/^\.(mp4|webm|mov|mkv|m4v|avi|mpeg|mpg|wmv|ogv)$/.test(ext)) return ext;
    return ".mp4";
  }

  async function getSourceBuffer(file) {
    if (state.fileBuffer && state.file === file) return state.fileBuffer;
    const buf = new Uint8Array(await file.arrayBuffer());
    state.fileBuffer = buf;
    return buf;
  }

  const ENCODE_ARGS = [
    "-c:v", "libx264",
    "-preset", "veryfast",
    "-crf", "20",
    "-c:a", "aac",
    "-b:a", "128k",
    "-ar", "44100",
    "-ac", "2",
    "-movflags", "+faststart",
  ];

  async function runFfmpeg(ffmpeg, args, onProgress) {
    if (onProgress) ffmpeg.on("progress", onProgress);
    state.lastLog = "";
    try {
      return await ffmpeg.exec(args);
    } finally {
      if (onProgress) ffmpeg.off("progress", onProgress);
    }
  }

  async function concatSegments(ffmpeg, names, outName) {
    const list = names.map((name) => "file '" + name + "'").join("\n") + "\n";
    await ffmpeg.writeFile("concat.txt", list);
    const copyArgs = ["-f", "concat", "-safe", "0", "-i", "concat.txt", "-c", "copy", "-movflags", "+faststart", outName];
    let code = await runFfmpeg(ffmpeg, copyArgs);
    if (code !== 0) {
      try { await ffmpeg.deleteFile(outName); } catch (_) {}
      const encodeArgs = ["-f", "concat", "-safe", "0", "-i", "concat.txt", ...ENCODE_ARGS, outName];
      code = await runFfmpeg(ffmpeg, encodeArgs, ({ progress }) => {
        const pct = Math.max(0, Math.min(99, Math.round((progress || 0) * 100)));
        setHint(`正在拼接亮点片… ${pct}%`);
      });
    }
    try { await ffmpeg.deleteFile("concat.txt"); } catch (_) {}
    if (code !== 0) {
      throw new Error("拼接失败" + (state.lastLog ? "：" + state.lastLog : ""));
    }
  }

  async function runCut(stitch) {
    const clips = readClips();
    if (!state.file) {
      setHint("请先上传一段本地视频。公开网页不能直接下载推特链接里的片子。", "bad");
      return;
    }
    if (!clips.length) {
      setHint("请至少填写或导入一段开始和结束时间。支持 ss、mm:ss 或 hh:mm:ss。", "bad");
      return;
    }

    let prepared;
    try {
      prepared = clips.map((c, i) => validateClip(c, i + 1, state.duration));
    } catch (err) {
      setHint(err.message || "时间戳有误。", "bad");
      return;
    }

    const buttons = [$("#cut-btn"), $("#stitch-btn")];
    buttons.forEach((btn) => { btn.disabled = true; });
    setHint("正在准备剪辑引擎…");
    try {
      const ffmpeg = await loadEngine();
      if (!ffmpeg.loaded) throw new Error("剪辑引擎还没就绪");

      const inputName = "source" + sourceExt(state.file);
      setHint("正在把视频读入剪辑引擎（只留在浏览器内存里）…");
      const data = await getSourceBuffer(state.file);
      await ffmpeg.writeFile(inputName, data);

      revokeResults();
      const results = [];
      const segNames = [];
      for (const clip of prepared) {
        const outName = "seg-" + String(clip.index).padStart(2, "0") + ".mp4";
        setHint(`正在剪辑 ${clip.index}/${prepared.length}：${clip.title}…`);
        const onProgress = ({ progress }) => {
          const pct = Math.max(0, Math.min(99, Math.round((progress || 0) * 100)));
          setHint(`正在剪辑 ${clip.index}/${prepared.length}：${clip.title}… ${pct}%`);
        };
        const code = await runFfmpeg(ffmpeg, [
          "-ss", clip.start.toFixed(3),
          "-to", clip.end.toFixed(3),
          "-i", inputName,
          ...ENCODE_ARGS,
          outName,
        ], onProgress);
        if (code !== 0) {
          throw new Error(
            `剪辑「${clip.title}」失败（退出码 ${code}）` +
              (state.lastLog ? "：" + state.lastLog : "")
          );
        }
        const output = await ffmpeg.readFile(outName);
        const blob = new Blob([output], { type: "video/mp4" });
        const url = URL.createObjectURL(blob);
        state.resultUrls.push(url);
        results.push({
          ...clip,
          startLabel: formatClock(clip.start),
          endLabel: formatClock(clip.end),
          seconds: Math.round(clip.length * 100) / 100,
          url,
        });
        segNames.push(outName);
      }

      let highlight = null;
      if (stitch) {
        setHint("正在按配方顺序拼接亮点片…");
        const outName = "highlight.mp4";
        if (segNames.length === 1) {
          await concatSegments(ffmpeg, segNames, outName);
        } else {
          await concatSegments(ffmpeg, segNames, outName);
        }
        const output = await ffmpeg.readFile(outName);
        const blob = new Blob([output], { type: "video/mp4" });
        const url = URL.createObjectURL(blob);
        state.resultUrls.push(url);
        const expected = results.reduce((sum, c) => sum + c.seconds, 0);
        highlight = {
          title: "亮点拼接",
          seconds: Math.round(expected * 100) / 100,
          url,
          filename: "highlight.mp4",
        };
        try { await ffmpeg.deleteFile(outName); } catch (_) {}
      }

      for (const name of segNames) {
        try { await ffmpeg.deleteFile(name); } catch (_) {}
      }
      try { await ffmpeg.deleteFile(inputName); } catch (_) {}

      renderResults(results, highlight);
      if (highlight) {
        setHint(`已切出 ${results.length} 个片段，并拼成一条约 ${highlight.seconds} 秒的亮点片，可预览和下载。`);
      } else {
        setHint(`已切出 ${results.length} 个片段，可在页面里预览和下载。若要合成一条，请点「开始剪辑并拼接」。`);
      }
    } catch (err) {
      setHint(readableError(err, "剪辑失败。"), "bad");
    } finally {
      buttons.forEach((btn) => { btn.disabled = false; });
    }
  }

  $("#cut-btn").addEventListener("click", () => runCut(false));
  $("#stitch-btn").addEventListener("click", () => runCut(true));

  function renderResults(clips, highlight) {
    const highlightCard = highlight ? `
        <article class="card highlight">
          <div class="media">
            <video controls preload="metadata" src="${highlight.url}"></video>
          </div>
          <div class="body">
            <div class="meta-line">
              <span>亮点拼接</span>
              <span>${clips.length} 段按配方顺序合成</span>
              <span>约 ${highlight.seconds} 秒</span>
            </div>
            <h3>${escapeHtml(highlight.title)}</h3>
            <p class="point">这是按时间戳切出后再拼接的普通 MP4，不会自动带「Clip from」署名。</p>
            <div class="download">
              <a class="btn" href="${highlight.url}" download="${escapeHtml(highlight.filename)}">下载拼接片</a>
            </div>
          </div>
        </article>` : "";
    const cards = clips
      .map((c) => `
        <article class="card${c.recommend ? " feat" : ""}">
          <div class="media">
            <video controls preload="metadata" src="${c.url}"></video>
          </div>
          <div class="body">
            <div class="meta-line">
              <span>片段 ${c.index}</span>
              <span>${escapeHtml(c.startLabel)}–${escapeHtml(c.endLabel)}</span>
              <span>${c.seconds} 秒</span>
              ${c.recommend ? '<span class="badge">建议先发</span>' : ""}
            </div>
            <h3>${escapeHtml(c.title)}</h3>
            ${c.point ? `<p class="point">${escapeHtml(c.point)}</p>` : ""}
            ${(c.warnings || []).map((w) => `<p class="warn">${escapeHtml(w)}</p>`).join("")}
            <div class="download">
              <a class="btn" href="${c.url}" download="${escapeHtml(c.filename)}">下载这段</a>
            </div>
          </div>
        </article>
      `)
      .join("");
    $("#results").innerHTML = `<h2>剪辑结果</h2><div class="grid">${highlightCard}${cards}</div>`;
  }

  loadEngine().catch(() => {});
})();
