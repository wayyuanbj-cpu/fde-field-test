# OneX FDE 三级水平测试

一个面向 FDE（Field Deployment Engineer）候选人与从业者的公开水平校准网站。

## 测评结构

- 12 道 FDE 潜质快速校准题
- 初级：100 道理论基础题，随机模拟 50 题
- 中级：60 道情境交付题，随机模拟 30 题
- 高级：40 道复杂决策题，随机模拟 20 题
- 三级不可跳级：完整挑战总分不低于 85，且每个模块不低于 70，才解锁下一级
- 多选题少选、多选、错选均为 0 分；随机模拟不解锁等级
- 支持分模块诊断、错题解析、进度自动保存，以及完成三级后的选填署名分享卡

## 产品边界

本站是用于传播的 FDE 能力挑战，不是正式毕业认证。站内结果不代表正式毕业、认证或真实项目能力结论。

## 本地运行

这是一个无构建步骤的静态网站：

```bash
python3 -m http.server 4173
```

然后访问 `http://127.0.0.1:4173/`。

统计后台需要 Python 3.11+ 以支持 scrypt 密码哈希：

```bash
PYTHONPATH=backend FDE_ANALYTICS_DB=/tmp/fde-analytics.db python3 -m fde_analytics.app
```

后台默认仅监听 `127.0.0.1:8765`，生产环境通过 Nginx 同源代理。

## 服务器发布

OneX ECS 服务器通过本仓库部署：

```bash
sudo bash deploy/install-or-update.sh
```

脚本会从 GitHub 下载 `main` 分支官方归档、同步公开站点文件、校验 Nginx 配置并为 `fde.onex.plus` 申请或续用 HTTPS 证书。使用归档方式是为了适配国内服务器访问 GitHub 的网络特点。

部署会同时启用私有统计服务和 `https://fde.onex.plus/stats/`。统计只接受白名单事件，不存储姓名、答案、原始 IP 或完整 User-Agent。Owner 可管理账号，Analyst 只读数据；首次 Owner 登录强制改密。

OneX ECS 的 443 端口同时承载 Xray。部署脚本会通过 Nginx SNI 预读将 `fde.onex.plus` 分流到网站，其余 TLS 流量继续转发给 Xray，从而保留原有翻墙服务。

## 权利声明

基于 OneX FDE 考核培训体系。

版权所有 © 2026 OneX AI 社区。保留所有权利。
