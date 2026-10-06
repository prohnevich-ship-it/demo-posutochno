"""Панорама Петербурга для главной страницы: силуэты главных достопримечательностей.

Рисунок собран из простых фигур, чтобы на странице он был лёгким и
полупрозрачным фоном, а не иллюстрацией, которая спорит с текстом.
Слева направо: Спас на Крови, Ростральная колонна, разведённый Дворцовый мост
со шпилем Петропавловского собора, Адмиралтейство, Исаакиевский собор.
"""

from __future__ import annotations

import random

WIDTH = 2400
HEIGHT = 262
BASE = 240  # линия набережной в системе координат достопримечательностей
SHIFT_X = 400  # достопримечательности занимают середину панорамы
QUAY = 12  # высота гранитной набережной под зданиями
SHIFT_Y = HEIGHT - QUAY - BASE


def _rect(x1: float, y1: float, x2: float, y2: float) -> str:
    return f"M{x1} {y1}H{x2}V{y2}H{x1}Z"


def _poly(*points: tuple[float, float]) -> str:
    return "M" + "L".join(f"{x} {y}" for x, y in points) + "Z"


def _onion(cx: float, base_y: float, r: float, height: float) -> str:
    """Луковичная глава: основание на base_y, ширина 2r, высота height."""
    top = base_y - height
    return (
        f"M{cx - r * 0.72} {base_y}"
        f"C{cx - r * 1.5} {base_y - height * 0.38} {cx - r * 0.35} {base_y - height * 0.62} {cx} {top}"
        f"C{cx + r * 0.35} {base_y - height * 0.62} {cx + r * 1.5} {base_y - height * 0.38} {cx + r * 0.72} {base_y}Z"
    )


def _cross(cx: float, top_y: float, size: float = 9) -> str:
    return _rect(cx - 0.9, top_y, cx + 0.9, top_y + size) + _rect(cx - 3, top_y + 2.5, cx + 3, top_y + 4.2)


def _savior_on_blood() -> str:
    d = []
    # колокольня слева
    d.append(_rect(138, 128, 172, BASE))
    d.append(_rect(134, 122, 176, 128))
    d.append(_onion(155, 122, 17, 50))
    d.append(_cross(155, 61, 12))
    # основной объём
    d.append(_rect(172, 178, 318, BASE))
    # центральный шатёр
    d.append(_poly((220, 178), (226, 150), (240, 84), (254, 150), (260, 178)))
    d.append(_onion(240, 86, 7, 18))
    d.append(_cross(240, 58, 11))
    # четыре главы вокруг шатра
    for cx, drum_top, r, h in ((196, 146, 12, 34), (284, 146, 12, 34), (213, 160, 8, 22), (267, 160, 8, 22)):
        d.append(_rect(cx - r * 0.72, drum_top, cx + r * 0.72, 178))
        d.append(_onion(cx, drum_top, r, h))
        d.append(_cross(cx, drum_top - h - 9, 9))
    # апсиды справа
    d.append(f"M318 {BASE}V204Q334 192 350 204V{BASE}Z")
    d.append(f"M300 178Q309 164 318 178Z")
    return "".join(d)


def _rostral_column() -> str:
    cx = 430
    d = [
        _rect(cx - 20, 214, cx + 20, BASE),
        _rect(cx - 15, 206, cx + 15, 214),
        _poly((cx - 9, 206), (cx - 7, 112), (cx + 7, 112), (cx + 9, 206)),
        _rect(cx - 12, 106, cx + 12, 112),
        _poly((cx - 11, 106), (cx - 7, 96), (cx + 7, 96), (cx + 11, 106)),
        _poly((cx - 5, 96), (cx, 80), (cx + 5, 96)),
    ]
    # ростры — носы кораблей по сторонам колонны
    for y in (188, 162, 136):
        d.append(_poly((cx - 8, y), (cx - 21, y - 9), (cx - 20, y - 13), (cx - 8, y - 6)))
        d.append(_poly((cx + 8, y), (cx + 21, y - 9), (cx + 20, y - 13), (cx + 8, y - 6)))
    return "".join(d)


def _bridge() -> str:
    d = []
    # пролёты у берегов с арками
    d.append(f"M500 198H622V{BASE}H612Q561 204 510 {BASE}H500Z")
    d.append(f"M978 198H1100V{BASE}H1090Q1039 204 988 {BASE}H978Z")
    # опоры разводного пролёта
    d.append(_rect(612, 192, 650, BASE))
    d.append(_rect(950, 192, 988, BASE))
    # разведённые крылья
    d.append(_poly((640, 194), (652, 204), (752, 96), (740, 88)))
    d.append(_poly((960, 194), (948, 204), (848, 96), (860, 88)))
    # фонари на пролётах
    for x in (530, 580, 1020, 1070):
        d.append(_rect(x - 0.9, 176, x + 0.9, 198))
        d.append(f"M{x - 3.2} 176a3.2 3.2 0 1 0 6.4 0a3.2 3.2 0 1 0 -6.4 0Z")
    return "".join(d)


def _peter_and_paul() -> str:
    cx = 800
    return "".join(
        [
            # стена крепости с бастионами
            _poly((690, BASE), (700, 222), (760, 222), (764, 216), (836, 216), (840, 222), (900, 222), (910, BASE)),
            # собор и колокольня
            _rect(cx + 14, 196, cx + 70, 222),
            f"M{cx + 46} 196Q{cx + 56} 180 {cx + 66} 196Z",
            _rect(cx - 16, 168, cx + 16, 222),
            _rect(cx - 12, 142, cx + 12, 168),
            _rect(cx - 9, 122, cx + 9, 142),
            f"M{cx - 9} 122Q{cx} 104 {cx + 9} 122Z",
            _poly((cx - 3.2, 110), (cx, 24), (cx + 3.2, 110)),
            f"M{cx - 2.6} 22a2.6 2.6 0 1 0 5.2 0a2.6 2.6 0 1 0 -5.2 0Z",
            _cross(cx, 8, 11),
        ]
    )


def _admiralty() -> str:
    cx = 1190
    return "".join(
        [
            _rect(cx - 82, 208, cx + 82, BASE),
            _rect(cx - 82, 204, cx + 82, 208),
            _rect(cx - 28, 166, cx + 28, 208),
            _rect(cx - 31, 162, cx + 31, 166),
            _rect(cx - 20, 136, cx + 20, 162),
            _rect(cx - 23, 132, cx + 23, 136),
            f"M{cx - 17} 132Q{cx} 104 {cx + 17} 132Z",
            _rect(cx - 5, 106, cx + 5, 116),
            _poly((cx - 3.4, 108), (cx, 36), (cx + 3.4, 108)),
            # кораблик на шпиле
            _poly((cx - 8, 32), (cx + 8, 32), (cx + 5, 37), (cx - 5, 37)),
            _poly((cx - 0.8, 32), (cx - 0.8, 18), (cx + 7, 30), (cx + 0.8, 30), (cx + 0.8, 32)),
        ]
    )


def _isaac() -> str:
    cx = 1400
    d = [
        _rect(cx - 84, 192, cx + 84, BASE),
        # портик с фронтоном
        _poly((cx - 44, 192), (cx, 174), (cx + 44, 192)),
        # барабан с колоннадой и главный купол
        _rect(cx - 33, 132, cx + 33, 176),
        _rect(cx - 37, 127, cx + 37, 132),
        f"M{cx - 31} 127C{cx - 29} 92 {cx - 10} 76 {cx} 76C{cx + 10} 76 {cx + 29} 92 {cx + 31} 127Z",
        _rect(cx - 7, 60, cx + 7, 78),
        f"M{cx - 7} 60Q{cx} 48 {cx + 7} 60Z",
        _cross(cx, 38, 12),
    ]
    # четыре малые колокольни по углам
    for x in (cx - 66, cx + 66):
        d.append(_rect(x - 12, 166, x + 12, 192))
        d.append(f"M{x - 12} 166Q{x} 146 {x + 12} 166Z")
        d.append(_cross(x, 144, 9))
    return "".join(d)


def _rooftops() -> str:
    """Рядовая застройка набережных: фон, который связывает достопримечательности."""
    rng = random.Random(1703)  # год основания города, чтобы рисунок не менялся от сборки к сборке
    ground = HEIGHT - QUAY
    d = [f"M0 {ground}V{ground - 16}"]
    x = 0.0
    while x < WIDTH:
        width = rng.uniform(34, 86)
        top = ground - rng.uniform(14, 40)
        d.append(f"V{top:.0f}")
        if rng.random() < 0.3:  # печная труба
            chimney = min(x + rng.uniform(8, width - 12), WIDTH - 8)
            d.append(f"H{chimney:.0f}V{top - 8:.0f}h5V{top:.0f}")
        x = min(x + width, WIDTH)
        d.append(f"H{x:.0f}")
    d.append(f"V{ground}Z")
    return "".join(d)


def skyline_svg() -> str:
    landmarks = _savior_on_blood() + _rostral_column() + _bridge() + _admiralty() + _isaac()
    return (
        f'<svg viewBox="0 0 {WIDTH} {HEIGHT}" preserveAspectRatio="xMidYMax slice" '
        f'aria-hidden="true" focusable="false">'
        f'<path class="skyline-far" d="{_rooftops()}"/>'
        f'<rect class="skyline-near" y="{HEIGHT - QUAY}" width="{WIDTH}" height="{QUAY}"/>'
        f'<g transform="translate({SHIFT_X} {SHIFT_Y})">'
        f'<path class="skyline-far" d="{_peter_and_paul()}"/>'
        f'<path class="skyline-near" d="{landmarks}"/>'
        f"</g></svg>"
    )
