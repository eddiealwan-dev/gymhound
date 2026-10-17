"""Hip-rooted anatomical rig with articulated arms + exercise motion data.

Every pose is ABSOLUTE segment angles (degrees, clockwise on screen, 0 = standing rest with arms hanging).
A root translation keeps the anchor (ankle on the floor, or hand on a bar) fixed in the world.
"""
import math
import figure as F

import re as _re

HIP, KNEE, ANKLE = (150, 215), (150, 300), (150, 380)
SHOULDER = (150, 108)
_OLD_ELBOW, _OLD_WRIST, _OLD_GRIP = 168, 219.6, 226
UPPER_ARM_SCALE = 0.95   # upper arm ~5% shorter
FOREARM_SCALE = 0.90     # forearm ~10% shorter
ELBOW = (150, SHOULDER[1] + (_OLD_ELBOW - SHOULDER[1]) * UPPER_ARM_SCALE)
WRIST_Y = ELBOW[1] + (_OLD_WRIST - _OLD_ELBOW) * FOREARM_SCALE
HAND_DY = WRIST_Y - _OLD_WRIST
HAND = (150, _OLD_GRIP + HAND_DY)


def _xform_path(d, fy):
    """Apply y -> fy(y) to every coordinate pair of an M/L/C/Z path."""
    toks = _re.findall(r"[MLCZ]|-?\d+\.?\d*", d)
    out, i, cmd, coords = [], 0, None, []
    for t in toks:
        if t in "MLCZ":
            out.append(t)
            continue
        coords.append(float(t))
        if len(coords) == 2:
            out.append(f"{coords[0]:.2f} {fy(coords[1]):.2f}")
            coords = []
    return " ".join(out)


def xform_xy(d, fx, fy):
    toks = _re.findall(r"[MLCZ]|-?\d+\.?\d*", d)
    out, coords = [], []
    for t in toks:
        if t in "MLCZ":
            out.append(t)
            continue
        coords.append(float(t))
        if len(coords) == 2:
            out.append(f"{fx(coords[0]):.2f} {fy(coords[1]):.2f}")
            coords = []
    return " ".join(out)


def _upper(d):
    return _xform_path(d, lambda y: SHOULDER[1] + (y - SHOULDER[1]) * UPPER_ARM_SCALE)


def _fore(d):
    return _xform_path(d, lambda y: ELBOW[1] + (y - _OLD_ELBOW) * FOREARM_SCALE)
FLOOR_Y = 388

# ---------- art ----------
_t = F.TORSO
TORSO_ART = [
    ("lats", _t[0][1]), ("upperback", _t[1][1]), ("upperback", _t[2][1]),
    (None, _t[3][1]), (None, _t[4][1]), (None, _t[5][1]),
    ("erectors", _t[6][1]), ("erectors", _t[7][1]),
    ("core", _t[8][1]), ("core", _t[9][1]), ("core", _t[10][1]), ("core", _t[11][1]), ("core", _t[12][1]),
    ("chest", _t[13][1]), ("chest", _t[14][1]),
    ("upperback", _t[15][1]), (None, _t[16][1]), (None, _t[17][1]),
]
TORSO_FIB = ("M134 142 C138 155 143 166 146 172 M140 139 C144 150 148 159 150 165 M136 146 C139 156 142 164 144 170 M145 138 C148 146 150 152 151 157 "
             "M133 127 L144 131 M134 110 L140 104 M135 113 L141 108 "
             "M134.5 210 C134 198 135.5 186 136.5 176 M137 168 C135.5 162 134 157 133 152 M140.5 210 C140 198 141 188 141.5 180 M139 170 C138.5 162 137.5 157 137 152 "
             "M144 190 L160 173 M144 200 L162 182 M145 210 L163 194 M147 185 L159 174 "
             "M158 113 L171 120 M155 125 L172 128 M154 130 L170 135 M156 134 L167 138 M147 84 L157 97")
UPPER_ARM_SIL = "M139 104 C134 124 135 150 140 170 L160 170 C168.5 153 171 126 162.5 104 Z"
UPPER_ARM = [
    ("triceps", "M140 112 C135.5 128 136 148 140 164 L146 167 C144.5 150 144 130 145 114 Z"),           # long head
    ("triceps", "M145 113 C150 121 151 137 149 153 C146 147 144.5 129 145 113 Z"),                       # lateral head
    ("biceps", "M151 113 C163.6 118 169.4 136 165.2 157.6 C162.6 163.8 157 166.6 151 167 C149.6 150 149.2 130 151 113 Z"),
    ("biceps", "M146.5 150 C149 156 150.5 162 150.5 168 L146 168 C145.5 162 145.5 156 146.5 150 Z"),     # brachialis
    ("reardelts", _t[18][1]), (None, _t[19][1]), ("frontdelts", _t[20][1]),
]
UPPER_ARM_FIB = ("M139 120 C137 134 137.5 148 140.5 160 M142.5 118 C141 132 141.5 148 143.5 162 M147 120 C148.5 130 148.5 140 147.5 150 "
                 "M153 121 C159.6 131 162.4 145 159.6 159.6 M151.6 129 C154.4 139 155.4 150 154.2 162 M156.2 124 C160.6 134 162.2 146 160.8 156 "
                 "M140 100 C142 110 145 120 146.5 127 M147 98 C148 108 148.5 118 149.5 128 M155 102 C157 110 157 117 155 124")
UPPER_ARM_TEN = [(1.4, "M141.5 162 L144 170")]
FOREARM_SIL = "M141 166 C136 180 139 202 144 220 L156 220 C161 202 164 180 159 166 Z"
FOREARM = [
    ("forearms", "M152 166 C161.5 172 162.5 190 156 214 L152 216 C153 198 153 182 152 166 Z"),          # brachioradialis / extensors
    ("forearms", "M142 170 C137.5 184 140.5 202 145 216 L151 216 C150 198 149.5 182 149 168 Z"),         # flexors
]
FOREARM_FIB = "M154 172 C158.5 182 158.5 196 155 210 M143 178 C141.5 190 143 202 146 212 M146.5 174 C145.5 188 146.5 200 148.5 212"
FOREARM_TEN = [(.8, "M146 213 L146.8 220 M150 213.5 L150.2 220 M154 213 L153.4 219.5")]

UPPER_ARM_SIL = _upper(UPPER_ARM_SIL)
UPPER_ARM = [(g, _upper(d)) for g, d in UPPER_ARM]
UPPER_ARM_FIB = _upper(UPPER_ARM_FIB)
UPPER_ARM_TEN = [(w, _upper(d)) for w, d in UPPER_ARM_TEN]
FOREARM_SIL = _fore(FOREARM_SIL)
FOREARM = [(g, _fore(d)) for g, d in FOREARM]
FOREARM_FIB = _fore(FOREARM_FIB)
FOREARM_TEN = [(w, _fore(d)) for w, d in FOREARM_TEN]

MUSCLE_GROUPS = ["quads", "glutes", "adductors", "hams", "calves", "erectors", "core", "lats", "upperback", "chest",
                 "frontdelts", "reardelts", "biceps", "triceps", "forearms"]


def rot(v, deg):
    a = math.radians(deg)
    c, s = math.cos(a), math.sin(a)
    return (v[0] * c - v[1] * s, v[0] * s + v[1] * c)


def add(a, b):
    return (a[0] + b[0], a[1] + b[1])


def sub(a, b):
    return (a[0] - b[0], a[1] - b[1])


def fk(p, T=(0, 0)):
    """World positions of the joints for absolute pose p and root translation T."""
    hip = add(HIP, T)
    knee = add(hip, rot(sub(KNEE, HIP), p["thigh"]))
    ankle = add(knee, rot(sub(ANKLE, KNEE), p["shin"]))
    toe = add(ankle, rot((32, 4), p["foot"]))
    heel = add(ankle, rot((-20, 6), p["foot"]))
    shoulder = add(hip, rot(sub(SHOULDER, HIP), p["torso"]))
    head = add(hip, rot((8, -165), p["torso"]))
    elbow = add(shoulder, rot(sub(ELBOW, SHOULDER), p["uarm"]))
    hand = add(elbow, rot(sub(HAND, ELBOW), p["farm"]))
    return dict(hip=hip, knee=knee, ankle=ankle, toe=toe, heel=heel, shoulder=shoulder, head=head, elbow=elbow, hand=hand)


def solve_root(p, anchor, target):
    j = fk(p)
    return sub(target, j[anchor])


# ---------- easing / sampling ----------
def ease_in_out(u):
    return u * u * (3 - 2 * u)


SEGMENTS = ["thigh", "shin", "foot", "torso", "uarm", "farm"]


def pose_at(keys, t):
    """keys: list of (t, pose). Smooth (ease-in-out) between keys, looping."""
    for (t0, p0), (t1, p1) in zip(keys, keys[1:]):
        if t0 <= t <= t1:
            u = 0 if t1 == t0 else ease_in_out((t - t0) / (t1 - t0))
            return {k: p0[k] + (p1[k] - p0[k]) * u for k in SEGMENTS}
    return dict(keys[-1][1])


# ---------- exercises ----------
def P(thigh=0, shin=0, foot=0, torso=0, uarm=0, farm=0):
    return dict(thigh=thigh, shin=shin, foot=foot, torso=torso, uarm=uarm, farm=farm)


DEADLIFT_BAR_X = 160
DEADLIFT_PLATE_R = 40


def deadlift_pose(t, keys):
    p = pose_at(keys, t)
    # keep the bar path vertical over midfoot: solve torso angle so hand.x == DEADLIFT_BAR_X
    lo, hi = -15.0, 95.0
    for _ in range(60):
        mid = (lo + hi) / 2
        q = dict(p, torso=mid)
        T = solve_root(q, "ankle", ANKLE)
        hx = fk(q, T)["hand"][0]
        if hx > DEADLIFT_BAR_X:
            hi = mid
        else:
            lo = mid
    p["torso"] = (lo + hi) / 2
    return p


SQUAT_BAR_X = 152
SQUAT_UARM, SQUAT_FARM = 41.0, -147.8   # arms relative to the torso: bar across the upper back


def squat_pose(t, keys):
    p = pose_at(keys, t)
    lo, hi = -10.0, 70.0
    for _ in range(60):
        mid = (lo + hi) / 2
        q = dict(p, torso=mid, uarm=mid + SQUAT_UARM, farm=mid + SQUAT_FARM)
        T = solve_root(q, "ankle", ANKLE)
        if fk(q, T)["hand"][0] > SQUAT_BAR_X:
            hi = mid
        else:
            lo = mid
    t_ = (lo + hi) / 2
    p.update(torso=t_, uarm=t_ + SQUAT_UARM, farm=t_ + SQUAT_FARM)
    return p


PULLUP_BAR = (176, 30)
# shoulder path relative to the bar: (depth below, distance behind). Dead hang: under the bar.
# Top: shoulders about level with the bar and ~5 in behind it, elbows under the bar, chin over.
PULLUP_PATH = [(0, (108.0, 4.0)), (1 / 3, (3.0, 24.0)), (1 / 2, (3.0, 24.0)), (5 / 6, (108.0, 4.0)), (1, (108.0, 4.0))]


def _arm_ik(S, H, prefer_forward=True):
    """Two-link arm from shoulder S to hand H, elbow on the low side. Returns absolute (uarm, farm) angles."""
    a, b = ELBOW[1] - SHOULDER[1], HAND[1] - ELBOW[1]
    vx, vy = H[0] - S[0], H[1] - S[1]
    L = min(math.hypot(vx, vy), a + b - 0.01)
    cosA = max(-1.0, min(1.0, (a * a + L * L - b * b) / (2 * a * L)))
    A = math.acos(cosA)
    base = math.atan2(vy, vx)
    cands = [(S[0] + a * math.cos(base + s * A), S[1] + a * math.sin(base + s * A)) for s in (1, -1)]
    # elbows drive down toward the ribs; in a dead hang (straight line) the tie-break puts them slightly forward
    E = max(cands, key=lambda e: e[1] + 0.5 * e[0])
    uarm = math.degrees(math.atan2(-(E[0] - S[0]), E[1] - S[1]))
    farm = math.degrees(math.atan2(-(H[0] - E[0]), H[1] - E[1]))
    return uarm, farm


def pullup_pose(t, keys):
    p = pose_at(keys, t)
    path = pose_at([(k, dict(thigh=d, shin=b, foot=0, torso=0, uarm=0, farm=0)) for k, (d, b) in PULLUP_PATH], t)
    S = (PULLUP_BAR[0] - path["shin"], PULLUP_BAR[1] + path["thigh"])
    p["uarm"], p["farm"] = _arm_ik(S, PULLUP_BAR)
    return p


EXERCISES = {
    "squat": dict(
        anchor=("ankle", ANKLE),
        keys=[(0, P()), (0.25, P(thigh=-55, shin=20)), (0.5, P(thigh=-95, shin=35)), (2 / 3, P(thigh=-95, shin=35)),
              (0.75, P(thigh=-55, shin=20)), (5 / 6, P()), (1, P())],
        solver=squat_pose,
    ),
    "deadlift": dict(
        anchor=("ankle", ANKLE),
        keys=[(0, P(thigh=-84, shin=7, uarm=4, farm=4)),
              (1 / 6, P(thigh=-46, shin=1, uarm=3, farm=3)),
              (1 / 3, P(thigh=0, shin=0, uarm=-4, farm=-4)),
              (1 / 2, P(thigh=0, shin=0, uarm=-4, farm=-4)),
              (2 / 3, P(thigh=-30, shin=2, uarm=2, farm=2)),
              (5 / 6, P(thigh=-84, shin=7, uarm=4, farm=4)),
              (1, P(thigh=-84, shin=7, uarm=4, farm=4))],
        solver=deadlift_pose,
    ),
    "pullup": dict(
        anchor=("hand", PULLUP_BAR),
        keys=[(0, P(thigh=-10, shin=32, foot=62, torso=-4)),
              (1 / 3, P(thigh=-20, shin=26, foot=58, torso=-12)),
              (1 / 2, P(thigh=-20, shin=26, foot=58, torso=-12)),
              (5 / 6, P(thigh=-10, shin=32, foot=62, torso=-4)),
              (1, P(thigh=-10, shin=32, foot=62, torso=-4))],
        solver=pullup_pose,
    ),
    "dips": dict(
        anchor=("hand", (176, 200)),
        keys=[(0, P(thigh=-4, shin=58, foot=92, torso=8, uarm=2, farm=-2)),
              (1 / 3, P(thigh=-14, shin=54, foot=88, torso=22, uarm=52, farm=-42)),
              (1 / 2, P(thigh=-14, shin=54, foot=88, torso=22, uarm=52, farm=-42)),
              (5 / 6, P(thigh=-4, shin=58, foot=92, torso=8, uarm=2, farm=-2)),
              (1, P(thigh=-4, shin=58, foot=92, torso=8, uarm=2, farm=-2))],
    ),
    "curl": dict(
        anchor=("ankle", ANKLE),
        keys=[(0, P(torso=1, uarm=-2, farm=-6)),
              (0.2, P(torso=0, uarm=-10, farm=-148)),
              (0.4, P(torso=0, uarm=-10, farm=-148)),
              (0.8, P(torso=1, uarm=-2, farm=-6)),
              (1, P(torso=1, uarm=-2, farm=-6))],
    ),
}


def pose_for(name, t):
    ex = EXERCISES[name]
    p = ex.get("solver", lambda tt, k: pose_at(k, tt))(t, ex["keys"])
    anchor, target = ex["anchor"]
    T = solve_root(p, anchor, target)
    return p, T
