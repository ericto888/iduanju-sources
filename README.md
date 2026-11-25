# iDuanJu 站源商店

这是 iDuanJu（i短剧）的社区站源目录仓库，**只分发符合 idj1 规范的 JavaScript 插件**。

- 客户端目录：[`index.json`](./index.json)
- 插件规范：[iDuanJu idj1 插件规范](https://github.com/ericto888/iDuanJu/blob/main/docs/plugins/SPEC_ZH.md)
- 插件目录：`sources/<plugin-id>/manifest.json` 和 manifest 指定的入口脚本
- 自动检查：push / Pull Request 会运行目录校验
- 首页分类接入规范：[站源首页与分类导航协议](./docs/HOME_CATEGORY_PROTOCOL_ZH.md)

## 添加一个站源

1. 按 iDuanJu 仓库中的 idj1 规范编写插件。一个插件目前只允许一个入口 JS 文件，不支持动态 import。
2. 将插件放入 `sources/<plugin-id>/`，至少包含 `manifest.json` 和 manifest 指定的入口脚本。
3. 在 `index.json` 的 `plugins` 数组中增加目录条目。manifest 地址使用本仓库的 Raw HTTPS 地址，例如：

   `https://raw.githubusercontent.com/ericto888/iduanju-sources/main/sources/<plugin-id>/manifest.json`

4. 提交 Pull Request。自动校验通过后再合并。

目录条目示例：

```json
{
  "id": "com.example.demo",
  "name": "示例站源",
  "manifest": "https://raw.githubusercontent.com/ericto888/iduanju-sources/main/sources/com.example.demo/manifest.json",
  "type": "video",
  "adult": false,
  "version": "1.0.0",
  "description": "站源用途说明",
  "category": "video",
  "author": "作者名称"
}
```

## 分类

当前预置分类：长视频、短剧、漫画、直播。分类 ID 分别为 `video`、`shortdrama`、`comic`、`live`。

## 安全与维护约定

- 只接受 idj1 格式；不收录 CatVod、TVBox spider/JAR 或 GuoApp 专用脚本。
- 每个插件必须明确声明 `adult` 和 HTTP 域名权限，遵循最小权限原则。
- 不得绕过宿主沙箱，不得索取与站源功能无关的个人信息。
- 不收录恶意代码、盗号脚本、广告注入或未经授权的内容。
- 站源是否可用会随上游网站变化；上架前应实际测试，并说明已知限制。
- 成人站源必须正确标记 `adult: true`，客户端按用户的成人内容解锁状态决定是否展示。

当前目录保持为空；只有完成适配、验证和实际测试的插件才会正式上架。
