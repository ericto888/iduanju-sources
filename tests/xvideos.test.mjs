import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import vm from "node:vm";

const pluginPath = fileURLToPath(new URL("../sources/com.eric.idj.xvideos/main.js", import.meta.url));
const pluginSource = readFileSync(pluginPath, "utf8").replace("export default {", "module.exports = {");

function loadPlugin(html) {
  const context = {
    module: { exports: {} },
    host: {
      error: (code, message) => Object.assign(new Error(message), { code }),
      http: { request: async ({ url }) => ({ status: 200, url, body: html }) },
      log: () => {}
    }
  };
  vm.runInNewContext(pluginSource, context, { filename: "xvideos-main.js" });
  return context.module.exports;
}

test("extracts HLS, high and low streams and excludes the watch-page path", async () => {
  const html = [
    "html5player.setVideoURL('/video.fixture123/sample');",
    "html5player.setVideoHLS('https://cdn.example/master.m3u8?sig=abc');",
    "html5player.setVideoUrlHigh('https://cdn.example/1080p.mp4?sig=high');",
    "html5player.setVideoUrlLow('https://cdn.example/480p.mp4?sig=low');"
  ].join("");
  const result = await loadPlugin(html).play({ episodeId: "/video.fixture123/sample" });
  assert.deepEqual(Array.from(result.streams, stream => stream.name), ["自动（HLS）", "1080P", "480P"]);
  assert.deepEqual(Array.from(result.streams, stream => stream.format), ["hls", "mp4", "mp4"]);
  assert.equal(result.streams.some(stream => stream.url.includes("/video.fixture123/")), false);
});

test("preserves percent-encoded signed URL parameters", async () => {
  const html = "html5player.setVideoUrlHigh('https://cdn.example/video.mp4?token=a%2Fb%2Bc');";
  const result = await loadPlugin(html).play({ episodeId: "/video.fixture123/sample" });
  assert.equal(result.streams.length, 1);
  assert.equal(result.streams[0].url, "https://cdn.example/video.mp4?token=a%2Fb%2Bc");
  assert.equal(result.streams[0].name, "高清线路");
});

test("supports escaped slashes and escaped ampersands", async () => {
  const html = String.raw`html5player.setVideoUrlHigh("https:\/\/cdn.example\/hd.mp4?token=a\\u0026quality=1080p");`;
  const result = await loadPlugin(html).play({ episodeId: "/video.fixture123/sample" });
  assert.equal(result.streams.length, 1);
  assert.equal(result.streams[0].url, "https://cdn.example/hd.mp4?token=a&quality=1080p");
  assert.equal(result.streams[0].name, "1080P");
});
