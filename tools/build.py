#!/usr/bin/env python3
"""Сборка демонстрационного сайта «Десять парадных».

Читает data/site.json и data/apartments.json и пишет готовые страницы
в корень репозитория: index.html, pravila.html, 404.html и kvartiry/*.html.

Запуск:  python3 tools/build.py
"""

from __future__ import annotations

import hashlib
import html
import json
import math
from pathlib import Path

from skyline import skyline_svg

ROOT = Path(__file__).resolve().parent.parent
SITE = json.loads((ROOT / "data" / "site.json").read_text(encoding="utf-8"))
FLATS = json.loads((ROOT / "data" / "apartments.json").read_text(encoding="utf-8"))

NBSP = " "


def asset(name: str) -> str:
    """Адрес файла оформления с меткой версии: после правок браузер не возьмёт старую копию из кэша."""
    digest = hashlib.sha256((ROOT / "assets" / name).read_bytes()).hexdigest()[:8]
    return f"assets/{name}?v={digest}"


def esc(text: object) -> str:
    return html.escape(str(text), quote=True)


def rub(value: int) -> str:
    return f"{value:,}".replace(",", NBSP) + NBSP + "₽"


def plural(n: int, one: str, few: str, many: str) -> str:
    if n % 10 == 1 and n % 100 != 11:
        return one
    if 2 <= n % 10 <= 4 and not 12 <= n % 100 <= 14:
        return few
    return many


def minutes(n: int) -> str:
    return f"{n}{NBSP}{plural(n, 'минута', 'минуты', 'минут')}"


def guests_upto(n: int) -> str:
    return f"до{NBSP}{n}{NBSP}{'гостя' if n == 1 else 'гостей'}"


# --------------------------------------------------------------------------
# Планы квартир
# --------------------------------------------------------------------------

M = 56  # пикселей на метр
PAD = 0.35  # поле вокруг плана, м

# Каждый план описан в метрах. Стены строятся по контурам комнат.
LAYOUTS = {
    "studio": {
        "size": (7.0, 4.4),
        "rooms": [
            ("Прихожая", 0, 0, 1.8, 1.9),
            ("Санузел", 0, 1.9, 1.8, 2.5),
            ("Комната с кухней", 1.8, 0, 5.2, 4.4),
        ],
        "windows": [("v", 7.0, 0.7, 1.9), ("v", 7.0, 2.5, 3.7)],
        "doors": [("v", 0, 0.6, 1.5, 1), ("v", 1.8, 0.5, 1.3, 1), ("h", 1.9, 0.5, 1.3, 1)],
        "items": [
            ("bed", 4.3, 0.15, 1.6, 2.0, "top"),
            ("counter", 1.95, 3.65, 2.4, 0.6),
            ("round", 5.7, 3.25, 0.45),
            ("tub", 0.15, 3.55, 1.5, 0.7),
            ("wc", 1.45, 3.1),
            ("sink", 0.45, 3.1),
        ],
    },
    "one": {
        "size": (8.6, 5.4),
        "rooms": [
            ("Прихожая", 0, 0, 2.0, 2.6),
            ("Санузел", 0, 2.6, 2.0, 2.8),
            ("Гостиная с кухней", 2.0, 0, 3.8, 5.4),
            ("Спальня", 5.8, 0, 2.8, 5.4),
        ],
        "windows": [("h", 0, 3.2, 4.6), ("h", 0, 6.5, 7.9)],
        "doors": [
            ("v", 0, 0.8, 1.7, 1),
            ("v", 2.0, 0.9, 1.7, 1),
            ("h", 2.6, 0.6, 1.4, 1),
            ("v", 5.8, 3.6, 4.4, 1),
        ],
        "items": [
            ("counter", 2.15, 4.65, 3.0, 0.6),
            ("sofa", 2.15, 2.2, 0.9, 2.0, "left"),
            ("round", 4.45, 1.6, 0.5),
            ("bed", 6.45, 1.2, 2.0, 1.6, "right"),
            ("tub", 0.15, 4.55, 1.7, 0.7),
            ("wc", 1.6, 3.9),
            ("sink", 0.45, 3.95),
        ],
    },
    "two": {
        "size": (10.6, 6.8),
        "rooms": [
            ("Спальня", 0, 0, 3.8, 3.3),
            ("Спальня", 3.8, 0, 3.6, 3.3),
            ("Ванная", 7.4, 0, 1.9, 3.3),
            ("Санузел", 9.3, 0, 1.3, 3.3),
            ("Гостиная", 0, 3.3, 5.4, 3.5),
            ("Кухня", 5.4, 3.3, 2.8, 3.5),
            ("Прихожая", 8.2, 3.3, 2.4, 3.5),
        ],
        "windows": [
            ("h", 0, 1.2, 2.6),
            ("h", 0, 4.9, 6.3),
            ("h", 6.8, 1.0, 2.4),
            ("h", 6.8, 3.0, 4.4),
            ("h", 6.8, 6.1, 7.5),
        ],
        "doors": [
            ("v", 10.6, 5.1, 6.0, -1),
            ("h", 3.3, 2.6, 3.4, -1),
            ("h", 3.3, 4.2, 5.0, -1),
            ("h", 3.3, 8.35, 9.15, -1),
            ("h", 3.3, 9.6, 10.35, -1),
            ("v", 8.2, 5.4, 6.2, -1),
            ("open", 5.4, 4.3, 6.0),
        ],
        "items": [
            ("bed", 0.15, 0.85, 2.0, 1.6, "left"),
            ("bed", 5.25, 0.85, 2.0, 1.6, "right"),
            ("sofa", 0.15, 4.2, 0.9, 2.2, "left"),
            ("table", 2.6, 4.75, 1.7, 0.9),
            ("counter", 5.55, 3.45, 2.5, 0.6),
            ("tub", 7.55, 0.15, 1.6, 0.7),
            ("sink", 8.85, 2.0),
            ("wc", 9.95, 0.55),
            ("sink", 9.95, 1.75),
        ],
    },
}


def _fmt(value: float) -> str:
    return f"{value:.1f}".rstrip("0").rstrip(".")


class Plan:
    """Строит SVG-план квартиры из описания комнат."""

    def __init__(self, layout: str, mirror: bool, scale: list[float]):
        spec = LAYOUTS[layout]
        self.sx, self.sy = scale
        self.w = spec["size"][0] * self.sx
        self.h = spec["size"][1] * self.sy
        self.mirror = mirror
        self.spec = spec
        self.rooms = [(name, *self._rect(x, y, w, h)) for name, x, y, w, h in spec["rooms"]]

    # -- преобразования координат (метры -> метры с учётом масштаба и зеркала)

    def _x(self, x: float) -> float:
        x *= self.sx
        return self.w - x if self.mirror else x

    def _y(self, y: float) -> float:
        return y * self.sy

    def _rect(self, x: float, y: float, w: float, h: float):
        x0, x1 = sorted((self._x(x), self._x(x + w)))
        return x0, self._y(y), x1 - x0, h * self.sy

    @staticmethod
    def _px(value: float) -> str:
        return _fmt((value + PAD) * M)

    def area(self) -> int:
        # 7% площади уходит на стены и перегородки
        return round(sum(w * h for _, _, _, w, h in self.rooms) * 0.93)

    def room_areas(self):
        return [(name, x, y, w, h, round(w * h * 0.93)) for name, x, y, w, h in self.rooms]

    # -- элементы

    def _line(self, cls: str, x1, y1, x2, y2) -> str:
        p = self._px
        return f'<line class="{cls}" x1="{p(x1)}" y1="{p(y1)}" x2="{p(x2)}" y2="{p(y2)}"/>'

    def _box(self, cls: str, x, y, w, h, r: float = 0) -> str:
        p = self._px
        rx = f' rx="{_fmt(r * M)}"' if r else ""
        return f'<rect class="{cls}" x="{p(x)}" y="{p(y)}" width="{_fmt(w * M)}" height="{_fmt(h * M)}"{rx}/>'

    def _circle(self, cls: str, cx, cy, r) -> str:
        p = self._px
        return f'<circle class="{cls}" cx="{p(cx)}" cy="{p(cy)}" r="{_fmt(r * M)}"/>'

    def _door(self, kind, pos, a, b, swing) -> str:
        p = self._px
        if kind == "open":
            x = self._x(pos)
            return self._line("plan-gap", x, self._y(a), x, self._y(b))
        if kind == "v":
            x = self._x(pos)
            y1, y2 = self._y(a), self._y(b)
            width = y2 - y1
            direction = -swing if self.mirror else swing
            tip = x + direction * width
            sweep = 1 if direction > 0 else 0
            return (
                self._line("plan-gap", x, y1, x, y2)
                + f'<path class="plan-door" d="M{p(x)} {p(y1)} L{p(tip)} {p(y1)} '
                f'A{_fmt(width * M)} {_fmt(width * M)} 0 0 {sweep} {p(x)} {p(y2)}"/>'
            )
        # горизонтальная стена
        y = self._y(pos)
        x1, x2 = sorted((self._x(a), self._x(b)))
        width = x2 - x1
        hinge, far = (x2, x1) if self.mirror else (x1, x2)
        tip = y + swing * width
        clockwise = (far > hinge) == (swing > 0)
        sweep = 0 if clockwise else 1
        return (
            self._line("plan-gap", x1, y, x2, y)
            + f'<path class="plan-door" d="M{p(hinge)} {p(y)} L{p(hinge)} {p(tip)} '
            f'A{_fmt(width * M)} {_fmt(width * M)} 0 0 {sweep} {p(far)} {p(y)}"/>'
        )

    def _window(self, kind, pos, a, b) -> str:
        if kind == "v":
            x = self._x(pos)
            return self._line("plan-gap", x, self._y(a), x, self._y(b)) + self._line(
                "plan-window", x, self._y(a), x, self._y(b)
            )
        y = self._y(pos)
        x1, x2 = sorted((self._x(a), self._x(b)))
        return self._line("plan-gap", x1, y, x2, y) + self._line("plan-window", x1, y, x2, y)

    def _item(self, item) -> str:
        kind = item[0]
        if kind == "bed":
            _, x, y, w, h, head = item
            if self.mirror and head in ("left", "right"):
                head = "left" if head == "right" else "right"
            x, y, w, h = self._rect(x, y, w, h)
            out = self._box("plan-soft", x, y, w, h, 0.06)
            if head == "top":
                pw = w / 2 - 0.18
                out += self._box("plan-item", x + 0.12, y + 0.12, pw, 0.42, 0.08)
                out += self._box("plan-item", x + w - 0.12 - pw, y + 0.12, pw, 0.42, 0.08)
                out += self._line("plan-item", x, y + 0.72, x + w, y + 0.72)
            else:
                ph = h / 2 - 0.18
                px = x + 0.12 if head == "left" else x + w - 0.54
                out += self._box("plan-item", px, y + 0.12, 0.42, ph, 0.08)
                out += self._box("plan-item", px, y + h - 0.12 - ph, 0.42, ph, 0.08)
                lx = x + 0.72 if head == "left" else x + w - 0.72
                out += self._line("plan-item", lx, y, lx, y + h)
            return out
        if kind == "sofa":
            _, x, y, w, h, back = item
            if self.mirror:
                back = "left" if back == "right" else "right"
            x, y, w, h = self._rect(x, y, w, h)
            bx = x if back == "left" else x + w - 0.26
            return self._box("plan-soft", x, y, w, h, 0.08) + self._box("plan-item", bx, y, 0.26, h, 0.08)
        if kind == "round":
            _, cx, cy, r = item
            cx, cy, r = self._x(cx), self._y(cy), r * min(self.sx, self.sy)
            out = self._circle("plan-soft", cx, cy, r)
            for dx in (-1, 1):
                out += self._circle("plan-item", cx + dx * (r + 0.26), cy, 0.17)
            return out
        if kind == "table":
            _, x, y, w, h = item
            x, y, w, h = self._rect(x, y, w, h)
            out = self._box("plan-soft", x, y, w, h, 0.04)
            for i in range(3):
                cx = x + w * (i + 0.5) / 3
                out += self._circle("plan-item", cx, y - 0.24, 0.16)
                out += self._circle("plan-item", cx, y + h + 0.24, 0.16)
            return out
        if kind == "counter":
            _, x, y, w, h = item
            x, y, w, h = self._rect(x, y, w, h)
            out = self._box("plan-soft", x, y, w, h)
            out += self._circle("plan-item", x + 0.32, y + h / 2 - 0.12, 0.09)
            out += self._circle("plan-item", x + 0.62, y + h / 2 - 0.12, 0.09)
            out += self._circle("plan-item", x + 0.32, y + h / 2 + 0.14, 0.09)
            out += self._circle("plan-item", x + 0.62, y + h / 2 + 0.14, 0.09)
            out += self._box("plan-item", x + w - 0.75, y + 0.12, 0.55, h - 0.24, 0.06)
            return out
        if kind == "tub":
            _, x, y, w, h = item
            x, y, w, h = self._rect(x, y, w, h)
            return self._box("plan-soft", x, y, w, h, 0.1) + self._box(
                "plan-item", x + 0.1, y + 0.1, w - 0.2, h - 0.2, 0.2
            )
        if kind == "wc":
            _, cx, cy = item
            cx, cy = self._x(cx), self._y(cy)
            p = self._px
            return (
                self._box("plan-soft", cx - 0.2, cy - 0.38, 0.4, 0.18, 0.03)
                + f'<ellipse class="plan-soft" cx="{p(cx)}" cy="{p(cy)}" rx="{_fmt(0.19 * M)}" ry="{_fmt(0.25 * M)}"/>'
            )
        if kind == "sink":
            _, cx, cy = item
            cx, cy = self._x(cx), self._y(cy)
            return self._box("plan-soft", cx - 0.26, cy - 0.2, 0.52, 0.4, 0.06) + self._circle(
                "plan-item", cx, cy, 0.12
            )
        raise ValueError(kind)

    def svg(self, labels: bool, title: str | None = None) -> str:
        width = (self.w + 2 * PAD) * M
        height = (self.h + 2 * PAD) * M
        parts = []
        for _, x, y, w, h in self.rooms:
            parts.append(self._box("plan-floor", x, y, w, h))
        for item in self.spec["items"]:
            parts.append(self._item(item))
        for _, x, y, w, h in self.rooms:
            parts.append(self._box("plan-wall", x, y, w, h))
        for window in self.spec["windows"]:
            parts.append(self._window(*window))
        for door in self.spec["doors"]:
            kind, pos, a, b = door[:4]
            swing = door[4] if len(door) > 4 else 1
            parts.append(self._door(kind, pos, a, b, swing))
        if labels:
            p = self._px
            for name, x, y, w, h, area in self.room_areas():
                cx = x + w / 2
                cy = y + h / 2
                # подпись ставим в свободное место комнаты
                if name in ("Комната с кухней", "Гостиная с кухней"):
                    cy = y + h * 0.56
                    cx = x + w * 0.6
                elif name == "Гостиная":
                    cy = y + h * 0.2
                    cx = x + w * 0.58
                elif name == "Спальня":
                    cy = y + h - 0.55
                elif name == "Кухня":
                    cy = y + h * 0.62
                elif name in ("Санузел", "Ванная"):
                    cy = y + h * 0.5
                elif name == "Прихожая" and h > 3:
                    cy = y + h * 0.3
                words = name.split(" ", 1)
                lines = words if (len(name) * 7.4 > w * M - 10 and len(words) > 1) else [name]
                dy = -8 * (len(lines) - 1)
                for i, line in enumerate(lines):
                    parts.append(
                        f'<text class="plan-label" x="{p(cx)}" y="{_fmt((cy + PAD) * M + dy + i * 16)}">{esc(line)}</text>'
                    )
                parts.append(
                    f'<text class="plan-label plan-label-area" x="{p(cx)}" '
                    f'y="{_fmt((cy + PAD) * M + dy + len(lines) * 16)}">{area}{NBSP}м²</text>'
                )
        head = (
            f'<svg viewBox="0 0 {_fmt(width)} {_fmt(height)}" role="img" aria-label="{esc(title)}">'
            if title
            else f'<svg viewBox="0 0 {_fmt(width)} {_fmt(height)}" aria-hidden="true" focusable="false">'
        )
        return head + "".join(parts) + "</svg>"


# --------------------------------------------------------------------------
# Схема центра Петербурга
# --------------------------------------------------------------------------

LON0, LON1 = 30.245, 30.390
LAT0, LAT1 = 59.972, 59.908
K = 9984.0
COS = math.cos(math.radians(59.94))
MAP_W = (LON1 - LON0) * COS * K
MAP_H = (LAT0 - LAT1) * K


def project(lat: float, lon: float) -> tuple[float, float]:
    return (lon - LON0) * COS * K, (LAT0 - lat) * K


def smooth(points: list[tuple[float, float]]) -> str:
    """Сглаженная линия через точки (сплайн Катмулла — Рома в кривых Безье)."""
    pts = [project(*p) for p in points]
    d = f"M{pts[0][0]:.1f} {pts[0][1]:.1f}"
    for i in range(len(pts) - 1):
        p0 = pts[i - 1] if i > 0 else pts[i]
        p1, p2 = pts[i], pts[i + 1]
        p3 = pts[i + 2] if i + 2 < len(pts) else p2
        c1 = (p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6)
        c2 = (p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6)
        d += f" C{c1[0]:.1f} {c1[1]:.1f} {c2[0]:.1f} {c2[1]:.1f} {p2[0]:.1f} {p2[1]:.1f}"
    return d


WATER = [
    # (ширина линии, точки широта/долгота)
    (44, [(59.9590, 30.400), (59.9570, 30.372), (59.9523, 30.3495), (59.9495, 30.336),
          (59.9482, 30.3270), (59.9462, 30.317), (59.9452, 30.3085)]),  # Нева
    (34, [(59.9452, 30.3085), (59.9412, 30.3075), (59.9375, 30.298), (59.9347, 30.2895),
          (59.9300, 30.272), (59.9250, 30.255), (59.9180, 30.235)]),  # Большая Нева
    (26, [(59.9452, 30.3085), (59.9468, 30.3030), (59.9492, 30.2855), (59.9540, 30.270),
          (59.9600, 30.250), (59.9640, 30.232)]),  # Малая Нева
    (22, [(59.9530, 30.3390), (59.9580, 30.3375), (59.9675, 30.334), (59.9760, 30.322)]),  # Большая Невка
    (13, [(59.9760, 30.322), (59.9722, 30.300), (59.9690, 30.282), (59.9660, 30.262),
          (59.9645, 30.240)]),  # Малая Невка
    (7, [(59.9478, 30.3380), (59.9410, 30.3385), (59.9333, 30.3435), (59.9283, 30.3360),
         (59.9240, 30.3270), (59.9195, 30.3185), (59.9167, 30.3085), (59.9165, 30.2975),
         (59.9160, 30.2790), (59.9150, 30.262)]),  # Фонтанка
    (5, [(59.9420, 30.3380), (59.9418, 30.330), (59.9405, 30.3245), (59.9400, 30.3200),
         (59.9365, 30.3185), (59.9335, 30.3140), (59.9318, 30.3085), (59.9285, 30.2950),
         (59.9275, 30.283), (59.9268, 30.271)]),  # Мойка
    (4, [(59.9410, 30.3290), (59.9395, 30.3288), (59.9350, 30.3255), (59.9322, 30.3250),
         (59.9272, 30.3190), (59.9255, 30.310), (59.9265, 30.301), (59.9235, 30.294),
         (59.9185, 30.286), (59.9165, 30.282)]),  # канал Грибоедова
]

NEVSKY = [(59.9372, 30.3090), (59.9312, 30.3605), (59.9255, 30.384)]


def city_map(root: str, current: int | None = None) -> str:
    cls = "map map-mini" if current is not None else "map"
    parts = [
        f'<svg class="{cls}" viewBox="0 0 {MAP_W:.0f} {MAP_H:.0f}" role="group" '
        f'aria-label="Схема центра Санкт-Петербурга с квартирами">'
    ]
    for width, points in WATER:
        parts.append(f'<path class="map-water" stroke-width="{width}" d="{smooth(points)}"/>')
    (x1, y1), (x2, y2), (x3, y3) = (project(*p) for p in NEVSKY)
    parts.append(f'<path class="map-street" d="M{x1:.1f} {y1:.1f} L{x2:.1f} {y2:.1f} L{x3:.1f} {y3:.1f}"/>')

    def label(cls, lat, lon, text, rotate=0, anchor="middle"):
        x, y = project(lat, lon)
        turn = f' transform="rotate({rotate} {x:.1f} {y:.1f})"' if rotate else ""
        parts.append(
            f'<text class="{cls}" x="{x:.1f}" y="{y:.1f}" text-anchor="{anchor}"{turn} aria-hidden="true">{text}</text>'
        )

    label("map-label map-label-water", 59.9533, 30.3600, "Нева", rotate=-16)
    label("map-label", 59.9478, 30.2475, "Васильевский остров", anchor="start")
    label("map-label", 59.9665, 30.3090, "Петроградская сторона")
    label("map-label", 59.9330, 30.3285, "Невский", rotate=13)
    label("map-label", 59.9208, 30.2800, "Коломна")

    for flat in sorted(FLATS, key=lambda f: f["n"] == current):
        x, y = project(flat["lat"], flat["lon"])
        href = f'{root}kvartiry/{flat["slug"]}.html'
        if current is not None:
            if flat["n"] == current:
                parts.append(
                    f'<g class="map-pin is-active" aria-hidden="true"><circle cx="{x:.1f}" cy="{y:.1f}" r="16"/>'
                    f'<text x="{x:.1f}" y="{y:.1f}">{flat["n"]}</text></g>'
                )
            else:
                parts.append(
                    f'<a class="map-pin is-dim" href="{href}" aria-label="{esc(flat["name"])}">'
                    f'<circle cx="{x:.1f}" cy="{y:.1f}" r="16"/><text x="{x:.1f}" y="{y:.1f}">{flat["n"]}</text></a>'
                )
        else:
            parts.append(
                f'<a class="map-pin" href="{href}" data-href="{href}" data-pin="{flat["n"]}" '
                f'aria-label="{flat["n"]}. {esc(flat["name"])}">'
                f'<circle cx="{x:.1f}" cy="{y:.1f}" r="16"/><text x="{x:.1f}" y="{y:.1f}">{flat["n"]}</text></a>'
            )
    parts.append("</svg>")
    return "".join(parts)


# --------------------------------------------------------------------------
# Общие части страниц
# --------------------------------------------------------------------------

FONTS = (
    '<link rel="preconnect" href="https://fonts.googleapis.com">'
    '<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>'
    '<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Forum&amp;'
    'family=Golos+Text:wght@400;500;600&amp;display=swap">'
)

LOGO = (
    '<svg viewBox="0 0 22 28" aria-hidden="true" focusable="false">'
    '<path d="M1 27V11a10 10 0 0 1 20 0v16" fill="none" stroke="currentColor" stroke-width="2"/>'
    '<path d="M6.5 27V12a4.5 4.5 0 0 1 9 0v15z" fill="#f2c230" stroke="currentColor" stroke-width="2" '
    'stroke-linejoin="round"/></svg>'
)


def page(*, root: str, title: str, description: str, body: str, current: str = "", extra_head: str = "", chat_flat: str = "") -> str:
    def nav(href: str, text: str, key: str) -> str:
        mark = ' aria-current="page"' if key == current else ""
        return f'<a href="{root}{href}"{mark}>{text}</a>'

    return f"""<!doctype html>
<html lang="ru">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>{esc(title)}</title>
<meta name="description" content="{esc(description)}">
<meta name="robots" content="noindex">
<meta property="og:type" content="website">
<meta property="og:title" content="{esc(title)}">
<meta property="og:description" content="{esc(description)}">
<meta property="og:locale" content="ru_RU">
<meta name="theme-color" content="#17283a">
<link rel="icon" href="{root}assets/favicon.svg" type="image/svg+xml">
{FONTS}
<link rel="stylesheet" href="{root}{asset("style.css")}">
{extra_head}</head>
<body>
<p class="demo-note">Демонстрационный сайт: квартиры, цены и отзывы вымышлены. <a href="{root}index.html#owners">Хочу такой сайт</a></p>
<header class="wrap site-header">
<a class="brand" href="{root}index.html">{LOGO}{esc(SITE["brand"])}</a>
<nav class="site-nav" aria-label="Основное меню">
{nav("index.html#kvartiry", "Квартиры", "flats")}
{nav("index.html#zaselenie", "Заселение", "checkin")}
{nav("pravila.html", "Правила и вопросы", "rules")}
</nav>
</header>
{body}
<footer class="site-footer">
<div class="wrap footer-grid">
<p>«{esc(SITE["brand"])}» — вымышленная компания. Сайт показывает, как может выглядеть сайт с онлайн-бронированием для посуточной аренды.</p>
<p>Здесь будут телефон, мессенджеры и реквизиты владельца квартир.</p>
</div>
</footer>
<script src="{root}{asset("app.js")}" defer></script>
<script src="{root}{asset("chat.js")}" defer data-root="{root}" data-data="{asset("flats.json")}" data-flat="{chat_flat}"></script>
</body>
</html>
"""


def guest_options(max_guests: int, selected: int = 2) -> str:
    return "".join(
        f'<option value="{n}"{" selected" if n == selected else ""}>{n}</option>' for n in range(1, max_guests + 1)
    )


def where(flat: dict) -> str:
    return f'{esc(flat["street"])}, {minutes(flat["metro_min"])} до метро «{esc(flat["metro"])}»'


# --------------------------------------------------------------------------
# Главная
# --------------------------------------------------------------------------

REASONS = [
    ("Скидка тем, кто возвращается", "Гостям, которые уже жили у нас, даём 10% на следующую бронь на сайте."),
    ("Заселение без встречи", "Код от двери приходит в день заезда. Можно приехать ночью и никого не ждать."),
    ("Документы для командировок", "Заключаем договор, выставляем счёт и отдаём чек и акт для бухгалтерии."),
]

STEPS = [
    ("Выберите квартиру и даты", "Сайт сразу покажет цену за весь срок."),
    ("Внесите предоплату", "Оплачиваете первую ночь картой, остальное при заезде."),
    ("Получите код от двери", "В день заезда пришлём код и инструкцию с фотографиями парадной."),
    ("Выезжайте до 12:00", "Залог возвращаем в течение суток после выезда."),
]

REVIEWS = [
    ("Приехали в час ночи с поезда, код сработал с первого раза. В квартире было тепло и чисто.", "Марина, жила в студии на Рубинштейна"),
    ("Брали квартиру на две семьи. Два санузла и большой стол спасли наш отпуск с детьми.", "Алексей, жил у Австрийской площади"),
    ("Третья командировка подряд останавливаюсь здесь. Документы для бухгалтерии присылают в тот же день.", "Ирина, жила у Московского вокзала"),
]

FAQ = [
    ("Во сколько заезд и выезд?", f'Заезд с {SITE["checkin"]}, выезд до {SITE["checkout"]}. Если квартира свободна, заселим раньше или дадим выехать позже без доплаты.'),
    ("Можно ли приехать ночью?", "Да. Дверь открывается кодом, который мы присылаем в день заезда, поэтому время приезда не важно."),
    ("Нужен ли залог?", f'Да, {rub(SITE["deposit"])}. Он блокируется на карте при заезде и возвращается в течение суток после выезда.'),
    ("Как отменить бронь?", "Бесплатно за трое суток до заезда и раньше: предоплата вернётся полностью. При более поздней отмене предоплата за первую ночь не возвращается."),
    ("Можно ли с животными?", "В четырёх квартирах можно с небольшими собаками и кошками. Напишите нам перед бронированием, и мы подскажем, в каких."),
    ("Вы даёте отчётные документы?", "Да. Работаем по договору, выставляем счёт, отдаём чек и акт."),
]

OWNER_POINTS = [
    ("Страница на каждую квартиру", "С планом или фотографиями, ценой, описанием и тем, что рядом. Такие страницы находят в поиске по запросам вроде «квартира у Мариинского театра посуточно»."),
    ("Онлайн-бронирование", "В демо расчёт цены условный. На рабочем сайте подключается модуль бронирования из вашей системы управления: гость видит свободные даты и вносит предоплату."),
    ("Версия для телефона", "Сайт удобно листать и бронировать со смартфона."),
    ("Помощник в чате", "Кнопка «Спросить помощника» в углу экрана. В демо помощник отвечает по правилам. На рабочем сайте к нему подключается нейросеть и календарь броней: она подбирает свободные квартиры и отвечает на вопросы гостей круглосуточно."),
    ("Ваши фотографии", "В демо вместо фотографий стоят планы квартир. На вашем сайте будут ваши снимки, обработанные по свету и цвету."),
]


def card(flat: dict, plan: Plan) -> str:
    href = f'kvartiry/{flat["slug"]}.html'
    return f"""<li class="card" data-card="{flat["n"]}" data-price="{flat["price"]}" data-weekend="{flat["weekend"]}" data-guests="{flat["guests"]}" data-min="{flat["min_nights"]}">
<a class="card-plan" href="{href}" data-plan-link tabindex="-1" aria-hidden="true">{plan.svg(labels=False)}<span class="card-num">{flat["n"]}</span></a>
<div class="card-body">
<h3><a href="{href}" data-href="{href}">{esc(flat["name"])}</a></h3>
<p class="card-price"><span class="price-main" data-price-main>от{NBSP}{rub(flat["price"])}</span> <span data-price-note>за ночь</span></p>
<p class="card-where">{where(flat)}</p>
<p class="card-facts">{esc(flat["type"])}, {plan.area()}{NBSP}м², {guests_upto(flat["guests"])}</p>
</div>
</li>"""


def developer_contact() -> str:
    dev = SITE.get("developer", {})
    telegram = (dev.get("telegram") or "").lstrip("@")
    if telegram:
        name = f', {esc(dev["name"])}' if dev.get("name") else ""
        return f'<a class="button" href="https://t.me/{esc(telegram)}">Написать в Telegram</a><p>Отвечу в течение дня{name}.</p>'
    return '<p class="owners-contact">Контакты разработчика появятся здесь.</p>'


def build_index(plans: dict[int, Plan]) -> str:
    max_guests = max(f["guests"] for f in FLATS)
    min_price = min(f["price"] for f in FLATS)
    cards = "\n".join(card(f, plans[f["n"]]) for f in FLATS)
    reasons = "".join(f"<li><h3>{esc(t)}</h3><p>{esc(d)}</p></li>" for t, d in REASONS)
    steps = "".join(f"<li><h3>{esc(t)}</h3><p>{esc(d)}</p></li>" for t, d in STEPS)
    reviews = "".join(f"<li><blockquote><p>«{esc(q)}»</p></blockquote><footer>{esc(a)}</footer></li>" for q, a in REVIEWS)
    faq = "".join(f"<details><summary>{esc(q)}</summary><p>{esc(a)}</p></details>" for q, a in FAQ)
    owners = "".join(f"<li><strong>{esc(t)}</strong>{esc(d)}</li>" for t, d in OWNER_POINTS)

    body = f"""<main>
<div class="wrap hero">
<div>
<h1>Апартаменты посуточно в Санкт-Петербурге</h1>
<p class="hero-lead">Сдаём свои квартиры посуточно, без посредников. Выберите даты, и сайт покажет цену за весь срок.</p>
<form class="search" data-search novalidate>
<div class="field"><label for="s-in">Заезд</label><input id="s-in" name="in" type="date" required></div>
<div class="field"><label for="s-out">Выезд</label><input id="s-out" name="out" type="date" required></div>
<div class="field field-guests"><label for="s-g">Гости</label><select id="s-g" name="g">{guest_options(max_guests)}</select></div>
<button class="button" type="submit">Показать цены</button>
<p class="form-error" data-error role="alert"></p>
</form>
<p class="search-hint">Квартиры от {rub(min_price)} за ночь, заселение по коду в любое время.</p>
</div>
<figure class="map-figure">
{city_map("")}
<figcaption>Номера на схеме совпадают с номерами квартир в списке.</figcaption>
</figure>
</div>
<div class="skyline">{skyline_svg()}</div>

<section class="section section-paper" id="kvartiry" aria-labelledby="h-flats">
<div class="wrap">
<div class="section-head">
<h2 id="h-flats">Квартиры</h2>
<p class="section-note" data-default-note>Все десять в историческом центре, не дальше 15 минут пешком от метро.</p>
<p class="result" data-result hidden><span data-result-text></span> <button class="link-button" type="button" data-reset>Сбросить даты</button></p>
</div>
<ul class="cards">
{cards}
</ul>
<div class="cards-empty" data-empty hidden>
<h3>На эти даты ничего не подошло</h3>
<p>Часть квартир сдаётся от двух ночей. Добавьте ночь или уменьшите число гостей.</p>
</div>
</div>
</section>

<section class="section" aria-labelledby="h-why">
<div class="wrap">
<div class="section-head"><h2 id="h-why">Почему гости бронируют у нас на сайте</h2></div>
<ul class="reasons">{reasons}</ul>
</div>
</section>

<section class="section section-paper" id="zaselenie" aria-labelledby="h-steps">
<div class="wrap">
<div class="section-head"><h2 id="h-steps">Как проходит заселение</h2></div>
<ol class="steps">{steps}</ol>
</div>
</section>

<section class="section" aria-labelledby="h-reviews">
<div class="wrap">
<div class="section-head">
<h2 id="h-reviews">Отзывы гостей</h2>
<p class="section-note">Это примеры текста. На рабочем сайте здесь стоят настоящие отзывы ваших гостей.</p>
</div>
<ul class="reviews">{reviews}</ul>
</div>
</section>

<section class="section section-paper" aria-labelledby="h-faq">
<div class="wrap">
<div class="section-head"><h2 id="h-faq">Частые вопросы</h2><p class="section-note"><a href="pravila.html">Все правила проживания</a></p></div>
<div class="faq">{faq}</div>
</div>
</section>

<section class="section owners" id="owners" aria-labelledby="h-owners">
<div class="wrap owners-grid">
<div>
<h2 id="h-owners">Сдаёте квартиры посуточно? Сделаю такой сайт для вас</h2>
<p>Это демонстрационный сайт. Он показывает, что получит собственник или управляющая компания: свой адрес в интернете, страницы квартир и приём броней напрямую, без комиссии площадок.</p>
{developer_contact()}
</div>
<ul>{owners}</ul>
</div>
</section>
</main>"""
    return page(
        root="",
        title=f'Апартаменты посуточно в Санкт-Петербурге — {SITE["brand"]}',
        description=f'Десять апартаментов посуточно в историческом центре Санкт-Петербурга от {rub(min_price)} за ночь. Бронирование напрямую у собственника, заселение по коду в любое время.',
        body=body,
        current="",
    )


# --------------------------------------------------------------------------
# Страница квартиры
# --------------------------------------------------------------------------


def build_flat(flat: dict, plan: Plan) -> str:
    area = plan.area()
    amenities = "".join(f"<li>{esc(a)}</li>" for a in flat["amenities"])
    nearby = f'<li><span>Метро «{esc(flat["metro"])}»</span><span>{minutes(flat["metro_min"])} пешком</span></li>'
    nearby += "".join(f"<li><span>{esc(name)}</span><span>{minutes(m)} пешком</span></li>" for name, m in flat["nearby"])
    index = FLATS.index(flat)
    others = [FLATS[(index + i) % len(FLATS)] for i in (1, 2, 3)]
    others_html = "".join(
        f'<li><a href="{o["slug"]}.html"><strong>{esc(o["name"])}</strong>'
        f'<span>{esc(o["type"])}, {guests_upto(o["guests"])}, от{NBSP}{rub(o["price"])}</span></a></li>'
        for o in others
    )
    min_note = (
        f'Бронь от{NBSP}{flat["min_nights"]}{NBSP}ночей. ' if flat["min_nights"] > 1 else ""
    )
    json_ld = json.dumps(
        {
            "@context": "https://schema.org",
            "@type": "Apartment",
            "name": flat["name"],
            "description": flat["lead"],
            "floorSize": {"@type": "QuantitativeValue", "value": area, "unitCode": "MTK"},
            "occupancy": {"@type": "QuantitativeValue", "maxValue": flat["guests"]},
            "address": {
                "@type": "PostalAddress",
                "addressLocality": SITE["city"],
                "streetAddress": flat["street"],
                "addressCountry": "RU",
            },
            "geo": {"@type": "GeoCoordinates", "latitude": flat["lat"], "longitude": flat["lon"]},
        },
        ensure_ascii=False,
    )
    body = f"""<main class="wrap">
<p class="crumbs"><a href="../index.html#kvartiry">Квартиры</a> / {esc(flat["district"])}</p>
<div class="flat-head">
<h1>{esc(flat["name"])}</h1>
<p class="flat-where">{where(flat)}</p>
</div>
<div class="flat-grid">
<div class="flat-main">
<figure class="flat-plan">
{plan.svg(labels=True, title=f'План квартиры: {flat["name"]}, {area} м²')}
<figcaption>План квартиры, {area}{NBSP}м². В демо он стоит на месте фотографий.</figcaption>
</figure>
<div>
<p class="flat-lead">{esc(flat["lead"])}</p>
<p class="flat-text">{esc(flat["text"])}</p>
</div>
<dl class="facts">
<div><dt>Тип</dt><dd>{esc(flat["type"])}</dd></div>
<div><dt>Площадь</dt><dd>{area}{NBSP}м²</dd></div>
<div><dt>Гости</dt><dd>{guests_upto(flat["guests"])}</dd></div>
<div><dt>Этаж</dt><dd>{esc(flat["floor"])}</dd></div>
<div><dt>Спальные места</dt><dd>{esc(flat["beds"])}</dd></div>
<div><dt>Заезд и выезд</dt><dd>с {SITE["checkin"]}, до {SITE["checkout"]}</dd></div>
</dl>
<section aria-labelledby="h-in">
<h2 id="h-in">В квартире</h2>
<ul class="ticks">{amenities}</ul>
</section>
<section aria-labelledby="h-near">
<h2 id="h-near">Рядом</h2>
<div class="nearby">
<ul>{nearby}</ul>
{city_map("../", current=flat["n"])}
</div>
</section>
<section aria-labelledby="h-others">
<h2 id="h-others">Другие квартиры</h2>
<ul class="others">{others_html}</ul>
</section>
</div>
<aside class="booking" aria-label="Бронирование">
<p class="booking-price">от{NBSP}{rub(flat["price"])}<small>за ночь в будни, {rub(flat["weekend"])} в выходные</small></p>
<form class="booking-form" data-booking data-name="{esc(flat["name"])}" data-price="{flat["price"]}" data-weekend="{flat["weekend"]}" data-min="{flat["min_nights"]}" data-deposit="{SITE["deposit"]}" novalidate>
<div class="field"><label for="b-in">Заезд</label><input id="b-in" name="in" type="date" required></div>
<div class="field"><label for="b-out">Выезд</label><input id="b-out" name="out" type="date" required></div>
<div class="field field-wide"><label for="b-g">Гости</label><select id="b-g" name="g">{guest_options(flat["guests"], min(2, flat["guests"]))}</select></div>
<p class="form-error" data-error role="alert"></p>
<button class="button" type="submit">Забронировать</button>
</form>
<div class="booking-total" data-total hidden aria-live="polite"></div>
<p class="booking-note">{min_note}Бесплатная отмена за трое суток до заезда.</p>
</aside>
</div>
</main>
<dialog data-dialog aria-labelledby="h-dialog">
<h2 id="h-dialog">Здесь откроется оплата</h2>
<p class="dialog-summary" data-dialog-summary></p>
<p>Это демонстрационный сайт, поэтому бронь не создаётся и данные никуда не отправляются.</p>
<p>На рабочем сайте на этом шаге открывается модуль бронирования: гость вводит контакты, вносит предоплату и получает подтверждение на почту.</p>
<form method="dialog"><button class="button" type="submit">Понятно</button></form>
</dialog>"""
    return page(
        root="../",
        title=f'{flat["name"]} посуточно — {SITE["brand"]}, Санкт-Петербург',
        description=f'{flat["lead"]} {flat["type"]}, {area} м², {guests_upto(flat["guests"]).replace(NBSP, " ")}, от {rub(flat["price"]).replace(NBSP, " ")} за ночь.',
        body=body,
        current="flats",
        extra_head=f'<script type="application/ld+json">{json_ld}</script>\n',
        chat_flat=flat["slug"],
    )


# --------------------------------------------------------------------------
# Правила и вопросы
# --------------------------------------------------------------------------


def build_rules() -> str:
    faq = "".join(f"<details><summary>{esc(q)}</summary><p>{esc(a)}</p></details>" for q, a in FAQ)
    body = f"""<main class="wrap">
<div class="page-head">
<h1>Правила и вопросы</h1>
</div>
<div class="prose section" style="padding-top:0">
<h2>Коротко</h2>
<table class="rules-table">
<tr><th scope="row">Заезд</th><td>с {SITE["checkin"]}, по коду от двери</td></tr>
<tr><th scope="row">Выезд</th><td>до {SITE["checkout"]}</td></tr>
<tr><th scope="row">Предоплата</th><td>стоимость первой ночи, картой на сайте</td></tr>
<tr><th scope="row">Залог</th><td>{rub(SITE["deposit"])}, возвращаем в течение суток после выезда</td></tr>
<tr><th scope="row">Отмена</th><td>бесплатно за трое суток до заезда</td></tr>
<tr><th scope="row">Документы</th><td>паспорт при заселении, для компаний — договор, счёт и акт</td></tr>
</table>

<h2>В квартирах нельзя</h2>
<ul>
<li>Курить, включая электронные сигареты и кальяны.</li>
<li>Шуметь с 22:00 до 8:00.</li>
<li>Проводить вечеринки и приглашать гостей сверх числа, указанного в брони.</li>
</ul>

<h2>Уборка и бельё</h2>
<p>К заезду квартира убрана, постели застелены, на каждого гостя лежит комплект полотенец. При проживании дольше семи ночей раз в неделю меняем бельё и убираем бесплатно.</p>

<h2>Частые вопросы</h2>
<div class="faq">{faq}</div>
</div>
</main>"""
    return page(
        root="",
        title=f'Правила проживания и частые вопросы — {SITE["brand"]}',
        description="Заезд и выезд, предоплата, залог, отмена брони, документы для командировок и ответы на частые вопросы гостей.",
        body=body,
        current="rules",
    )


def build_404() -> str:
    body = """<main class="wrap">
<div class="page-head">
<h1>Такой страницы нет</h1>
</div>
<div class="prose section" style="padding-top:0">
<p>Возможно, ссылка устарела. Все квартиры собраны на главной странице.</p>
<p style="margin-top:24px"><a class="button" href="/demo-posutochno/index.html#kvartiry">Смотреть квартиры</a></p>
</div>
</main>"""
    return page(
        root="/demo-posutochno/",
        title=f'Страница не найдена — {SITE["brand"]}',
        description="Страница не найдена.",
        body=body,
    )


FAVICON = (
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32">'
    '<rect width="32" height="32" rx="4" fill="#17283a"/>'
    '<path d="M9 27V14a7 7 0 0 1 14 0v13z" fill="#f2c230"/></svg>\n'
)


CHAT_FIELDS = (
    "n", "slug", "name", "type", "street", "district", "metro", "metro_min", "guests", "beds",
    "floor", "price", "weekend", "min_nights", "lead", "amenities", "nearby", "pets",
)


def write_chat_data(plans: dict[int, Plan]) -> None:
    """Данные, по которым отвечает помощник в чате: только то, что уже есть на страницах."""
    flats = []
    for flat in FLATS:
        item = {key: flat[key] for key in CHAT_FIELDS}
        item["area"] = plans[flat["n"]].area()
        item["keywords"] = flat["chat_keywords"]
        flats.append(item)
    data = {
        "site": {"checkin": SITE["checkin"], "checkout": SITE["checkout"], "deposit": SITE["deposit"]},
        "flats": flats,
    }
    (ROOT / "assets" / "flats.json").write_text(
        json.dumps(data, ensure_ascii=False, separators=(",", ":")), encoding="utf-8"
    )


def main() -> None:
    plans = {f["n"]: Plan(f["layout"], f["mirror"], f["scale"]) for f in FLATS}
    write_chat_data(plans)
    (ROOT / "index.html").write_text(build_index(plans), encoding="utf-8")
    (ROOT / "pravila.html").write_text(build_rules(), encoding="utf-8")
    (ROOT / "404.html").write_text(build_404(), encoding="utf-8")
    (ROOT / "assets" / "favicon.svg").write_text(FAVICON, encoding="utf-8")
    out = ROOT / "kvartiry"
    out.mkdir(exist_ok=True)
    for flat in FLATS:
        (out / f'{flat["slug"]}.html').write_text(build_flat(flat, plans[flat["n"]]), encoding="utf-8")
    # GitHub Pages не должен прогонять сайт через Jekyll
    (ROOT / ".nojekyll").write_text("", encoding="utf-8")
    for flat in FLATS:
        print(f'{flat["n"]:>2}. {flat["name"]}: {plans[flat["n"]].area()} м², до {flat["guests"]} гостей')
    print("Готово: index.html, pravila.html, 404.html, kvartiry/ (10 страниц)")


if __name__ == "__main__":
    main()
