#!/usr/bin/env python3
"""
API文档生成脚本
自动生成OpenAPI文档和Markdown文档
"""

import json
import sys
from pathlib import Path
from typing import Dict, Any

# 添加项目根目录到Python路径
project_root = Path(__file__).parent.parent
sys.path.insert(0, str(project_root))

from backend.main import app  # noqa: E402


def write_json_file(data: Dict[str, Any], output_file: Path) -> None:
    """Write generated JSON files with a stable trailing newline."""
    with open(output_file, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=2, ensure_ascii=False)
        f.write("\n")


def normalize_markdown_content(content: str) -> str:
    """Keep generated Markdown free of trailing whitespace."""
    return "\n".join(line.rstrip() for line in content.splitlines()) + "\n"


def generate_openapi_spec(output_file: Path = None) -> Dict[str, Any]:
    """生成OpenAPI规范"""
    if output_file is None:
        output_file = project_root / "docs" / "openapi.json"

    # 获取OpenAPI规范
    openapi_spec = app.openapi()

    # 确保输出目录存在
    output_file.parent.mkdir(exist_ok=True)

    # 保存到文件
    write_json_file(openapi_spec, output_file)

    print(f"✅ OpenAPI规范已生成: {output_file}")
    return openapi_spec


def generate_markdown_docs(openapi_spec: Dict[str, Any], output_file: Path = None):
    """生成Markdown格式的API文档"""
    if output_file is None:
        output_file = project_root / "docs" / "API_REFERENCE.md"

    # 生成Markdown内容
    markdown_content = f"""# API参考文档

## 概述

{openapi_spec.get('info', {}).get('description', '超级定价系统API文档')}

**版本**: {openapi_spec.get('info', {}).get('version', '1.0.0')}

## 基础信息

- **基础URL**: `http://localhost:8100`
- **认证方式**: 开发态研究/只读接口可匿名访问；认证、基础设施和管理类接口支持 Bearer JWT / Refresh Token / X-API-Key，生产环境必须配置 `AUTH_SECRET`
- **数据格式**: JSON
- **字符编码**: UTF-8

## API端点

> 本文档只生成 `super-pricing-system` 的私有系统边界。公开研究仓主能力
> （`/backtest/*`、`/realtime/*`、`/industry/*`、`/trade/*` 等）在本仓
> 仅作为 Quant Lab、历史快照和本地验证的内部支撑路由保留，不进入
> OpenAPI/Postman 主文档。

"""

    # 按标签分组端点
    paths = openapi_spec.get("paths", {})
    tags_info = {
        tag["name"]: tag.get("description", "") for tag in openapi_spec.get("tags", [])
    }

    # 按标签组织端点
    endpoints_by_tag = {}
    for path, methods in paths.items():
        for method, details in methods.items():
            if method.upper() in ["GET", "POST", "PUT", "DELETE", "PATCH"]:
                tags = details.get("tags", ["未分类"])
                for tag in tags:
                    if tag not in endpoints_by_tag:
                        endpoints_by_tag[tag] = []
                    endpoints_by_tag[tag].append(
                        {"path": path, "method": method.upper(), "details": details}
                    )

    preferred_tag_order = [
        "Asset Pricing Research",
        "Alternative Data",
        "Macro Mispricing",
        "Cross Market",
        "Research Workbench",
        "Quant Lab",
        "Infrastructure",
        "System",
    ]
    ordered_tags = list(tags_info)
    for tag in endpoints_by_tag:
        if tag not in ordered_tags:
            ordered_tags.append(tag)
    ordered_tags.sort(
        key=lambda tag: (
            preferred_tag_order.index(tag) if tag in preferred_tag_order else len(preferred_tag_order),
            tag,
        )
    )

    # 生成每个标签的文档
    for tag in ordered_tags:
        description = tags_info.get(tag, "")
        if tag in endpoints_by_tag:
            markdown_content += f"### {tag}\n\n"
            if description:
                markdown_content += f"{description}\n\n"

            for endpoint in endpoints_by_tag[tag]:
                path = endpoint["path"]
                method = endpoint["method"]
                details = endpoint["details"]

                markdown_content += f"#### {method} {path}\n\n"
                markdown_content += f"**{details.get('summary', '无描述')}**\n\n"

                if "description" in details:
                    markdown_content += f"{details['description']}\n\n"

                # 请求参数
                if "parameters" in details:
                    markdown_content += "**请求参数: **\n\n"
                    for param in details["parameters"]:
                        required = "（必需）" if param.get("required", False) else "（可选）"
                        desc = param.get("description", "无描述")
                        markdown_content += f"- `{param['name']}` {required}: {desc}\n"
                    markdown_content += "\n"

                # 请求体
                if "requestBody" in details:
                    markdown_content += "**请求体: **\n\n"
                    content = details["requestBody"].get("content", {})
                    if "application/json" in content:
                        schema = content["application/json"].get("schema", {})
                        if "$ref" in schema:
                            schema_name = schema["$ref"].split("/")[-1]
                            markdown_content += f"参考模型: `{schema_name}`\n\n"
                        else:
                            markdown_content += "JSON格式请求体\n\n"

                # 响应
                if "responses" in details:
                    markdown_content += "**响应: **\n\n"
                    for status_code, response in details["responses"].items():
                        desc = response.get("description", "无描述")
                        markdown_content += f"- **{status_code}**: {desc}\n"
                    markdown_content += "\n"

                markdown_content += "---\n\n"

    markdown_content += """## 内部支撑路由说明

本仓运行时仍挂载部分与 `quant-trading-system` 共享的底层能力，用于 Quant Lab 实验、
历史研究快照、深链重开和本地回归脚本。这些路由不会进入当前 OpenAPI/Postman 主文档；
如果要开发公开的回测、实时行情、行业热度或交易工作台，请切换到同级目录中的
`quant-trading-system`。

"""

    # 数据模型
    components = openapi_spec.get("components", {})
    schemas = components.get("schemas", {})

    if schemas:
        markdown_content += "## 数据模型\n\n"
        for schema_name, schema_def in schemas.items():
            markdown_content += f"### {schema_name}\n\n"

            if "description" in schema_def:
                markdown_content += f"{schema_def['description']}\n\n"

            properties = schema_def.get("properties", {})
            if properties:
                markdown_content += "**字段: **\n\n"
                for prop_name, prop_def in properties.items():
                    prop_type = prop_def.get("type", "unknown")
                    prop_desc = prop_def.get("description", "无描述")
                    markdown_content += f"- `{prop_name}` ({prop_type}): {prop_desc}\n"
                markdown_content += "\n"

    # 错误代码
    markdown_content += """## 错误代码

| 状态码 | 说明 |
|--------|------|
| 200 | 请求成功 |
| 400 | 请求参数错误 |
| 404 | 资源不存在 |
| 422 | 请求数据验证失败 |
| 500 | 服务器内部错误 |

## 示例

### 运行定价差异分析

```bash
curl -X POST "http://localhost:8100/pricing/gap-analysis" \\
     -H "accept: application/json" \\
     -H "Content-Type: application/json" \\
     -d '{
       "symbol": "AAPL",
       "period": "1y"
     }'
```

### 运行 Quant Lab 策略优化

```bash
curl -X POST "http://localhost:8100/quant-lab/optimizer" \\
     -H "accept: application/json" \\
     -H "Content-Type: application/json" \\
     -d '{
       "symbol": "AAPL",
       "strategy": "moving_average",
       "period": "1y",
       "optimization_metric": "sharpe_ratio",
       "optimization_method": "grid"
     }'
```

## 更新日志

完整版本记录请查看 [`CHANGELOG.md`](CHANGELOG.md)。

## 支持

如有问题，请联系技术支持或查看项目文档。
"""

    # 保存到文件
    with open(output_file, "w", encoding="utf-8") as f:
        f.write(normalize_markdown_content(markdown_content))

    print(f"✅ Markdown文档已生成: {output_file}")


def generate_postman_collection(openapi_spec: Dict[str, Any], output_file: Path = None):
    """生成Postman集合"""
    if output_file is None:
        output_file = project_root / "docs" / "postman_collection.json"

    # 基础Postman集合结构
    collection = {
        "info": {
            "name": openapi_spec.get("info", {}).get("title", "API Collection"),
            "description": openapi_spec.get("info", {}).get("description", ""),
            "schema": "https://schema.getpostman.com/json/collection/v2.1.0/collection.json",
        },
        "item": [],
        "variable": [
            {"key": "baseUrl", "value": "http://localhost:8100", "type": "string"}
        ],
    }

    # 转换API端点为Postman请求
    paths = openapi_spec.get("paths", {})
    for path, methods in paths.items():
        for method, details in methods.items():
            if method.upper() in ["GET", "POST", "PUT", "DELETE", "PATCH"]:
                item = {
                    "name": details.get("summary", f"{method.upper()} {path}"),
                    "request": {
                        "method": method.upper(),
                        "header": [
                            {
                                "key": "Content-Type",
                                "value": "application/json",
                                "type": "text",
                            }
                        ],
                        "url": {
                            "raw": "{{baseUrl}}" + path,
                            "host": ["{{baseUrl}}"],
                            "path": path.strip("/").split("/"),
                        },
                    },
                }

                # 添加请求体示例
                if "requestBody" in details:
                    item["request"]["body"] = {
                        "mode": "raw",
                        "raw": "{\n  // 请根据API文档填写请求参数\n}",
                        "options": {"raw": {"language": "json"}},
                    }

                collection["item"].append(item)

    # 保存到文件
    write_json_file(collection, output_file)

    print(f"✅ Postman集合已生成: {output_file}")


def main():
    """主函数"""
    print("🚀 开始生成API文档...")

    # 确保docs目录存在
    docs_dir = project_root / "docs"
    docs_dir.mkdir(exist_ok=True)

    try:
        # 生成OpenAPI规范
        openapi_spec = generate_openapi_spec()

        # 生成Markdown文档
        generate_markdown_docs(openapi_spec)

        # 生成Postman集合
        generate_postman_collection(openapi_spec)

        print("\n🎉 API文档生成完成！")
        print(f"📁 文档目录: {docs_dir}")
        print("📄 生成的文件: ")
        print("   - openapi.json (OpenAPI规范)")
        print("   - API_REFERENCE.md (Markdown文档)")
        print("   - postman_collection.json (Postman集合)")

    except Exception as e:
        print(f"❌ 文档生成失败: {e}")
        return 1

    return 0


if __name__ == "__main__":
    sys.exit(main())
