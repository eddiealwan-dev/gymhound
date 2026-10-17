"""Skinless anatomical foot (standing, sole y=388, ankle 150,380) and gripping hand.
Hand is authored with the wrist at y~219.6 and the bar/grip centre at (150,226); rig2 shifts it to the shortened forearm."""

FOOT_SIL = ("M130 388 C125.8 387.6 124.8 382 127.4 377.6 C129.6 373.8 134 370.8 140 369.8 C145 369 150 369.4 153.6 370.8 "
            "C159 372.8 165.4 376.4 171.4 379.2 C176 381.2 180.8 382.4 183.6 383.8 C185.8 385 185.6 387.6 183.4 388 L173 388 "
            "C170 387.2 166 387.2 164 388 C156 386.6 146 386.6 138.4 388 Z")
FOOT_PARTS = [
    "M127.4 380.6 C127.8 376.4 131 373.8 135.2 373.4 C137 377 137.8 382.6 137.8 388 L131 388 C128.6 387.4 127 384.4 127.4 380.6 Z",  # heel pad
    "M137.6 375.2 C142 373.4 147.4 373.2 151.2 374.4 C150 378.8 146.4 382 140.4 383.6 L137.8 383.6 Z",                            # abductor
    "M137.8 383.8 C146 384.4 155 384.6 163.8 384.2 L164 387.6 C156 386.4 146 386.4 138.2 387.6 Z",                                 # sole, arched
    "M152 373.6 C157 374.6 161.6 376.8 164.6 379 C162 380.4 157.6 380.2 154 378.8 C152.6 377.4 152 375.6 152 373.6 Z",             # extensor digitorum brevis
    "M163.8 383.4 C166.8 382.4 170.4 382.6 172.8 383.8 L173 388 C170 387.2 166.4 387.2 164 388 Z",                                 # ball of the foot
    "M164.8 379.8 C167.8 380.6 170.4 381.6 172.4 382.6 C171 383.4 168.6 383.4 166.6 382.8 C165.4 382.2 164.8 381.2 164.8 379.8 Z",  # lesser toes
    "M172.6 381 C175.6 381.6 178.2 382.4 179.8 383.2 L180 388 L173 388 C172.6 385.6 172.4 383.2 172.6 381 Z",                      # big toe, proximal
    "M179.8 383.2 C182 383.8 184 384.8 184.8 386 C185.2 387.2 184.4 388 183.2 388 L180 388 Z",                                     # big toe, distal
]
FOOT_FIB = ("M139 377.2 C142 379 145 380.6 148 381.4 M141 375.6 C144 377 147 378 150 378.4 M154 376.2 L162 379.4 M155.6 375 L163 378.2 "
            "M140 386.2 L162 385.8 M129.6 379.6 C130.6 383 132.4 385.6 135 386.8 M166.2 384.6 L171.4 385")
FOOT_TENDONS = [
    (1.8, "M142.2 371 C139.2 372.6 136.2 374.6 133.8 377.4"),                                    # Achilles insertion
    (.75, "M154.6 371.6 L179.6 383 M153.8 373.2 L171.6 381.4 M155 375.4 L168.4 380.6"),            # extensor tendons
    (.8, "M147.6 369.8 C147.8 374.6 149.4 378.4 153 380.4 L160 382.4"),                           # peroneal tendons
]
TOENAIL = "M180.6 383.4 C182.4 383.8 183.8 384.6 184.4 385.6 L181.4 385.4 Z"
MALLEOLUS = (151, 376, 2.6, 3.1)

# hand: C-shaped grip around a bar at (150,226)
HAND_BEHIND = [  # middle/ring fingers peeking behind the index
    "M144.6 233.2 C145.8 236.4 148.6 238.2 151.8 238 L152.2 235 C150.6 235 149.4 234.2 148.8 232.8 Z",
    "M152 238 C155.4 237.6 158 235.6 159.2 232.6 L156 231.2 C155.4 232.8 154 234 152.4 234.4 Z",
]
HAND_PARTS = [
    ("back", "M143.8 219.6 C142.6 223.6 142.6 228.4 143.8 232.4 L148.2 232.8 C147.2 229.2 147 225.6 147.8 222.2 L148.8 219.6 Z"),
    ("thenar", "M148.6 219.6 L156 219.6 C157.8 221 158.6 222.6 158.4 224.2 C155.8 223.4 152.6 222.8 149.6 223 Z"),
    ("indexProximal", "M143.8 232.2 C144.8 235.4 147.6 237.2 150.8 237 L151.2 233.2 C149.6 233.2 148.4 232.4 147.8 231 Z"),
    ("indexMiddle", "M150.8 237 C154.2 236.6 156.8 234.6 158 231.6 L154.8 230 C154.2 231.6 152.8 232.8 151.2 233.2 Z"),
    ("indexDistal", "M158 231.4 C158.8 228.6 158.4 225.8 157 223.6 L154.4 225.4 C155.2 226.8 155.4 228.4 154.8 230 Z"),
    ("thumb", "M155.6 221.2 C158.6 221.6 160.6 223.6 160.8 226.2 C160.8 227.6 159.8 228.4 158.6 228.2 C158.4 226.2 157.2 224.4 155.4 223.6 Z"),
]
HAND_FIB = "M150.4 220.6 L156.6 222.4 M151.2 221.8 L156 223 M144.6 221.4 L144.8 230 M146.2 233.4 L149.6 235.4 M153 235 L156.4 232.6"
HAND_TENDONS = [(.6, "M145.6 219.8 L145.4 231.6 M147.2 220 L146.6 231.8")]
KNUCKLES = "M144 232.6 C145.2 233 146.2 232.8 147.6 232 M150.8 233.4 L151 237 M154.8 230.2 L158 231.6"
NAILS = "M159.2 228.2 C160.2 227.8 160.8 227 160.8 226 M157.4 223.4 C158.2 224.4 158.6 225.4 158.6 226.4"

EXT_CSS = """.finger{fill:#26323F;stroke:rgba(0,0,0,.85);stroke-width:.6}
.crease{fill:none;stroke:#0B1017;stroke-width:.55;stroke-linecap:round}
.nail{fill:none;stroke:#DCE6EF;stroke-opacity:.75;stroke-width:.8;stroke-linecap:round}"""


def foot_svg(fy=None):
    import rig2 as R
    t = (lambda p: R.xform_xy(p, lambda x: x, fy)) if fy else (lambda p: p)
    sil, parts_d, fib, tendons, nail = t(FOOT_SIL), [t(p) for p in FOOT_PARTS], t(FOOT_FIB), [(w, t(p)) for w, p in FOOT_TENDONS], t(TOENAIL)
    cx, cy, rx, ry = MALLEOLUS
    cy = fy(cy) if fy else cy
    parts = "".join(f'<path d="{d}"></path>' for d in parts_d)
    ten = "".join(f'<path class="ten" style="stroke-width: {w}" d="{d}"></path>' for w, d in tendons)
    return (f'<path class="sil" d="{sil}"></path><g class="base">{parts}</g><g class="vol">{parts}</g>'
            f'<path class="fib" d="{fib}"></path>{ten}'
            f'<path class="bone" style="fill-opacity: .75" d="{nail}"></path>'
            f'<ellipse class="bone" style="fill-opacity: .5" cx="{cx}" cy="{cy}" rx="{rx}" ry="{ry}"></ellipse>')


def hand_svg(dy=0.0):
    behind = "".join(f'<path d="{d}"></path>' for d in HAND_BEHIND)
    parts = "".join(f'<path d="{d}"></path>' for _, d in HAND_PARTS)
    ten = "".join(f'<path class="ten" style="stroke-width: {w}" d="{d}"></path>' for w, d in HAND_TENDONS)
    shift = f' transform="translate(0 {dy:.2f})"' if dy else ""
    return (f'<g{shift}><g class="finger">{behind}</g><g class="base">{parts}</g><g class="vol">{parts}</g>'
            f'<path class="fib" d="{HAND_FIB}"></path>{ten}<path class="crease" d="{KNUCKLES}"></path>'
            f'<path class="nail" d="{NAILS}"></path></g>')
