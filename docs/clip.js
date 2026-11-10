/**
 * 与本机 Python 版 app.py 中 parse_clock / format_clock / parse_recipe / 规则提醒保持一致的纯逻辑。
 * 可在浏览器和 Node 里同时使用。
 */
(function (root, factory) {
  const api = factory();
  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }
  root.ClipLogic = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  const SAFE_NAME = /[^0-9A-Za-z\u4e00-\u9fff_-]+/g;

  function parseClock(value) {
    const text = String(value).trim();
    if (!text) throw new Error("时间不能为空");
    if (/^\d+(\.\d+)?$/.test(text)) return Number(text);
    const parts = text.split(":");
    const okPart = (p) => /^\d+$/.test(p.replace(".", ""));
    if (parts.length < 2 || parts.length > 3 || !parts.every(okPart)) {
      throw new Error("无法识别的时间：" + value);
    }
    const nums = parts.map(Number);
    if (nums.length === 2) return nums[0] * 60 + nums[1];
    return nums[0] * 3600 + nums[1] * 60 + nums[2];
  }

  function formatClock(seconds) {
    const total = Math.max(0, Math.round(Number(seconds) || 0));
    const h = Math.floor(total / 3600);
    const rem = total % 3600;
    const m = Math.floor(rem / 60);
    const s = rem % 60;
    const pad = (n) => String(n).padStart(2, "0");
    if (h) return pad(h) + ":" + pad(m) + ":" + pad(s);
    return pad(m) + ":" + pad(s);
  }

  function slugify(text, fallback) {
    const cleaned = String(text || "").replace(SAFE_NAME, "-").replace(/^-+|-+$/g, "");
    return (cleaned || fallback).slice(0, 40);
  }

  function clipWarnings(length, duration) {
    const warnings = [];
    if (length < 5) warnings.push("短于 5 秒，可能不符合 X 官方剪辑的最短时长");
    if (length > 60) warnings.push("超过 60 秒，可能不符合 X 官方剪辑的最长时长");
    if (duration > 0 && length > duration * 0.3 + 0.05) {
      warnings.push("超过原片的 30%，可能不符合 X 官方剪辑规则");
    }
    return warnings;
  }

  function validateClip(item, index, duration) {
    const title = String(item.title || "片段" + index).trim() || "片段" + index;
    const start = parseClock(item.start);
    const end = parseClock(item.end);
    if (end <= start) {
      throw new Error("片段「" + title + "」的结束时间必须大于开始时间");
    }
    if (start < 0 || end > duration + 0.25) {
      throw new Error("片段「" + title + "」超出了原片范围（" + formatClock(duration) + "）");
    }
    const length = end - start;
    return {
      index,
      title,
      start,
      end,
      length,
      point: item.point || "",
      recommend: Boolean(item.recommend),
      warnings: clipWarnings(length, duration),
      filename: "clip-" + String(index).padStart(2, "0") + "-" + slugify(title, "clip" + index) + ".mp4",
    };
  }

  const CLOCK_TOKEN = /(?:\d+:){0,2}\d+(?:\.\d+)?/;
  const SEP_LINE = new RegExp(
    "^\\s*(" + CLOCK_TOKEN.source + ")\\s*[-–—－~～到,]\\s*(" + CLOCK_TOKEN.source + ")\\s*(.*?)\\s*$"
  );
  const SPACE_LINE = new RegExp(
    "^\\s*(" + CLOCK_TOKEN.source + ")\\s+(" + CLOCK_TOKEN.source + ")\\s*(.*?)\\s*$"
  );
  const X_URL_RE = /https?:\/\/(?:www\.|mobile\.|m\.)?(?:x|twitter)\.com\/[^\s]+/i;
  const X_HOSTS = {
    "x.com": true,
    "www.x.com": true,
    "twitter.com": true,
    "www.twitter.com": true,
    "mobile.twitter.com": true,
    "m.twitter.com": true,
  };

  function looksLikeXUrl(text) {
    const raw = String(text || "").trim().replace(/[.,;，。；]+$/, "");
    if (!raw) return false;
    if (X_URL_RE.test(raw) && raw.split(/\s+/).length === 1) return true;
    try {
      const parsed = new URL(raw);
      return Boolean(X_HOSTS[(parsed.hostname || "").toLowerCase()] && /^https?:$/.test(parsed.protocol));
    } catch (err) {
      return false;
    }
  }

  function extractXUrl(text) {
    const match = String(text || "").match(X_URL_RE);
    return match ? match[0] : "";
  }

  function stripRecipeFences(text) {
    let raw = String(text || "").replace(/^\uFEFF/, "").trim();
    const fence = raw.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
    if (fence) raw = fence[1].trim();
    return raw;
  }

  function clockString(value) {
    if (typeof value === "number" && Number.isFinite(value)) {
      return Number.isInteger(value) ? String(value) : String(value);
    }
    return String(value).trim();
  }

  function normalizeClip(item, index) {
    if (!item || typeof item !== "object" || Array.isArray(item)) {
      throw new Error("第 " + index + " 段配方格式不对");
    }
    const start = clockString(item.start ?? item.from ?? item.begin ?? "");
    const end = clockString(item.end ?? item.to ?? item.stop ?? "");
    if (!start || !end) throw new Error("第 " + index + " 段缺少开始或结束时间");
    parseClock(start);
    parseClock(end);
    const title = String(item.title || item.name || "").trim();
    return {
      start,
      end,
      title: title || "",
      point: String(item.point || item.note || "").trim(),
      recommend: Boolean(item.recommend),
    };
  }

  function parseRecipeJson(raw) {
    let data;
    try {
      data = JSON.parse(raw);
    } catch (err) {
      throw new Error("配方不是有效的 JSON");
    }
    let meta = {};
    let items;
    if (Array.isArray(data)) {
      items = data;
    } else if (data && typeof data === "object") {
      meta = {
        title: data.title || "",
        author: data.author || "",
        source_url: data.source_url || data.url || data.source || "",
        note: data.note || "",
      };
      items = data.clips || data.segments;
      if (!Array.isArray(items)) {
        throw new Error("JSON 里没有 clips 列表");
      }
    } else {
      throw new Error("配方不是有效的 JSON");
    }
    if (!items.length) throw new Error("配方里没有片段");
    return {
      title: meta.title || "",
      author: meta.author || "",
      source_url: meta.source_url || "",
      note: meta.note || "",
      clips: items.map((item, i) => normalizeClip(item, i + 1)),
    };
  }

  function parseRecipeText(raw) {
    const lines = raw.split(/\r?\n/);
    const clips = [];
    let sourceUrl = "";
    lines.forEach((line, idx) => {
      const trimmed = line.trim();
      if (!trimmed) return;
      if (trimmed.startsWith("#") || trimmed.startsWith("//")) return;
      const url = extractXUrl(trimmed);
      if (url && (looksLikeXUrl(trimmed) || trimmed === url)) {
        sourceUrl = sourceUrl || url;
        return;
      }
      let match = trimmed.match(SEP_LINE) || trimmed.match(SPACE_LINE);
      if (!match) {
        throw new Error("无法识别第 " + (idx + 1) + " 行：" + trimmed + "。请写成 08:50-09:49 标题，或 2:28 3:28 标题。");
      }
      const start = match[1];
      const end = match[2];
      parseClock(start);
      parseClock(end);
      clips.push({
        start,
        end,
        title: (match[3] || "").trim(),
        point: "",
        recommend: false,
      });
    });
    if (!clips.length) {
      throw new Error("没有识别到时间戳。可以用 JSON，或每行写 08:50-09:49 标题。");
    }
    return { title: "", author: "", source_url: sourceUrl, note: "", clips };
  }

  function parseRecipe(text) {
    const raw = stripRecipeFences(text);
    if (!raw) throw new Error("配方是空的，请粘贴时间戳或 JSON");
    const tokens = raw.split(/\s+/);
    if (tokens.length === 1 && looksLikeXUrl(raw)) {
      const err = new Error("这是一条 X / Twitter 链接，不是时间戳配方。");
      err.code = "X_URL";
      err.url = extractXUrl(raw) || raw.trim();
      throw err;
    }
    if (raw.startsWith("{") || raw.startsWith("[")) return parseRecipeJson(raw);
    return parseRecipeText(raw);
  }

  function escapeHtml(text) {
    return String(text)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  return {
    parseClock,
    formatClock,
    slugify,
    clipWarnings,
    validateClip,
    escapeHtml,
    looksLikeXUrl,
    extractXUrl,
    parseRecipe,
  };
});
