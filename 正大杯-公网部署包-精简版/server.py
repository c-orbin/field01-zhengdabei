#!/usr/bin/env python3
"""Local preview server and public-news adapter for FIELD / 01."""

from __future__ import annotations

import json
import mimetypes
import os
import socket
import tempfile
import threading
import time
import urllib.request
import xml.etree.ElementTree as ET
import zipfile
from datetime import datetime, timezone
from email.utils import parsedate_to_datetime
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import unquote, urlparse


ROOT = Path(__file__).resolve().parent
HOST = os.environ.get("FIELD_HOST", "127.0.0.1")
PORT = int(os.environ.get("FIELD_PORT", os.environ.get("PORT", "8000")))
CASE_BUNDLE = ROOT / "assets/case-decks.zip"
CASE_DECK_CACHE = Path(tempfile.gettempdir()) / "field01-case-decks"
CACHE_SECONDS = 15 * 60
NEWS_FEEDS = (
    "https://www.chinanews.com.cn/rss/finance.xml",
    "https://www.chinanews.com.cn/rss/scroll-news.xml",
)

FALLBACK_HEADLINES = [
    ["前三季度中国海洋生产总值同比增4.9%", "中新网财经", "https://www.chinanews.com.cn/cj/2026/10-28/10722469.shtml", "新闻"],
    ["川渝人工智能赛道吸引境内外投融资机构关注", "中新网财经", "https://www.chinanews.com.cn/cj/2026/10-28/10722468.shtml", "新闻"],
    ["世界海拔最高风电场升压站建成", "中新网财经", "https://www.chinanews.com.cn/cj/2026/10-28/10722462.shtml", "新闻"],
    ["“算力之都”邂逅OPC 河北张家口助力创业者“单人成军”", "中新网财经", "https://www.chinanews.com.cn/cj/2026/10-28/10722447.shtml", "新闻"],
    ["从价格指数到质量标尺：五省市联动做强羽绒服产业链", "中新网财经", "https://www.chinanews.com.cn/cj/2026/10-28/10722438.shtml", "新闻"],
    ["新一代智能终端蓬勃发展 业界乘势夯实产业底座", "中新网财经", "https://www.chinanews.com.cn/cj/2026/10-28/10722417.shtml", "新闻"],
    ["当智力可被“计量”，Token经济将带来什么？", "中新网财经", "https://www.chinanews.com.cn/cj/2026/10-28/10722411.shtml", "新闻"],
    ["海外“AI”不释手！中国造爆款 订单排到明年→", "中新网财经", "https://www.chinanews.com.cn/cj/2026/10-28/10722386.shtml", "新闻"],
]

TOPIC_TEMPLATES = [
    {
        "id": "t-ai-solo",
        "sourceType": "新闻",
        "title": "当 AI 把创业门槛降到“单人”，创业者还需要什么？",
        "keywords": ("单人成军", "OPC", "创业者"),
        "signalPrefix": "地方开始以算力、政策和创业服务支持“单人公司”。供给变化之后，真实的工作分工与外部依赖值得重新观察。",
        "angle": "不要只研究“AI 使用率”。把单人创业者拆成获客型、产品型与内容型，追问哪一类人真正降低了团队依赖，又在哪些环节重新依赖外包与服务生态。",
        "design": "先访谈 6—8 位 OPC 创业者识别关键事件；以“过去 30 天工作日志”回收真实分工；最后用情境实验比较算力、获客、财税与合规服务的支付意愿。",
        "tags": ["AI经营", "灵活就业", "服务生态"],
    },
    {
        "id": "t-ai-export",
        "sourceType": "新闻",
        "title": "海外用户的“AI 不释手”，买的到底是功能还是陪伴？",
        "keywords": ("海外", "AI", "订单"),
        "signalPrefix": "AI 消费硬件在海外形成新热度。功能同质化之外，交互拟人化、情绪陪伴与本地内容生态可能构成新的溢价来源。",
        "angle": "区分工具价值、情绪价值与社交展示价值，研究海外用户第一次购买与持续使用的动因是否一致。重点观察新鲜感过后的使用场景收缩。",
        "design": "抓取公开评论形成初始编码本；以多国用户的分层样本做 vignette 实验；结合 7 天使用日记，识别“买前预期—买后落差”。",
        "tags": ["AI硬件", "跨文化", "情绪价值"],
    },
    {
        "id": "t-ocean",
        "sourceType": "新闻",
        "title": "海洋生产总值增长 4.9%，哪些沿海消费仍没被看见？",
        "keywords": ("海洋", "沿海"),
        "signalPrefix": "海洋经济保持增长。宏观增速证明机会存在，却无法解释不同城市、不同人群与不同海洋服务业之间的体验差异。",
        "angle": "避开宽泛的“海洋经济认知调查”，转向海洋文旅、休闲渔业或滨海公共空间。研究本地居民与游客对“可亲近的海洋”的需求差异。",
        "design": "选 3 个海洋资源类型不同的城市做多案例比较；用 POI 与客流数据构建场景画像；再进行 400 份分层问卷和 12 人半结构访谈。",
        "tags": ["海洋经济", "文旅", "城市比较"],
    },
    {
        "id": "t-energy",
        "sourceType": "新闻",
        "title": "“世界海拔最高风电场”本地化之后，居民怎么看？",
        "keywords": ("风电", "零碳", "能源"),
        "signalPrefix": "高原风电与零碳能源项目快速落地。能源转型的社会接受度、景观影响与本地就业感知，往往滞后于工程进展。",
        "angle": "从工程指标转向社区关系。研究本地居民的生态感知、就业预期与旅游景观评价如何共同影响项目支持度，识别高支持与高担忧群体的交叉特征。",
        "design": "以项目周边乡镇与对照乡镇进行准实验比较；用感知量表、就业信息与地方依恋构建路径模型；补充关键利益相关者访谈。",
        "tags": ["能源转型", "社区感知", "准实验"],
    },
    {
        "id": "t-quality",
        "sourceType": "新闻",
        "title": "从价格指数到质量标尺：消费者看得懂“好羽绒”吗？",
        "keywords": ("质量", "产业链", "标准"),
        "signalPrefix": "产业链与质量标尺正在成为新的治理工具。标准的供给侧已经变化，需求侧的识别能力与支付判断是否同步？",
        "angle": "把“质量”拆成标签理解、触觉判断与价格接受。研究消费者是否会为可验证质量付费，以及电商场景中信息呈现如何改变判断。",
        "design": "设置真实产品与模拟商品页两组刺激材料；采用眼动或点击热区辅助；用信息透明度 × 品牌熟悉度情境实验测量支付意愿。",
        "tags": ["质量信号", "电商", "支付意愿"],
    },
    {
        "id": "t-intelligence",
        "sourceType": "新闻",
        "title": "当智力可以“计量”，Token 会改变消费者的付费直觉吗？",
        "keywords": ("Token", "算力", "智能终端", "人工智能"),
        "signalPrefix": "行业开始讨论 Token 经济与智力的计量方式。新的计价单位进入市场，但消费者仍缺少理解和比较 AI 服务成本的心理标尺。",
        "angle": "不调查抽象的“是否接受 AI”，而是研究计费单位如何影响使用计划、成本感知与“划算”判断。对比按次、订阅与 Token 计量三种方式。",
        "design": "以 3 × 2 情境实验呈现不同计费规则；记录任务前的价格预估与任务后的真实花费；访谈“超出预期”用户的修正策略。",
        "tags": ["AI服务", "价格心理", "情境实验"],
    },
]

MAGAZINE_TOPICS = [
    {
        "id": "t-k-shape",
        "sourceType": "杂志",
        "title": "从一只大闸蟹，看消费的 K 型分化",
        "signal": "《三联生活周刊》以“大闸蟹的K型分化”讨论同一品类内部的消费分层。总量与均价无法解释，消费者购买的是规格、场景还是身份表达？",
        "angle": "把“升级/降级”的二分法改成“品质锚点 + 场景溢价”。研究同一家庭在哪些时刻愿意买贵、哪些时刻坚持质价比。",
        "design": "使用家庭一周食品消费日志识别场景；搭配 2 × 3 属性实验（规格、产地、礼赠场景）；以潜类别分析识别消费策略，而非预设收入分层。",
        "sourceName": "三联生活周刊",
        "sourceHeadline": "大闸蟹的K型分化",
        "url": "https://www.lifeweek.com.cn/",
        "published": "2026-10-28",
        "tags": ["消费分层", "食物消费", "潜类别"],
    },
    {
        "id": "t-dialect",
        "sourceType": "杂志",
        "title": "方言重生：年轻人会为“地方感”付出多少？",
        "signal": "《三联生活周刊》最新封面议题“方言重生”，呈现地方语言在脱口秀、短视频与文旅叙事中的再流行。文化符号正在转化为可体验的地方产品。",
        "angle": "将“方言好感”与“实际消费行为”分开。研究年轻人在内容、餐饮、文旅与文创四类场景中，对地方文化真实性的判断与支付边界。",
        "design": "内容接触前后测测量态度变化；用 4 类产品情境实验检验支付溢价；对地方创作者与商家访谈，校验需求侧结论是否可执行。",
        "sourceName": "三联生活周刊",
        "sourceHeadline": "新刊：方言重生",
        "url": "https://www.lifeweek.com.cn/magazine/5290",
        "published": "2026-10-23",
        "tags": ["地方文化", "真实性", "文旅消费"],
    },
]

_cache: dict[str, object] = {"body": None, "stamp": 0.0}
_cache_lock = threading.Lock()


def local_ipv4_addresses() -> list[str]:
    addresses: set[str] = set()
    probe = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    try:
        probe.connect(("8.8.8.8", 80))
        address = probe.getsockname()[0]
        if not address.startswith("127."):
            addresses.add(address)
    except OSError:
        pass
    finally:
        probe.close()
    try:
        for info in socket.getaddrinfo(socket.gethostname(), None, socket.AF_INET):
            address = info[4][0]
            if not address.startswith("127."):
                addresses.add(address)
    except OSError:
        pass
    return sorted(addresses)


def prepare_case_decks() -> None:
    """Expand the compact deployment bundle when individual decks are unavailable."""
    if not CASE_BUNDLE.is_file():
        return
    CASE_DECK_CACHE.mkdir(parents=True, exist_ok=True)
    with zipfile.ZipFile(CASE_BUNDLE) as archive:
        for info in archive.infolist():
            if info.is_dir() or not info.filename.endswith(".pptx"):
                continue
            target = CASE_DECK_CACHE / Path(info.filename).name
            with archive.open(info) as source, target.open("wb") as output:
                output.write(source.read())


def fetch_bytes(url: str) -> bytes:
    request = urllib.request.Request(
        url,
        headers={
            "User-Agent": "Mozilla/5.0 (compatible; FIELD01/1.0; research-preview)",
            "Accept": "application/rss+xml, application/xml, text/xml, */*",
        },
    )
    with urllib.request.urlopen(request, timeout=8) as response:
        return response.read()


def parse_feed(data: bytes) -> list[dict[str, str]]:
    root = ET.fromstring(data)
    items: list[dict[str, str]] = []
    for node in root.findall(".//item"):
        title = (node.findtext("title") or "").strip()
        link = (node.findtext("link") or "").strip()
        pub_date = (node.findtext("pubDate") or "").strip()
        description = (node.findtext("description") or "").strip()
        if not title or not link:
            continue
        published = ""
        try:
            published = parsedate_to_datetime(pub_date).date().isoformat()
        except (TypeError, ValueError):
            published = datetime.now(timezone.utc).date().isoformat()
        items.append(
            {
                "title": title,
                "link": link,
                "published": published,
                "description": description,
            }
        )
    return items


def collect_news() -> list[dict[str, str]]:
    items: list[dict[str, str]] = []
    seen: set[str] = set()
    for feed in NEWS_FEEDS:
        try:
            for item in parse_feed(fetch_bytes(feed)):
                if item["title"] in seen:
                    continue
                seen.add(item["title"])
                items.append(item)
        except Exception:
            continue
    return items


def match_story(story: dict[str, str], template_keywords: tuple[str, ...]) -> bool:
    haystack = f"{story.get('title', '')} {story.get('description', '')}"
    return any(keyword.lower() in haystack.lower() for keyword in template_keywords)


def best_story(stories: list[dict[str, str]], template_keywords: tuple[str, ...]) -> dict[str, str]:
    def score(story: dict[str, str]) -> int:
        haystack = f"{story.get('title', '')} {story.get('description', '')}".lower()
        return sum(
            max(100 - index * 20, 10)
            for index, keyword in enumerate(template_keywords)
            if keyword.lower() in haystack
        )

    primary = template_keywords[0].lower()
    primary_matches = [
        story
        for story in stories
        if primary in f"{story.get('title', '')} {story.get('description', '')}".lower()
    ]
    return max(primary_matches or stories, key=score)


def build_payload() -> dict[str, object]:
    news = collect_news()
    used_news = news if news else [
        {
            "title": item[0],
            "link": item[2],
            "published": "2026-10-28",
            "description": "",
        }
        for item in FALLBACK_HEADLINES
    ]

    headlines = [
        [
            item["title"],
            "中新网财经" if "cj/" in item["link"] else "中新网",
            item["link"],
            "新闻",
        ]
        for item in used_news[:12]
    ]

    topics: list[dict[str, object]] = []
    for template in TOPIC_TEMPLATES:
        matched = best_story(used_news, template["keywords"])
        topics.append(
            {
                "id": template["id"],
                "sourceType": "新闻",
                "title": template["title"],
                "signal": f"{template['signalPrefix']} 最新信号：{matched['title']}。",
                "angle": template["angle"],
                "design": template["design"],
                "sourceName": "中新网财经" if "cj/" in matched["link"] else "中新网",
                "sourceHeadline": matched["title"],
                "url": matched["link"],
                "published": matched["published"],
                "tags": template["tags"],
            }
        )
    topics.extend(MAGAZINE_TOPICS)

    return {
        "topics": topics,
        "headlines": headlines,
        "updatedAt": datetime.now(timezone.utc).isoformat(),
        "snapshotDate": datetime.now(timezone.utc).date().isoformat(),
        "feedCount": len(news),
        "mode": "live" if news else "fallback",
    }


def get_insights() -> dict[str, object]:
    now = time.monotonic()
    with _cache_lock:
        cached_body = _cache["body"]
        if cached_body is not None and now - float(_cache["stamp"]) < CACHE_SECONDS:
            return cached_body  # type: ignore[return-value]
        payload = build_payload()
        _cache["body"] = payload
        _cache["stamp"] = now
        return payload


class FieldRequestHandler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(ROOT), **kwargs)

    def do_GET(self) -> None:
        path = urlparse(self.path).path
        if path == "/api/insights":
            try:
                body = json.dumps(get_insights(), ensure_ascii=False).encode("utf-8")
                self.send_response(200)
                self.send_header("Content-Type", "application/json; charset=utf-8")
                self.send_header("Cache-Control", "no-store")
                self.send_header("Content-Length", str(len(body)))
                self.end_headers()
                self.wfile.write(body)
            except Exception as error:
                detail = json.dumps({"error": str(error)}, ensure_ascii=False).encode("utf-8")
                self.send_response(502)
                self.send_header("Content-Type", "application/json; charset=utf-8")
                self.send_header("Content-Length", str(len(detail)))
                self.end_headers()
                self.wfile.write(detail)
            return
        super().do_GET()

    def translate_path(self, path: str) -> str:
        route = unquote(urlparse(path).path)
        if route.startswith("/assets/cases/"):
            name = Path(route).name
            if name.startswith("case-") and name.endswith(".pptx"):
                bundled = CASE_DECK_CACHE / name
                if bundled.is_file():
                    return str(bundled)
        return super().translate_path(path)

    def guess_type(self, path: str) -> str:
        extension = Path(path).suffix.lower()
        if extension == ".md":
            return "text/markdown; charset=utf-8"
        if extension == ".pptx":
            return "application/vnd.openxmlformats-officedocument.presentationml.presentation"
        return super().guess_type(path)

    def end_headers(self) -> None:
        self.send_header("X-Content-Type-Options", "nosniff")
        self.send_header("Referrer-Policy", "strict-origin-when-cross-origin")
        super().end_headers()


if __name__ == "__main__":
    mimetypes.add_type("application/vnd.openxmlformats-officedocument.presentationml.presentation", ".pptx")
    prepare_case_decks()
    print(f"FIELD / 01 is running at http://127.0.0.1:{PORT}")
    if HOST in {"0.0.0.0", "::"}:
        for address in local_ipv4_addresses():
            print(f"LAN share: http://{address}:{PORT}")
    print("Press Ctrl+C to stop.")
    server = ThreadingHTTPServer((HOST, PORT), FieldRequestHandler)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nStopped.")
