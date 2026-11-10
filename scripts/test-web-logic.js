#!/usr/bin/env node
/**
 * Compare docs/clip.js with the Python parse_clock / format_clock / warning rules in app.py.
 */
const { spawnSync } = require("child_process");
const path = require("path");
const assert = require("assert");

const root = path.resolve(__dirname, "..");
const logic = require(path.join(root, "docs", "clip.js"));

const cases = [
  ["0", 0],
  ["5", 5],
  ["5.25", 5.25],
  ["60", 60],
  ["90", 90],
  ["08:50", 8 * 60 + 50],
  ["09:49", 9 * 60 + 49],
  ["02:28", 2 * 60 + 28],
  ["00:00", 0],
  ["1:02.5", 62.5],
  ["01:02.5", 62.5],
  ["1:02:03", 3723],
  ["01:02:03", 3723],
  ["00:00:05.25", 5.25],
  ["13:36", 13 * 60 + 36],
  ["14:33", 14 * 60 + 33],
];

const invalid = ["", "  ", "abc", "1:2:3:4", "01:xx", "1.2.3", "-5", "1:2:3:4.5"];

function py(expr) {
  const result = spawnSync("python3", ["-c", expr], {
    cwd: root,
    encoding: "utf8",
  });
  if (result.status !== 0) {
    throw new Error(result.stderr || result.stdout || "python failed");
  }
  return result.stdout.trim();
}

const importApp = "import sys; sys.path.insert(0, '.'); from app import parse_clock, format_clock, cut_clips\n";

let failed = 0;
function check(name, fn) {
  try {
    fn();
    console.log("ok  " + name);
  } catch (err) {
    failed += 1;
    console.error("FAIL " + name + ": " + (err && err.message));
  }
}

for (const [input, expected] of cases) {
  check("parseClock " + JSON.stringify(input), () => {
    const js = logic.parseClock(input);
    assert.strictEqual(js, expected);
    const pyVal = Number(py(importApp + `print(parse_clock(${JSON.stringify(input)}))`));
    assert.strictEqual(js, pyVal);
  });
}

for (const input of invalid) {
  check("parseClock rejects " + JSON.stringify(input), () => {
    let jsThrew = false;
    try { logic.parseClock(input); } catch (e) { jsThrew = true; }
    assert.ok(jsThrew, "js should throw");
    const result = spawnSync("python3", ["-c", importApp + `parse_clock(${JSON.stringify(input)})`], {
      cwd: root,
      encoding: "utf8",
    });
    assert.notStrictEqual(result.status, 0, "python should throw");
  });
}

for (const seconds of [0, 4.4, 5, 59.4, 59.5, 60, 90, 3600, 3661, 13 * 60 + 36]) {
  check("formatClock " + seconds, () => {
    const js = logic.formatClock(seconds);
    const pyVal = py(importApp + `print(format_clock(${seconds}))`);
    assert.strictEqual(js, pyVal);
  });
}

check("slugify matches python-style cleanup", () => {
  assert.strictEqual(logic.slugify("镜像猎杀", "x"), "镜像猎杀");
  assert.strictEqual(logic.slugify("Hello, World!", "x"), "Hello-World");
  assert.strictEqual(logic.slugify("@@@", "clip1"), "clip1");
  assert.strictEqual(logic.slugify("a".repeat(50), "x").length, 40);
});

check("warnings under 5s / over 60s / over 30%", () => {
  const duration = 200;
  assert.deepStrictEqual(logic.clipWarnings(4.9, duration), [
    "短于 5 秒，可能不符合 X 官方剪辑的最短时长",
  ]);
  assert.deepStrictEqual(logic.clipWarnings(61, duration), [
    "超过 60 秒，可能不符合 X 官方剪辑的最长时长",
    "超过原片的 30%，可能不符合 X 官方剪辑规则",
  ]);
  assert.deepStrictEqual(logic.clipWarnings(30, duration), []);
  assert.deepStrictEqual(logic.clipWarnings(60, 200), []);
  // 30% of 200 is 60; threshold is duration * 0.3 + 0.05 = 60.05
  assert.deepStrictEqual(logic.clipWarnings(60.06, 200), [
    "超过 60 秒，可能不符合 X 官方剪辑的最长时长",
    "超过原片的 30%，可能不符合 X 官方剪辑规则",
  ]);
});

check("validateClip example recipe against a 15-minute source", () => {
  const duration = 15 * 60;
  const clips = [
    { title: "成绩单", start: "02:28", end: "03:28" },
    { title: "镜像猎杀", start: "08:50", end: "09:49", recommend: true },
  ];
  const a = logic.validateClip(clips[0], 1, duration);
  assert.strictEqual(a.length, 60);
  assert.deepStrictEqual(a.warnings, []);
  assert.strictEqual(a.filename, "clip-01-成绩单.mp4");
  const b = logic.validateClip(clips[1], 2, duration);
  assert.strictEqual(b.recommend, true);
  assert.ok(b.length < 60 && b.length > 50);
});

check("validateClip rejects inverted or out-of-range times", () => {
  let threw = false;
  try { logic.validateClip({ start: "03:00", end: "02:00", title: "x" }, 1, 200); } catch (e) {
    threw = /结束时间必须大于开始时间/.test(e.message);
  }
  assert.ok(threw);
  threw = false;
  try { logic.validateClip({ start: "00:00", end: "05:00", title: "x" }, 1, 60); } catch (e) {
    threw = /超出了原片范围/.test(e.message);
  }
  assert.ok(threw);
});

check("relative site paths do not start with /", () => {
  const fs = require("fs");
  const html = fs.readFileSync(path.join(root, "docs", "index.html"), "utf8");
  assert.doesNotMatch(html, /src="\//);
  assert.doesNotMatch(html, /href="\/(?!\/)/);
  assert.match(html, /src="vendor\/ffmpeg\.js"/);
  assert.match(html, /src="clip\.js"/);
  assert.match(html, /src="app\.js"/);
  const app = fs.readFileSync(path.join(root, "docs", "app.js"), "utf8");
  assert.match(app, /examples\/dwarkesh-clocktower\.json/);
  assert.doesNotMatch(app, /fetch\("\//);
  assert.match(app, /CORE_VERSION = "0\.12\.10"/);
  assert.match(app, /@ffmpeg\/core@\$\{CORE_VERSION\}/);
  assert.match(app, /core-mt/);
  assert.match(app, /-ss/);
  assert.match(app, /libx264/);
  assert.match(app, /veryfast/);
  assert.match(app, /\+faststart/);
  assert.doesNotMatch(app, /-c copy/);
});

if (failed) {
  console.error("\n" + failed + " check(s) failed");
  process.exit(1);
}
console.log("\nall checks passed");
