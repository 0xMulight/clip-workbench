/**
 * 与本机 Python 版 app.py 中 parse_clock / format_clock / 规则提醒保持一致的纯逻辑。
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
  };
});
