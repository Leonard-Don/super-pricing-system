"""Sina ↔ THS 行业名称双向映射 helpers。"""

from __future__ import annotations

from typing import List

from ._constants import SINA_TO_THS_MAP


def map_sina_to_ths(sina_name: str) -> str:
    """尝试将新浪行业名称映射到同花顺"""
    # 彻底清理后缀
    clean_name = sina_name.replace("行业", "").replace("制造", "").strip()
    if clean_name in SINA_TO_THS_MAP:
        return SINA_TO_THS_MAP[clean_name]
    if sina_name in SINA_TO_THS_MAP:
        return SINA_TO_THS_MAP[sina_name]
    return clean_name


def map_ths_to_sina(ths_name: str) -> List[str]:
    """尝试将同花顺行业名称逆向映射为可能的新浪行业名称"""
    possible_names = []
    # 1. 查找反向映射字典
    for sina, ths in SINA_TO_THS_MAP.items():
        if ths == ths_name:
            possible_names.append(sina)
    
    # 2. 特殊硬编码处理，确保核心行业能够补全
    ths_clean = ths_name.replace("Ⅲ", "").replace("Ⅱ", "").strip()
    
    if "白酒" in ths_clean or "饮料" in ths_clean:
        possible_names.extend(["酿酒行业", "食品饮料"])
    if "半导体" in ths_clean or "元件" in ths_clean:
        possible_names.extend(["电子器件", "半导体"])
    if "电力" in ths_clean or "电网" in ths_clean:
        possible_names.extend(["电力行业", "发电设备"])
    if "军工" in ths_clean or "航天" in ths_clean or "航空" in ths_clean:
        possible_names.extend(["飞机制造", "船舶制造", "军工装备"])
    if "医药" in ths_clean or "医疗" in ths_clean:
        possible_names.extend(["医药生物", "生物制药", "医疗器械"])
    if "房地产" in ths_clean:
        possible_names.append("房地产")
    
    # 3. 启发式替换
    possible_names.append(ths_clean.replace("开采加工", "行业"))
    possible_names.append(ths_clean.replace("制造", "行业"))
    possible_names.append(ths_clean.replace("设备", "行业"))
    possible_names.append(ths_clean + "行业")
    
    # 4. 原名兜底
    possible_names.append(ths_name)
    
    deduped = []
    seen = set()
    for name in possible_names:
        normalized = str(name or "").strip()
        if normalized and normalized not in seen:
            deduped.append(normalized)
            seen.add(normalized)
    return deduped
