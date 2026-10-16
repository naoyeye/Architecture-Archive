"""Add metric equivalents to quantified imperial units in Chinese Markdown."""
from __future__ import annotations

import re
import unicodedata
from decimal import Decimal, InvalidOperation, ROUND_HALF_UP


_UNITS = {
    "平方英尺": (Decimal("0.09290304"), "平方米", 1),
    "英尺": (Decimal("0.3048"), "米", 1),
    "英寸": (Decimal("2.54"), "厘米", 1),
    "英里": (Decimal("1.609344"), "公里", 1),
    "英亩": (Decimal("0.40468564224"), "公顷", 2),
}
_NUMBER = r"(?:\d[\d,，]*(?:\.\d+)?|[零一二两三四五六七八九十百千]+|半)"
_QUANTITY = re.compile(
    rf"(?<![零一二两三四五六七八九十百千数几\d,，])(?P<first>{_NUMBER})"
    rf"(?:\s*(?P<join>×|x|X|乘)\s*(?P<second>{_NUMBER}))?"
    rf"\s*(?P<unit>平方英尺|英尺|英寸|英里|英亩)(?P<half>半)?"
)
_TABLE_VALUE = re.compile(
    rf"^(?P<prefix>\s*\|\s*)(?P<unit>平方英尺|英尺|英寸|英里|英亩)"
    rf"(?P<separator>\s*\|\s*)(?P<value>{_NUMBER})(?P<suffix>\s*\|)"
)
_METRIC_AFTER = re.compile(
    r"^\s*(?:高|长|宽|厚|深)?\s*（[^（）]{0,40}(?:平方米|厘米|公里|公顷|米)\s*）"
)
_METRIC_BEFORE = re.compile(r"(?:平方米|厘米|公里|公顷|米)\s*（[^（）]*$")
_DIGITS = {"零": 0, "一": 1, "二": 2, "两": 2, "三": 3, "四": 4,
           "五": 5, "六": 6, "七": 7, "八": 8, "九": 9}
_PLACES = {"十": 10, "百": 100, "千": 1000}


def _number(value: str) -> Decimal | None:
    if value == "半":
        return Decimal("0.5")
    if value[0] in _DIGITS or value[0] in _PLACES:
        total = current = 0
        previous_digit = False
        for char in value:
            if char in _PLACES:
                total += (current or 1) * _PLACES[char]
                current = 0
                previous_digit = False
            else:
                if previous_digit and char != "零":
                    return None
                current = _DIGITS[char]
                previous_digit = char != "零"
        return Decimal(total + current)
    try:
        return Decimal(unicodedata.normalize("NFKC", value).replace(",", ""))
    except InvalidOperation:
        return None


def _metric(value: Decimal, unit: str) -> str:
    factor, name, places = _UNITS[unit]
    quantum = Decimal(1).scaleb(-places)
    converted = (value * factor).quantize(quantum, rounding=ROUND_HALF_UP)
    return f"{converted:.{places}f}{name}"


def _convert_text(text: str) -> str:
    def replace(match: re.Match[str]) -> str:
        before, after = text[:match.start()], text[match.end():]
        if _METRIC_AFTER.match(after) or _METRIC_BEFORE.search(before):
            return match.group()
        first = _number(match.group("first"))
        second = _number(match.group("second")) if match.group("second") else None
        if first is None or (match.group("second") and second is None):
            return match.group()
        if match.group("half"):
            if second is not None:
                second += Decimal("0.5")
            else:
                first += Decimal("0.5")
        unit = match.group("unit")
        converted = _metric(first, unit)
        if second is not None:
            converted = (converted.removesuffix(_UNITS[unit][1])
                         + match.group("join") + _metric(second, unit))
        if re.search(r"(?:约|大约)\s*$", before):
            converted = "约" + converted
        return match.group() + f"（{converted}）"

    return _QUANTITY.sub(replace, text)


def _link_destinations(line: str) -> list[tuple[int, int]]:
    spans = []
    position = 0
    while (marker := line.find("](", position)) != -1:
        start = marker + 2
        depth = 1
        angle = False
        index = start
        while index < len(line):
            char = line[index]
            if char == "\\":
                index += 2
                continue
            if char == "<":
                angle = True
            elif char == ">":
                angle = False
            elif not angle and char == "(":
                depth += 1
            elif not angle and char == ")":
                depth -= 1
                if depth == 0:
                    spans.append((start, index))
                    position = index + 1
                    break
            index += 1
        else:
            position = start
    return spans


def add_metric_conversions(markdown: str) -> str:
    """Append metric values once, preserving Markdown link destinations."""
    output = []
    for line in markdown.splitlines(keepends=True):
        table = _TABLE_VALUE.match(line)
        if table:
            value = _number(table.group("value"))
            if value is not None:
                converted = _metric(value, table.group("unit"))
                line = (line[:table.end("value")] + f"（{converted}）"
                        + line[table.end("value"):])

        start = 0
        parts = []
        for left, right in _link_destinations(line):
            parts.append(_convert_text(line[start:left]))
            parts.append(line[left:right])
            start = right
        parts.append(_convert_text(line[start:]))
        output.append("".join(parts))
    return "".join(output)
