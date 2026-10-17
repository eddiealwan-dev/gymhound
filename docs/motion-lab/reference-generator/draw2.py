"""SVG for the hip-rooted rig. attrs(name) returns the attribute string for each moving group."""
import figure as F
import rig2 as R
import extremities as E


CALF_SLIM = 0.82   # calf bulge behind the shin line pulled in 18%
FOOT_FLAT = 0.84   # foot height above the sole reduced 16%
_calf_x = lambda x: 146 - (146 - x) * CALF_SLIM if x < 146 else x
_foot_y = lambda y: 388 - (388 - y) * FOOT_FLAT
SLIM_SHIN = [(g, R.xform_xy(p, _calf_x, lambda y: y)) for g, p in F.SHIN]
SLIM_SHIN_SIL = R.xform_xy(F.SIL["shin"], _calf_x, lambda y: y)
SLIM_SHIN_FIB = R.xform_xy(F.SHIN_FIB, _calf_x, lambda y: y)


# The glute starts on the pelvis, so it rides with the torso: in a hinge it stays tucked behind the hip.
GLUTE_FIB = "M126 208 C128 222 135 234 145 240 M130 201 C132 215 139 227 149 233 M135 197 C138 210 143 220 151 226 M124 220 C127 230 133 237 140 241"
UPPER_HAMSTRING = ("hams", "M131.5 210 C126.6 221 126.8 236 130.8 244.6 C136 249 146 247.2 152 239 C151.2 228 147.6 217.6 141.4 210.6 C138 209 134.6 209 131.5 210 Z")
THIGH_NO_GLUTE = [UPPER_HAMSTRING] + [(g, p) for g, p in F.THIGH if g != "glutes"]
PELVIS_GLUTE = [(g, p) for g, p in F.THIGH if g == "glutes"]
THIGH_FIB_NO_GLUTE = F.THIGH_FIB.replace(GLUTE_FIB, "").strip() + " M131 222 C131 232 134 240 139 244 M135 216 C136 228 139 237 144 242"


def seg(parts, fib, tendons, fill_for, op_for, pulse_for, sheen_for, with_fx, flex_for=lambda g: ""):
    """Deep tissue first, then each worked muscle in its own flex wrapper (muscle + shading + sheen scale together)."""
    groups, base = [], []
    by_group = {}
    for g, path in parts:
        if g is None:
            base.append(path)
        else:
            if g not in by_group:
                groups.append(g)
            by_group.setdefault(g, []).append(path)
    aura = "".join(f'<use href="#m-{g}" filter="url(#glow)" class="rig {pulse_for(g)}"></use>' for g in groups) if with_fx else ""
    paths = lambda ds: "".join(f'<path d="{p}"></path>' for p in ds)
    out = [aura, f'<g class="base">{paths(base)}</g><g class="vol">{paths(base)}</g>' if base else ""]
    for g in groups:
        sheen = f'<use href="#m-{g}" class="rig sheen {sheen_for(g)}"></use>' if with_fx else ""
        flex = flex_for(g)
        wrap_open = f'<g class="rig {flex}">' if flex else "<g>"
        out.append(f'{wrap_open}<g id="m-{g}" class="mus" fill="{fill_for(g)}" opacity="{op_for(g)}">{paths(by_group[g])}</g>'
                   f'<g class="vol">{paths(by_group[g])}</g>{sheen}</g>')
    ten = "".join(f'<path class="ten" style="stroke-width: {w}" d="{t}"></path>' for w, t in tendons)
    return "".join(out) + f'<path class="fib" d="{fib}"></path>{ten}'


def hand_for(grip):
    """Underhand/neutral: knuckles back. Overhand: mirrored about the forearm axis so the knuckles face forward."""
    hand = E.hand_svg(R.HAND_DY)
    return f'<g transform="matrix(-1 0 0 1 300 0)">{hand}</g>' if grip == "over" else hand


def joint(cx, cy, r, fill=None, opacity="1", smooth=False):
    """Rounded deep-tissue cap under a pivot so bending never opens a gap. A fill makes it part of that muscle."""
    edge = "stroke: none" if smooth else "stroke: rgba(0,0,0,.9); stroke-width: .9"
    paint = f' fill="{fill}" opacity="{opacity}" style="{edge}"' if fill else ' class="joint"'
    return (f'<circle{paint} cx="{cx}" cy="{cy:.1f}" r="{r}"></circle>'
            f'<circle class="vol" cx="{cx}" cy="{cy:.1f}" r="{r}"></circle>')


FACELESS_HEAD = (f'<path class="head" d="{F.HEAD}"></path><path class="volHead" d="{F.HEAD}"></path>'
                 '<path class="fib" d="M146 60 C150 66 152 74 151 82 M152 56 C156 62 158 70 157 78 M142 66 C145 72 147 78 148 84"></path>'
                 '<path class="spec" d="M147 56 C152 51 160 50 166 53"></path>')


def figure2(attrs, fill_for, op_for, pulse_for, sheen_for, hand_prop="", with_fx=True, head=FACELESS_HEAD, flex_for=lambda g: "", grip="under"):
    s = lambda parts, fib, ten: seg(parts, fib, ten, fill_for, op_for, pulse_for, sheen_for, with_fx, flex_for)
    return f"""<g {attrs('root')}>
{joint(150, 215, 17, fill_for('hams'), op_for('hams'), smooth=True)}
<g {attrs('thigh')}>
{joint(150, 300, 11.5)}
<path class="sil" d="{F.SIL['thigh']}"></path>
{s(THIGH_NO_GLUTE, THIGH_FIB_NO_GLUTE, F.TENDONS['thigh'])}
<g {attrs('shin')}>
<path class="sil" d="{SLIM_SHIN_SIL}"></path>
{s(SLIM_SHIN, SLIM_SHIN_FIB, F.TENDONS['shin'])}
<g {attrs('foot')}>
{E.foot_svg(fy=_foot_y)}
<circle class="node" cx="150" cy="380" r="2.2"></circle>
</g>
<circle class="node" cx="150" cy="300" r="2.2"></circle>
</g>
<ellipse class="bone" cx="160.5" cy="298" rx="3.6" ry="5"></ellipse>
</g>
<g {attrs('torso')}>
<path class="sil" d="{F.SIL['torso']}"></path>
{s(PELVIS_GLUTE + R.TORSO_ART, R.TORSO_FIB + ' ' + GLUTE_FIB, F.TENDONS['torso'])}
{head}
<circle class="node" cx="150" cy="215" r="2.2"></circle>
<g {attrs('uarm')}>
{joint(150, R.ELBOW[1], 9.5)}
<path class="sil" d="{R.UPPER_ARM_SIL}"></path>
<g {attrs('farm')}>
<path class="sil" d="{R.FOREARM_SIL}"></path>
{s(R.FOREARM, R.FOREARM_FIB, R.FOREARM_TEN)}
{hand_for(grip)}
<g transform="translate(0 {R.HAND_DY:.2f})">{hand_prop}</g>
</g>
{s(R.UPPER_ARM, R.UPPER_ARM_FIB, R.UPPER_ARM_TEN)}
<circle class="node" cx="150" cy="{R.ELBOW[1]:.1f}" r="2"></circle>
<circle class="node" cx="150" cy="108" r="2.2"></circle>
</g>
</g>
</g>"""


def static_attrs(p, T):
    rel = {
        "root": f'transform="translate({T[0]:.2f} {T[1]:.2f})"',
        "thigh": f'transform="rotate({p["thigh"]:.2f} 150 215)"',
        "shin": f'transform="rotate({p["shin"] - p["thigh"]:.2f} 150 300)"',
        "foot": f'transform="rotate({p["foot"] - p["shin"]:.2f} 150 380)"',
        "torso": f'transform="rotate({p["torso"]:.2f} 150 215)"',
        "uarm": f'transform="rotate({p["uarm"] - p["torso"]:.2f} 150 108)"',
        "farm": f'transform="rotate({p["farm"] - p["uarm"]:.2f} 150 {R.ELBOW[1]:.1f})"',
    }
    return lambda k: rel[k]


# ---------- equipment (holographic line art) ----------
BARBELL_IN_HAND = (f'<circle class="plate far" cx="156" cy="221" r="{R.DEADLIFT_PLATE_R}"></circle>'
                   f'<circle class="plate" cx="150" cy="226" r="{R.DEADLIFT_PLATE_R}"></circle>'
                   f'<circle class="plate" cx="150" cy="226" r="{R.DEADLIFT_PLATE_R - 7}"></circle>'
                   '<circle class="plate" cx="150" cy="226" r="5"></circle>')
DUMBBELL_IN_HAND = ('<path class="prop" d="M150 226 L160 217"></path>'
                    '<path class="prop far" d="M160 208 L167.8 212.5 L167.8 221.5 L160 226 L152.2 221.5 L152.2 212.5 Z"></path>'
                    '<path class="prop" d="M150 216 L158.7 221 L158.7 231 L150 236 L141.3 231 L141.3 221 Z"></path>'
                    '<circle class="prop" cx="150" cy="226" r="2.5"></circle>')


def pullup_rig(bar):
    x, y = bar
    return (f'<path class="frame" d="M{x - 70} {y - 2} L{x - 70} {R.FLOOR_Y + 60} M{x - 70} {y} L{x} {y}"></path>'
            f'<circle class="barEnd" cx="{x}" cy="{y}" r="5.5"></circle>'
            f'<circle class="barEnd" cx="{x}" cy="{y}" r="1.6"></circle>')


def dip_rig(bar, floor_y):
    x, y = bar
    return (f'<path class="frame" d="M{x - 95} {y} L{x + 45} {y} M{x - 80} {y} L{x - 80} {floor_y} M{x + 30} {y} L{x + 30} {floor_y}"></path>'
            f'<path class="frameHi" d="M{x - 95} {y} L{x + 45} {y}"></path>')
