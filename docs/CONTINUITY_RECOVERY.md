# 生产连续性与 Ave Smart 采集器

## 当前安全边界

- 原 Sites project、公开域名、D1 `DB` binding 和企业微信链路保持不变。
- Ave 浏览器采集器只上传结构化候选与运行状态；Cookie、登录 Token 和浏览器配置仅保存在当前 Windows 用户的 `%LOCALAPPDATA%\KOLSignalMonitor`。
- 采集入口使用独立的 `AVE_COLLECTOR_SECRET`，不复用或暴露 `MONITOR_SECRET`。
- 雷达候选仍经过身份、安全门和 AI 复核；缺少真实可成交报价时不会创建 Paper 成交。
- 钱包、报价、测试网、主网和雷达自动交易开关继续关闭。

## 一键启动与登录

1. 双击仓库根目录的 `启动-Ave-Smart采集器.bat`。
2. 脚本会检查 Node.js 22、pnpm、Playwright、Microsoft Edge、生产采集端点和本机加密会话目录。
3. 首次启动如尚未写入本机采集凭据，只在 PowerShell 安全输入框中输入；输入不回显，之后以 Windows DPAPI 加密存放。
4. Edge 会以可见窗口打开 Ave Smart；若 Ave 要求登录，只在该浏览器内亲自完成。不得把账号、密码、验证码、Cookie 或 Token 发给 Codex。
5. 保持启动窗口运行。采集器每分钟写入一次生产心跳，并在浏览器关闭、页面断线或接口失败后受控重连。

## 停止、清除与回滚

- 运行 `停止-Ave-Smart采集器.ps1`。脚本会核对 PID 对应的命令行，只终止本项目采集器。
- 如需注销并删除本机会话，先停止采集器，再运行 `清除-Ave-Smart本机会话.ps1` 并输入 `DELETE`；该操作只删除 `%LOCALAPPDATA%\KOLSignalMonitor` 下的 Ave 会话和 DPAPI 密文。
- 应用回滚到 Sites Version 64 可停用本次页面与采集状态变更；新增 `collector_status` 表为兼容性追加表，不删除原数据。若必须物理回退数据库，应使用发布前 D1 Time Travel，不直接 DROP 表。

## 验收状态定义

- `COLLECTOR_CONNECTION_VERIFIED`：可见浏览器连续运行至少 60 分钟，生产心跳持续更新，断线/浏览器关闭恢复路径已验证。
- `EVENT_CAPTURE_NOT_VERIFIED`：观察期间没有真实 Ave Smart 事件，不能据此宣称候选采集完整。
- 只有真实事件完成结构化捕获、去重、上传、生产入库和页面显示后，事件闭环才通过；禁止人工插入生产假信号。
