# FIELD / 01 · 正大杯备赛工作台

黑白瑞士编辑风格的市场调查竞赛备赛网站，包含往届案例结构、可下载资料和实时选题雷达。

## 启动

需要 Python 3.9 或更高版本，无需安装第三方依赖。

```bash
cd /Users/corbin/Documents/Codex/2026-10-28/zhi/outputs/site
python3 server.py
```

打开 <http://127.0.0.1:8000>。

直接双击 `index.html` 也能浏览页面与“刷新雷达”的内置快照；为了保证素材站内预览、UTF-8 编码和实时资讯都正常工作，推荐始终通过 `server.py` 启动。运行后，服务端会从公开 RSS 获取最新财经与综合新闻，并缓存 15 分钟。

## 分享给其他人

### 同一 Wi-Fi：局域网分享

双击 `start-share.command`，或在终端运行：

```bash
FIELD_HOST=0.0.0.0 python3 server.py
```

终端会显示形如 `LAN share: http://192.168.1.23:8000` 的地址。把该地址发给连接同一 Wi-Fi 的手机或电脑即可。分享期间电脑不能休眠，终端不能关闭；首次运行时如果 macOS 询问是否允许 Python 接受传入网络连接，请选择允许。

如果终端没有显示局域网地址，可在 macOS“系统设置 → Wi-Fi → 详细信息”中查看 IP 地址，然后访问 `http://你的IP:8000`。

### 公网访问：部署到云平台

如需让不在同一网络的人访问，并且让网站持续在线，需要把 `site` 目录部署到支持 Python 的 Web Service（例如 Render、Railway 或自己的服务器）。

1. 下载并解压 `正大杯-公网部署包-精简版.zip`，得到 `index.html`、`server.py`、`render.yaml`、`assets` 等文件。
2. 登录 GitHub，新建一个仓库，仓库名可填写 `field01-zhengdabei`。
3. 在仓库页面选择 **Add file → Upload files**，上传解压目录中的全部文件与文件夹。应直接看到 `index.html`，不要多套一层 `site` 文件夹。
4. 点击 **Commit changes** 保存上传。
5. 登录 Render，选择 **New → Web Service**，连接刚刚创建的 GitHub 仓库。
6. 配置服务：Language 选择 `Python 3`，Branch 为 `main`，Root Directory 留空，Build Command 填 `pip install -r requirements.txt`，Start Command 填 `FIELD_HOST=0.0.0.0 python3 server.py`。
7. 在 Environment Variables 中添加 `FIELD_HOST=0.0.0.0`，然后点击 **Deploy Web Service**。
8. 等待日志出现 `FIELD / 01 is running`，Render 页面会生成一个 `https://...onrender.com` 地址。用手机蜂窝网络打开该地址，测试案例、选题详情和 PPT 下载后即可分享。

Render 会自动提供 `PORT`，`server.py` 会读取该变量，无需手动固定端口。仓库根目录已包含 `render.yaml`，也可以在 Render 中使用 Blueprint 直接识别该配置。

Render 的免费实例在一段时间无人访问后会休眠，下一位访问者首次打开可能需要等待约半分钟。更新网站时，把新文件重新上传到 GitHub，Render 会自动重新部署。

如果只上传到 Netlify、Cloudflare Pages 或 GitHub Pages 等静态托管，页面、案例和 PPT 仍然可以打开，但“实时资讯刷新”会使用内置快照；要保留实时 RSS，必须使用支持 Python 的托管环境。

## 内容结构

- **案例档案**：2019—2026 年，国家级一、二、三等奖结构示例；支持年份、奖项、关键词筛选；每项可打开 PPT 叙事精读，并分别下载该案例的原件版与拆解版 PPT。
- **资料仓库**：问卷、量表、选择实验、SEM、图表和答辩结构模板；含可下载 PPT 与 Markdown 清单。
- **选题雷达**：将公开新闻与《三联生活周刊》议题转化为“观察信号、研究角度、研究设计、展示方式”；每张推荐卡均可进入完整方案，查看命题、假设、样本、变量、分析方法、答辩页序与风险控制，并支持实时刷新和本机选题板。
- **交互**：滚动进度、进入动效、筛选过渡、案例 PPT 预览、资料切换、雷达扫描、收藏抽屉、响应式移动菜单和减少动态效果支持。

## 数据说明

案例标题与方法为备赛结构示例，已隐去学校、团队与真实附件信息，不冒充官方获奖档案。站内提供的“原件”与“拆解版”均为与示例案例一一对应的独立 PPT。正式用于比赛时，应以赛事官方公示、原作者授权材料或团队自有资料替换 `data.js` 中的案例数据及 `assets/cases/` 下的文件。

资讯链接来自公开 RSS 与杂志公开页面。选题建议是研究假设起点，不代表新闻中的既有结论；实际研究前应进行伦理审查、探索性访谈与样本框核验。
