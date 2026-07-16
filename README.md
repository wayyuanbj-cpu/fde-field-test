# OneX FDE 三级水平测试

一个面向 FDE（Field Deployment Engineer）候选人与从业者的公开水平校准网站。

## 测评结构

- 12 道 FDE 潜质快速校准题
- 初级：100 道理论基础题，随机模拟 50 题
- 中级：60 道情境交付题，随机模拟 30 题
- 高级：40 道复杂决策题，随机模拟 20 题
- 支持精确评分、多选题部分得分、分模块诊断、错题解析、进度自动保存与成绩卡导出

## 本地运行

这是一个无构建步骤的静态网站：

```bash
python3 -m http.server 4173
```

然后访问 `http://127.0.0.1:4173/`。

## 服务器发布

OneX ECS 服务器通过本仓库部署：

```bash
sudo bash deploy/install-or-update.sh
```

脚本会从 GitHub 下载 `main` 分支官方归档、同步公开站点文件、校验 Nginx 配置并为 `fde.onex.plus` 申请或续用 HTTPS 证书。使用归档方式是为了适配国内服务器访问 GitHub 的网络特点。

## 权利声明

基于 OneX FDE 考核培训体系。

版权所有 © 2026 OneX AI 社区。保留所有权利。
