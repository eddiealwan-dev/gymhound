"""Skinless anatomical head in right-facing profile: strong jaw, short crop, calm expression, ear.
Torso-local coordinates (same space as the old faceless head: crown ~y44, chin ~y91, ear ~x153)."""

SKULL = ("M140 70 C138 58 144 47 155 44.5 C165 42.5 172.5 47.5 174.2 55 C174.8 58 175.2 60.6 175.6 62.4 "
         "C175.4 63.6 174.6 64.4 174.6 65.4 C175.6 68 177.6 71.4 178.6 73.6 C179 74.6 178.8 75.6 177.6 76 "
         "C176.8 76.2 176.2 76.2 175.8 76.4 C176.6 77.2 177 78.4 176.8 79.4 C176.6 79.8 176 80 175.6 80.1 "
         "C176.2 80.6 176.6 81.6 176.2 82.6 C175.6 83.4 175 83.8 175 84.6 C175.4 86 176.6 87.4 176.6 89 "
         "C176.4 90.6 175 91.4 173 91.6 C169 92 165 91.6 161.8 90.8 L157.2 88.4 C153 86 150 84 147 84 "
         "C143 82 140.5 77 140 70 Z")
FACE_MUSCLES = [
    ("frontalis", "M171.6 53.6 C173.4 56 174.6 59.2 175.4 62.2 L169.2 62.6 C169 59.6 167.8 57.2 166 55.6 C168 55 170 54.4 171.6 53.6 Z"),
    ("browRidge", "M169.2 62.4 L175.5 62.2 C175.4 63.4 174.8 64.2 174.4 64.8 L169.4 63.8 Z"),
    ("temporalis", "M160.6 68.4 C160.2 63.4 161 59.8 163.4 57.6 C166.2 57.6 168.2 59.6 168.4 62.6 C167.6 65 165.8 66.8 163.6 68.2 Z"),
    ("orbicularisOculi", "M166.5 65.2 C166.8 62.2 170 60.8 173.2 61.8 C175 62.6 175.2 65 174.7 67 C174 69.4 171.4 70.6 168.8 70 C167.2 69.4 166.4 67.4 166.5 65.2 Z"),
    ("spleniusCapitis", "M141.6 74 C143.5 72 146 69 149 67.6 L149.2 77 C149.6 80 151 83 153 85.2 C150 84 147 84 145 83 C143 81.4 142 78 141.6 74 Z"),
    ("buccinator", "M166 71.5 C169 72 171.5 75 172.8 79 C172.6 81.6 171.4 83.6 169.4 84.4 C167.4 81 166.2 76 166 71.5 Z"),
    ("masseter", "M158.4 71.4 C162.6 70.6 167 71 168.8 72.2 C169.4 77.6 168.8 83.2 166.8 88.8 C163.4 89.8 159.8 89.2 157.2 87.2 C156.4 81.6 156.8 76.2 158.4 71.4 Z"),
    ("nasal", "M174.6 65.4 C175.6 68 177.6 71.4 178.6 73.6 C179 74.6 178.8 75.6 177.6 76 L175.6 76.2 C174.6 72.6 174 69 174.6 65.4 Z"),
    ("zygomaticus", "M166.8 71 L169.4 70.6 L175 79 L173.6 80 Z"),
    ("levatorLabii", "M171.2 70.4 L173.4 70.2 L175.6 76.4 L174.4 76.8 Z"),
    ("orbicularisOris", "M173.4 76.6 C175.6 76.2 176.9 77.4 176.8 79.4 C176.7 80.6 176.6 81.8 176.2 82.6 C175.4 83.6 173.8 83.8 172.8 82.8 C172.4 80.6 172.4 78.4 173.4 76.6 Z"),
    ("mentalis", "M172.4 84 C174.6 84 176.4 86.4 176.6 89 C176.2 90.6 174.8 91.2 173 91.4 C171.8 89 171.4 86.4 172.4 84 Z"),
]
FACE_FIB = ("M160 73 L165.6 87 M162.4 72.2 L167.2 86 M164.8 71.8 L168 82 M158.6 76 L162.4 88.2 "
            "M162 61 L166.4 66.6 M164.2 59.6 L167.4 63.2 M170 55 L173 61.6 M168.2 56.4 L171 62 "
            "M167.6 74 L171 82 M169.8 73.2 L172 79.4 M173.6 85.6 L174.8 89.4 M176.4 70.4 L178.8 74")
HAIR = ("M171.5 53.5 C170 47.5 164 43.4 155 43.6 C145 44 138.5 51 138.8 61 C139 67 140 71.5 141.6 74 "
        "C143.5 72 145.5 70 147 66.5 C150 62.4 153 60.8 156 61 C157.6 63.5 158.4 66 158.6 68.6 L160.4 68.4 "
        "C160 63.6 160.6 59.6 163 57 C166 55.5 169 54.8 171.5 53.5 Z")
HAIR_STRANDS = " ".join(
    f"M{x:.1f} {y:.1f} l{dx:.1f} {dy:.1f}" for x, y, dx, dy in [
        (168, 50, 1.6, 1.6), (165, 47.6, 2, 1.2), (161.6, 46, 2.2, .8), (158, 45.2, 2.2, .4), (154.4, 45.2, 2.2, 0),
        (150.6, 45.8, 2, -.4), (147, 47.2, 2, -.8), (143.8, 49.4, 1.8, -1.2), (141.4, 52.6, 1.4, -1.6), (140, 56.4, 1, -1.8),
        (139.8, 60.4, .6, -2), (140.2, 64.4, .4, -2), (141.2, 68.2, .2, -2), (166.4, 51.6, 1.6, 1.6), (162.6, 49.8, 2, 1.2),
        (158.8, 48.8, 2.2, .6), (155, 48.6, 2.2, .2), (151.2, 49.2, 2, -.4), (147.6, 50.6, 2, -.8), (144.6, 52.8, 1.8, -1.2),
        (142.6, 56, 1.4, -1.6), (142, 59.8, 1, -1.8), (142.4, 63.6, .6, -2), (143.6, 67.2, .4, -2), (163.2, 53.2, 1.6, 1.4),
        (159.6, 52.2, 2, 1), (155.8, 51.8, 2, .4), (152, 52.4, 2, -.2), (148.6, 54, 1.8, -.8), (146, 56.6, 1.6, -1.2),
        (145, 60.2, 1.2, -1.6), (145.6, 63.6, .8, -1.8), (160.6, 56.2, 1.2, 1.6), (157, 55.4, 1.8, 1), (153.4, 55.6, 1.8, .4),
        (150.2, 57, 1.6, -.4), (148, 59.6, 1.4, -1), (161.6, 60.4, .6, 2), (159.4, 62.6, .4, 2)]
)
EAR = "M152.8 63.4 C149.9 63.6 149 67 149.3 70.4 C149.6 73.6 150.9 76.6 153.4 77.3 C155 77.6 156.1 76.6 156 75 C155.9 73.9 156.4 72.8 156.6 71.4 C157 67 155.5 63.4 152.8 63.4 Z"
EAR_DETAIL = "M154.8 66.6 C153.4 67 152.6 68.8 152.8 70.8 C153 72.4 153.8 73.6 154.8 73.8 M152.9 68 C153.6 67 154.6 66.6 155.4 66.8 M156.2 68.4 C155.4 68.6 154.8 69.2 154.6 70 M155 73.4 C155.6 73.2 156.1 73.5 156.1 74"
HELIX = "M155.4 65.2 C154.6 64 153.6 63.8 152.8 63.9 C150.4 64.1 149.6 67 149.8 70.2 C150 72.8 151 75.2 152.8 76.4"
SCAPHA = "M154.6 65.8 C153.6 65 152.6 65 152 65.4 C150.8 66.4 150.4 68.6 150.6 70.6 C150.8 72.6 151.6 74.2 152.6 75"
LOBE = "M151.6 75.6 C152.4 76.6 153.8 77 155 76.4"
TRAGUS = "M156.6 69.6 C157.4 70 157.5 71 156.9 71.6 C156.6 71 156.5 70.3 156.6 69.6 Z"
CONCHA = "M155 69 C154 69.2 153.8 70.8 154.4 71.8 C155 72.4 155.9 72.1 156.1 71 C156.2 70 155.7 69 155 69 Z"
ZYGOMATIC_ARCH = "M157.4 70 C161.2 69.2 165 69 169.4 69.4 L169.3 70.5 C165 70.3 161.2 70.5 157.5 71.2 Z"
ALAR = "M175.1 74.4 A1.5 1.1 -20 1 0 178.1 74.4 A1.5 1.1 -20 1 0 175.1 74.4 Z"
EYE = "M169.8 65.6 C171 64.2 173 63.8 174.4 65 C173.2 66.6 171.2 67 169.8 65.6 Z"
IRIS = "M172.6 64.4 C173.6 64.4 174.2 64.8 174.4 65 C173.8 65.8 173.2 66.2 172.6 66.3 C172.2 65.6 172.2 65 172.6 64.4 Z"
UPPER_LID = "M169.4 65.5 C170.8 63.4 173.4 63 175 64.8 C173.4 64.5 171.4 64.6 169.4 65.7 Z"
UPPER_LIP = "M174.8 76.6 C176 77 176.9 77.9 176.9 78.9 C176.9 79.5 176.4 79.9 175.6 80.1 C174.6 80.2 173.6 80 172.9 79.6 C173 78.4 173.6 77.2 174.8 76.6 Z"
LOWER_LIP = "M172.9 80.6 C173.8 80.3 175 80.3 175.8 80.5 C176.6 80.9 176.8 81.8 176.3 82.6 C175.7 83.3 174.6 83.5 173.6 83.2 C173.2 82.4 172.9 81.5 172.9 80.6 Z"
LIP_LINES = "M172.4 80.2 C173.6 80.45 174.9 80.4 176.1 80.25 M172.5 79.4 C172.1 80 172.2 80.8 172.7 81.3 M173.4 84 C174.3 84.35 175 84.25 175.5 84"
LIP_LIGHTS = "M175.9 76.5 C176.5 77.1 176.8 77.8 176.8 78.4 M174 81.5 C174.8 81.3 175.6 81.4 176.1 81.8"
JAW_LINE = "M156.8 72 C156 77 156 81.6 156.8 85.6 C157.4 88.4 159.8 90.2 163 90.8 C167 91.4 171 91.2 174.4 90.4"

DEEP = ("M157 68.6 C161 66 166 60 170 56 L175.4 62.4 L178.6 73.6 L176.8 79.4 L176.6 89 C176.4 90.6 175 91.4 173 91.6 "
        "C169 92 165 91.6 161.8 90.8 L157.2 88.4 C156 82 156 75 157 68.6 Z")


def _bez(p0, p1, p2, p3, n=12):
    return [tuple((1-t)**3*a + 3*(1-t)**2*t*b + 3*(1-t)*t**2*c + t**3*d for a, b, c, d in zip(p0, p1, p2, p3))
            for t in [i / n for i in range(n + 1)]]


def _poly(path):
    import re as _re
    toks = _re.findall(r"[MLCZ]|-?\d+\.?\d*", path)
    pts, cur, i, cmd = [], None, 0, None
    while i < len(toks):
        if toks[i] in "MLCZ":
            cmd = toks[i]; i += 1
            if cmd == "Z":
                continue
        if cmd in "ML":
            cur = (float(toks[i]), float(toks[i + 1])); pts.append(cur); i += 2
        elif cmd == "C":
            c = [float(t) for t in toks[i:i + 6]]; i += 6
            pts += _bez(cur, (c[0], c[1]), (c[2], c[3]), (c[4], c[5]))[1:]; cur = (c[4], c[5])
    return pts


def _inside(pt, poly):
    x, y = pt; c = False
    for (x1, y1), (x2, y2) in zip(poly, poly[1:] + poly[:1]):
        if (y1 > y) != (y2 > y) and x < (x2 - x1) * (y - y1) / (y2 - y1) + x1:
            c = not c
    return c


def crew_cut(seed=7):
    import math, random
    rnd = random.Random(seed)
    poly = _poly(HAIR)
    crown = (152.5, 48.5)
    out = []
    y = 43.0
    while y < 75:
        x = 137.0 + (rnd.random() * .9)
        while x < 173:
            p = (x + rnd.uniform(-.25, .25), y + rnd.uniform(-.25, .25))
            if _inside(p, poly):
                dx, dy = p[0] - crown[0], p[1] - crown[1]
                d = math.hypot(dx, dy) or 1
                ang = math.atan2(dy, dx) + rnd.uniform(-.25, .25)
                ln = 1.0 + .5 * rnd.random() - min(.5, max(0, (p[1] - 62) / 24))
                out.append(f"M{p[0]:.1f} {p[1]:.1f}l{math.cos(ang) * ln:.2f} {math.sin(ang) * ln:.2f}")
            x += .95
        y += .9
    return " ".join(out)


HEAD_CSS = """.skull{fill:#253140;stroke:#5EC8FF;stroke-opacity:.5;stroke-width:1}
.hair{fill:#121922;stroke:#5EC8FF;stroke-opacity:.35;stroke-width:.8}
.strand{fill:none;stroke:#556A80;stroke-opacity:.6;stroke-width:.38;stroke-linecap:round}
.deep{fill:#1A2430}
.face .base{stroke-width:.45}
.ear{fill:#34465A;stroke:rgba(0,0,0,.8);stroke-width:.45}
.scapha{fill:none;stroke:#0E151E;stroke-opacity:.8;stroke-width:.5;stroke-linecap:round}
.earFold{fill:none;stroke:#C2D2E1;stroke-opacity:.65;stroke-width:.5;stroke-linecap:round}
.concha{fill:#141C26}
.sclera{fill:#C9D5DF}
.iris{fill:#1E3446;stroke:#7FD4FF;stroke-opacity:.6;stroke-width:.3}
.lid{fill:#3A4A5C;stroke:rgba(0,0,0,.6);stroke-width:.4}
.mouth{fill:none;stroke:#0B1017;stroke-width:.6;stroke-linecap:round}
.lip{fill:#55505F;stroke:rgba(0,0,0,.8);stroke-width:.4}
.lipLight{fill:none;stroke:#E6EEF5;stroke-opacity:.45;stroke-width:.4;stroke-linecap:round}
.helix{fill:none;stroke:#B6C8DA;stroke-opacity:.7;stroke-width:.55;stroke-linecap:round}
.jaw{fill:none;stroke:#DCE6EF;stroke-opacity:.55;stroke-width:1;stroke-linecap:round}"""


def head_svg(clip_id="hairClip"):
    muscles = "".join(f'<path d="{d}"></path>' for _, d in FACE_MUSCLES)
    return (f'<path class="skull" d="{SKULL}"></path>'
            f'<path class="deep" d="{DEEP}"></path><g class="face"><g class="base">{muscles}</g></g>'
            f'<g class="vol">{muscles}</g>'
            f'<path class="fib" d="{FACE_FIB}"></path>'
            f'<path class="bone" style="fill-opacity: .45" d="{ZYGOMATIC_ARCH}"></path>'
            f'<path class="bone" style="fill-opacity: .22" d="{ALAR}"></path>'
            f'<path class="jaw" d="{JAW_LINE}"></path>'
            f'<path class="sclera" d="{EYE}"></path><path class="iris" d="{IRIS}"></path>'
            f'<circle cx="173.6" cy="64.9" r=".35" fill="#E8F6FF"></circle>'
            f'<path class="lid" d="{UPPER_LID}"></path>'
            f'<path class="lip" d="{UPPER_LIP}"></path><path class="lip" d="{LOWER_LIP}"></path>'
            f'<path class="vol" d="{UPPER_LIP}"></path><path class="vol" d="{LOWER_LIP}"></path>'
            f'<path class="mouth" d="{LIP_LINES}"></path><path class="lipLight" d="{LIP_LIGHTS}"></path>'
            f'<clipPath id="{clip_id}"><path d="{HAIR}"></path></clipPath>'
            f'<path class="hair" d="{HAIR}"></path><path class="strand" clip-path="url(#{clip_id})" d="{crew_cut()}"></path>'
            f'<path class="volHead" style="opacity: .5" d="{HAIR}"></path>'
            f'<path class="ear" d="{EAR}"></path><path class="vol" style="opacity: .35; stroke: none" d="{EAR}"></path>'
            f'<path class="concha" d="{CONCHA}"></path><path class="ear" d="{TRAGUS}"></path>'
            f'<path class="scapha" d="{SCAPHA}"></path><path class="helix" d="{HELIX}"></path><path class="earFold" d="{EAR_DETAIL}"></path><path class="lipLight" d="{LOBE}"></path>'
            f'<path class="spec" d="M150 48.6 C154 46 160 45.6 165 47.6"></path>')
