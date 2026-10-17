"""Generate one Motion Lab artboard per exercise from the hip-rooted rig."""
import json
import figure as F
import rig2 as R
import draw2 as D
import head as H
import extremities as E
import pop

OUT_DIR = "../mockups/"
SAMPLES = 48
ORIGINS = {"thigh": "150px 215px", "shin": "150px 300px", "foot": "150px 380px", "torso": "150px 215px",
           "uarm": "150px 108px", "farm": f"150px {R.ELBOW[1]:.1f}px"}
PHASE_COLOR = {"con": "#FF8A57", "hold": "#FFC247", "ecc": "#E8EEF5", "rest": "#A9B6C6"}
EFFORT = {"con": (0.35, 1.0), "hold": (0.9, 0.9), "ecc": (0.75, 0.4), "rest": (0.25, 0.25)}
WEEK_SETS = {"quads": 14, "glutes": 12, "adductors": 8, "hams": 6, "erectors": 9, "core": 4, "upperback": 10, "calves": 2,
             "lats": 11, "chest": 7, "frontdelts": 8, "reardelts": 3, "biceps": 9, "triceps": 6, "forearms": 5}

EX = {
    "squat": dict(
        grip="over",
        file="Main.dc.html", title="Back Squat", sub="Barbell · Legs", prop=D.BARBELL_IN_HAND,
        phases=[("Lower", 3, "ecc"), ("Hold", 1, "hold"), ("Drive", 1, "con"), ("Brace", 1, "rest")],
        muscles=[("quads", "Quads", "primary", "Quadriceps · primary. Straighten the knee and peak driving out of the bottom."),
                 ("glutes", "Glutes", "primary", "Glutes · primary. Extend the hip, working hardest below parallel."),
                 ("adductors", "Adductors", "secondary", "Adductors · secondary. The big inner-thigh muscle helps the glutes drive the hip up out of the hole."),
                 ("hams", "Hamstrings", "secondary", "Hamstrings · secondary. Steady the knee and help the hip extend."),
                 ("erectors", "Low back", "stabilizer", "Spinal erectors · stabilizer. Hold your torso angle under the bar."),
                 ("core", "Core", "stabilizer", "Core · stabilizer. Keeps pressure so the spine stays stacked."),
                 ("upperback", "Upper back", "stabilizer", "Upper back · stabilizer. Traps make a shelf so the bar sits still."),
                 ("lats", "Lats", "stabilizer", "Lats · stabilizer. Pin the bar tight so it does not drift forward."),
                 ("calves", "Calves", "stabilizer", "Calves · stabilizer. Keep the whole foot planted.")],
        cues=[(["KNEES OVER", "TOES"], (0.3, 0.6), "knee", 0.45),
              (["DRIVE THROUGH", "MIDFOOT"], (0.64, 0.86), "toe", 0.75)],
        check=("Depth · below parallel", (0.48, 0.68)),
        verb="drive out of the hole"),
    "deadlift": dict(
        grip="over",
        file="Deadlift.dc.html", title="Deadlift", sub="Barbell · Posterior chain", prop=D.BARBELL_IN_HAND,
        phases=[("Pull", 2, "con"), ("Lockout", 1, "hold"), ("Lower", 2, "ecc"), ("Reset", 1, "rest")],
        muscles=[("glutes", "Glutes", "primary", "Glutes · primary. Drive the hips through to lockout."),
                 ("hams", "Hamstrings", "primary", "Hamstrings · primary. Pull the hips forward out of the hinge."),
                 ("erectors", "Low back", "primary", "Spinal erectors · primary. Hold a flat back as the bar leaves the floor."),
                 ("quads", "Quads", "secondary", "Quads · secondary. Push the floor away for the first few inches."),
                 ("adductors", "Adductors", "secondary", "Adductors · secondary. Help extend the hip from the start position."),
                 ("upperback", "Traps", "secondary", "Traps and upper back · secondary. Keep the shoulders packed under load."),
                 ("forearms", "Grip", "secondary", "Forearms · secondary. Your grip holds the whole lift."),
                 ("lats", "Lats", "stabilizer", "Lats · stabilizer. Keep the bar tight against your legs."),
                 ("core", "Core", "stabilizer", "Core · stabilizer. Brace hard so the spine stays neutral.")],
        cues=[(["BAR OVER", "MIDFOOT"], (0.0, 0.1), "hand", 0.0),
              (["HIPS THROUGH,", "STAND TALL"], (0.3, 0.5), "hip", 0.4)],
        check=("Bar path · vertical", (0.03, 0.33)),
        verb="drive the hips through"),
    "pullup": dict(
        grip="over",
        file="PullUp.dc.html", title="Pull-up", sub="Bodyweight · Back", prop="",
        phases=[("Pull", 2, "con"), ("Top", 1, "hold"), ("Lower", 2, "ecc"), ("Hang", 1, "rest")],
        muscles=[("lats", "Lats", "primary", "Lats · primary. Drive the elbows down to pull the body up."),
                 ("biceps", "Biceps", "secondary", "Biceps · secondary. Bend the elbow through the top half."),
                 ("upperback", "Mid back", "secondary", "Rhomboids and traps · secondary. Pull the shoulder blades down and together."),
                 ("reardelts", "Rear delts", "secondary", "Rear delts · secondary. Help sweep the arm down."),
                 ("forearms", "Grip", "secondary", "Forearms · secondary. Hold the bar for the whole set."),
                 ("core", "Core", "stabilizer", "Core · stabilizer. Keeps the body from swinging.")],
        cues=[(["ELBOWS DOWN", "TO YOUR RIBS"], (0.08, 0.3), "elbow", 0.2),
              (["FULL HANG", "EVERY REP"], (0.84, 1.0), "shoulder", 0.95)],
        check=("Chin over bar", (0.3, 0.5)),
        verb="pull your chin over the bar"),
    "dips": dict(
        grip="neutral",
        file="Dips.dc.html", title="Dips", sub="Bodyweight · Chest & triceps", prop="",
        phases=[("Lower", 2, "ecc"), ("Bottom", 1, "hold"), ("Press", 2, "con"), ("Lockout", 1, "rest")],
        muscles=[("triceps", "Triceps", "primary", "Triceps · primary. Straighten the elbows to press back to lockout."),
                 ("chest", "Chest", "primary", "Chest · primary. Works harder the more you lean forward."),
                 ("frontdelts", "Front delts", "secondary", "Front delts · secondary. Help drive you up from the bottom."),
                 ("upperback", "Lower traps", "stabilizer", "Lower traps · stabilizer. Keep the shoulders down, away from the ears."),
                 ("core", "Core", "stabilizer", "Core · stabilizer. Stops the legs from swinging.")],
        cues=[(["ELBOWS BACK,", "NOT OUT"], (0.08, 0.3), "elbow", 0.2),
              (["PRESS TO", "LOCKOUT"], (0.56, 0.8), "shoulder", 0.66)],
        check=("Depth · elbows at 90°", (0.3, 0.5)),
        verb="press back up"),
    "curl": dict(
        grip="under",
        file="Curl.dc.html", title="Dumbbell Curl", sub="Dumbbell · Arms", prop=D.DUMBBELL_IN_HAND,
        phases=[("Curl", 1, "con"), ("Squeeze", 1, "hold"), ("Lower", 2, "ecc"), ("Reset", 1, "rest")],
        muscles=[("biceps", "Biceps", "primary", "Biceps and brachialis · primary. Bend the elbow against the weight."),
                 ("forearms", "Forearms", "secondary", "Brachioradialis · secondary. The forearm muscle that helps bend the elbow."),
                 ("frontdelts", "Front delts", "stabilizer", "Front delts · stabilizer. Hold the upper arm still at your side."),
                 ("core", "Core", "stabilizer", "Core · stabilizer. Stops you swinging the weight up.")],
        cues=[(["ELBOWS PINNED", "TO YOUR SIDES"], (0.04, 0.38), "elbow", 0.2),
              (["SLOW ON THE", "WAY DOWN"], (0.42, 0.8), "hand", 0.6)],
        check=("Full range · no swing", (0.18, 0.4)),
        verb="curl to the top"),
}


def pct(t):
    return f"{t * 100:.2f}%".replace(".00%", "%")


def motion_css(name):
    frames = []
    for i in range(SAMPLES + 1):
        t = i / SAMPLES
        p, T = R.pose_for(name, t % 1.0 if i < SAMPLES else 0.0)
        frames.append((t, p, T))
    rel = {"thigh": lambda p: p["thigh"], "shin": lambda p: p["shin"] - p["thigh"], "foot": lambda p: p["foot"] - p["shin"],
           "torso": lambda p: p["torso"], "uarm": lambda p: p["uarm"] - p["torso"], "farm": lambda p: p["farm"] - p["uarm"]}
    css = [".gRoot{animation-name:kRoot}" + "@keyframes kRoot{" +
           "".join(f"{pct(t)}{{transform:translate({T[0]:.2f}px,{T[1]:.2f}px)}}" for t, p, T in frames) + "}"]
    def unwrap(values):
        out = [values[0]]
        for v in values[1:]:
            while v - out[-1] > 180:
                v -= 360
            while v - out[-1] < -180:
                v += 360
            out.append(v)
        return out

    for g, fn in rel.items():
        key = "k" + g.capitalize()
        vals = unwrap([fn(p) for _, p, _ in frames])
        css.append(f".g{g.capitalize()}{{transform-origin:{ORIGINS[g]};animation-name:{key}}}" + f"@keyframes {key}{{" +
                   "".join(f"{pct(t)}{{transform:rotate({v:.2f}deg)}}" for (t, p, T), v in zip(frames, vals)) + "}")
    return "\n".join(css), frames


def phase_bounds(phases):
    total = sum(d for _, d, _ in phases)
    out, acc = [], 0.0
    for name, d, kind in phases:
        out.append((name, d, kind, acc / total, (acc + d) / total))
        acc += d
    return out, total


def effort_css(phases):
    b, _ = phase_bounds(phases)
    pts = []
    for _, _, kind, t0, t1 in b:
        e0, e1 = EFFORT[kind]
        pts += [(t0, e0), (t1 - 0.001, e1)]
    pts.append((1.0, pts[0][1]))

    def kf(name, f):
        return f"@keyframes {name}{{" + "".join(f"{pct(t)}{{opacity:{f(e):.2f}}}" for t, e in pts) + "}"
    return "\n".join([
        ".pP{animation-name:pulseP}.pS{animation-name:pulseS}.pX{animation-name:pulseX}.pN{opacity:0}",
        kf("pulseP", lambda e: e), kf("pulseS", lambda e: 0.08 + 0.62 * e), kf("pulseX", lambda e: 0.2 + 0.35 * e),
        ".sP{animation-name:sheenP}.sS{animation-name:sheenS}.sX{animation-name:sheenX}.sN{opacity:0}",
        kf("sheenP", lambda e: 0.42 * max(0, e - 0.3) / 0.7), kf("sheenS", lambda e: 0.26 * max(0, e - 0.3) / 0.7),
        kf("sheenX", lambda e: 0.08 * max(0, e - 0.3) / 0.7),
        ".fP,.fS{transform-box:fill-box;transform-origin:center}.fP{animation-name:flexP}.fS{animation-name:flexS}",
        flex_kf("flexP", pts, 0.20, 0.06), flex_kf("flexS", pts, 0.10, 0.03),
    ])


def flex_kf(name, pts, grow, shorten):
    """Contraction: the belly thickens and shortens as effort rises, then relaxes."""
    c = lambda e: max(0.0, (e - 0.35) / 0.65)
    return f"@keyframes {name}{{" + "".join(
        f"{pct(t)}{{transform:scale({1 + grow * c(e):.3f},{1 - shorten * c(e):.3f})}}" for t, e in pts) + "}"


def window_css(cls, t0, t1, slide=False):
    a, b = max(0.0, t0), min(1.0, t1)
    hide = "opacity:0" + (";transform:translateY(-6px)" if slide else "")
    show = "opacity:1" + (";transform:translateY(0)" if slide else "")
    fade = 0.02
    stops = []
    if a > 0:
        stops += [f"0%,{pct(max(0, a - fade))}{{{hide}}}"]
    stops += [f"{pct(a)},{pct(max(a, b - fade))}{{{show}}}"]
    if b < 1:
        stops += [f"{pct(b)},100%{{{hide}}}"]
    else:
        stops = [s.replace(f"{pct(a)},", f"{pct(a)},") for s in stops]
    return f".{cls}{{animation-name:{cls}K}}@keyframes {cls}K{{{''.join(stops)}}}"


def bbox(name, frames, cfg, world_pts):
    xs, ys = [], []
    pad_r = {"deadlift": R.DEADLIFT_PLATE_R + 4, "squat": R.DEADLIFT_PLATE_R + 4, "curl": 14}.get(name, 8)
    for _, p, T in frames:
        j = R.fk(p, T)
        for k, v in j.items():
            r = 26 if k == "head" else (pad_r if k == "hand" else 10)
            xs += [v[0] - r, v[0] + r]
            ys += [v[1] - r, v[1] + r]
    for x, y in world_pts:
        xs.append(x)
        ys.append(y)
    return min(xs), min(ys), max(xs), max(ys)


def fit_viewbox(b, aspect=358 / 392, top=0.2, bottom=0.09, side=0.06):
    x0, y0, x1, y1 = b
    cw, ch = x1 - x0, y1 - y0
    H = max(ch / (1 - top - bottom), cw / (aspect * (1 - 2 * side)))
    W = H * aspect
    cx = (x0 + x1) / 2 + W * 0.07
    return cx - W / 2, y0 - H * top - (H * (1 - top - bottom) - ch) / 2, W, H


def floor_for(name, frames):
    if name in ("deadlift", "curl", "squat"):
        return R.FLOOR_Y
    low = max(max(R.fk(p, T)["toe"][1], R.fk(p, T)["heel"][1]) for _, p, T in frames)
    return low + 26


def world_svg(name, frames, vb):
    x0, y0, w, h = vb
    out = [f'<rect x="{x0:.1f}" y="{y0:.1f}" width="{w:.1f}" height="{h:.1f}" fill="url(#grid)" opacity="0.7"></rect>']
    if name in ("deadlift", "curl", "squat"):
        fy = R.FLOOR_Y
        out.append(f'<path d="M150 {fy}L{x0:.0f} {fy + 14}M150 {fy}L{x0 + w:.0f} {fy + 14}M150 {fy}L{150 - w * .25:.0f} {fy + 14}M150 {fy}L{150 + w * .25:.0f} {fy + 14}M{x0 + 10:.0f} {fy + 4}H{x0 + w - 10:.0f}" class="floor"></path>')
        out.append(f'<ellipse cx="152" cy="{fy - 2}" rx="78" ry="11" class="pedestal ring"></ellipse><ellipse cx="152" cy="{fy - 2}" rx="46" ry="6" class="pedestal"></ellipse>')
    if name == "squat":
        b = [f for f in frames if abs(f[0] - 0.5) < 0.01][0]
        ky = R.fk(b[1], b[2])["knee"][1] - 5
        out.append(f'<line x1="{x0 + 24:.0f}" y1="{ky:.1f}" x2="{x0 + w - 24:.0f}" y2="{ky:.1f}" class="parallel"></line>'
                   f'<text x="{x0 + 24:.0f}" y="{ky - 5:.1f}" class="svgLabel">PARALLEL</text>')
    if name == "deadlift":
        out.append(f'<line x1="{R.DEADLIFT_BAR_X}" y1="{R.FLOOR_Y}" x2="{R.DEADLIFT_BAR_X}" y2="150" class="parallel"></line>'
                   f'<text x="{R.DEADLIFT_BAR_X + 46}" y="{R.FLOOR_Y - 14}" class="svgLabel">BAR PATH</text>'
                   f'<line x1="{R.DEADLIFT_BAR_X + 2}" y1="{R.FLOOR_Y - 17}" x2="{R.DEADLIFT_BAR_X + 43}" y2="{R.FLOOR_Y - 17}" class="cueLead"></line>')
    if name == "pullup":
        bar = R.EXERCISES["pullup"]["anchor"][1]
        floor = floor_for(name, frames)
        out.append(f'<path d="M{x0 + 10:.0f} {floor:.0f}H{x0 + w - 10:.0f}" class="floor"></path>')
        out.append(f'<line x1="{bar[0] - 60}" y1="{bar[1]}" x2="{bar[0] + 70}" y2="{bar[1]}" class="parallel"></line>'
                   f'<text x="{bar[0] + 12}" y="{bar[1] - 6}" class="svgLabel">CHIN LINE</text>')
        out.append(D.pullup_rig(bar).replace(f"{R.FLOOR_Y + 60}", f"{floor:.0f}"))
    if name == "dips":
        bar = R.EXERCISES["dips"]["anchor"][1]
        floor = floor_for(name, frames)
        out.append(f'<path d="M{x0 + 10:.0f} {floor:.0f}H{x0 + w - 10:.0f}" class="floor"></path>')
        out.append(D.dip_rig(bar, round(floor)))
        b = [f for f in frames if abs(f[0] - 0.42) < 0.03][0]
        sy = R.fk(b[1], b[2])["shoulder"][1]
        out.append(f'<line x1="{bar[0] - 40}" y1="{sy:.1f}" x2="{bar[0] + 90}" y2="{sy:.1f}" class="parallel"></line>'
                   f'<text x="{bar[0] + 46}" y="{sy - 5:.1f}" class="svgLabel">DEPTH</text>')
    return "\n".join(out)


def cue_svg(i, lines, joint_pt, vb):
    x0, y0, w, h = vb
    bw = max(len(s) for s in lines) * 6.5 + 16
    bx = x0 + w - bw - 14
    by = max(y0 + 60 + i * 44, min(joint_pt[1] - 16, y0 + h - 44))
    lead_end = (bx, by + 15)
    return (f'<g class="rig cue{i}"><line x1="{joint_pt[0]:.1f}" y1="{joint_pt[1]:.1f}" x2="{lead_end[0]:.1f}" y2="{lead_end[1]:.1f}" class="cueLead"></line>'
            f'<circle cx="{joint_pt[0]:.1f}" cy="{joint_pt[1]:.1f}" r="2.4" class="cueDot"></circle>'
            f'<rect x="{bx:.1f}" y="{by:.1f}" width="{bw:.1f}" height="30" rx="6" class="cueBox"></rect>'
            f'<text x="{bx + 8:.1f}" y="{by + 13:.1f}" class="cueText">{lines[0]}</text>'
            f'<text x="{bx + 8:.1f}" y="{by + 24:.1f}" class="cueText">{lines[1]}</text></g>')


def build(name):
    cfg = EX[name]
    mcss, frames = motion_css(name)
    world_pts = [(150, floor_for(name, frames))]
    if name == "pullup":
        bar = R.EXERCISES["pullup"]["anchor"][1]
        world_pts += [(bar[0] - 74, bar[1] - 6), (bar[0] + 8, bar[1] - 6)]
    if name == "dips":
        bar = R.EXERCISES["dips"]["anchor"][1]
        world_pts += [(bar[0] - 98, bar[1]), (bar[0] + 48, bar[1])]
    vb = fit_viewbox(bbox(name, frames, cfg, world_pts))
    bounds, total = phase_bounds(cfg["phases"])

    involved = [m[0] for m in cfg["muscles"]]
    fig = D.figure2(lambda k: {"root": 'class="rig gRoot"', "thigh": 'class="rig gThigh"', "shin": 'class="rig gShin"',
                               "foot": 'class="rig gFoot"', "torso": 'class="rig gTorso"', "uarm": 'class="rig gUarm"',
                               "farm": 'class="rig gFarm"'}[k],
                    lambda g: "{{fill.%s}}" % g, lambda g: "{{op.%s}}" % g, lambda g: "{{pulse.%s}}" % g,
                    lambda g: "{{sheen.%s}}" % g, cfg["prop"], head=H.head_svg("hairClip" + name), grip=cfg.get("grip", "under"),
                    flex_for=lambda g: "{{flex.%s}}" % g)

    cues = ""
    for i, (lines, win, joint, at) in enumerate(cfg["cues"]):
        p, T = R.pose_for(name, at)
        cues += cue_svg(i, lines, R.fk(p, T)[joint], vb)

    phase_css = "\n".join(window_css(f"ph{i}", t0, t1) for i, (_, _, _, t0, t1) in enumerate(bounds))
    cue_css = "\n".join(window_css(f"cue{i}", w[0], w[1]) for i, (_, w, _, _) in enumerate(cfg["cues"]))
    check_css = window_css("chk", cfg["check"][1][0], cfg["check"][1][1], slide=True)

    phase_divs = "\n".join(
        f'<div class="rig ph{i}" style="grid-area: 1 / 1; display: flex; align-items: baseline; gap: 6px; opacity: {1 if t0 == 0 else 0}">'
        f'<span class="hud" style="font-size: 26px; font-weight: 600; color: {PHASE_COLOR[kind]}">{pn}</span>'
        f'<span class="mono" style="font-size: 13px; color: #7FD4FF">{d}s</span></div>'
        for i, (pn, d, kind, t0, t1) in enumerate(bounds))
    strip = "".join(f'<div style="flex: {d}">{pn} {d}</div>' for pn, d, _, _, _ in bounds)
    tempo = "-".join(str(d) for _, d, _ in cfg["phases"])

    muscles_js = ",\n  ".join(json.dumps({"id": mid, "name": nm, "role": role, "sampleSets": WEEK_SETS[mid], "about": ab})
                              for mid, nm, role, ab in cfg["muscles"])
    default_info = ("Warm means working: orange primary, amber secondary, copper stabilizers. The glow peaks as you "
                    + cfg["verb"] + ". Tap one to isolate it.")
    rows = (len(involved) + 3) // 4

    html = TEMPLATE
    for k, v in {
        "@@TITLE@@": cfg["title"], "@@SUB@@": cfg["sub"], "@@REP@@": str(total),
        "@@MOTION@@": mcss, "@@EFFORT@@": effort_css(cfg["phases"]),
        "@@WINDOWS@@": phase_css + "\n" + cue_css + "\n" + check_css,
        "@@VIEWBOX@@": " ".join(f"{v:.1f}" for v in vb),
        "@@ARIA@@": f"Animated skinless anatomical figure performing a {cfg['title'].lower()}, working muscles glowing in time with the rep",
        "@@WORLD@@": world_svg(name, frames, vb), "@@FIGURE@@": fig, "@@CUES@@": cues,
        "@@PHASES@@": phase_divs, "@@CHECK@@": cfg["check"][0], "@@TEMPO@@": tempo, "@@STRIP@@": strip,
        "@@MUSCLES@@": muscles_js, "@@ALLGROUPS@@": json.dumps(R.MUSCLE_GROUPS), "@@INFO@@": json.dumps(default_info),
        "@@HINTCOUNT@@": str(len(involved)), "@@ROWS@@": str(rows),
    }.items():
        html = html.replace(k, v)
    html = pop.apply(html.replace(".cueText{", H.HEAD_CSS + "\n" + E.EXT_CSS + "\n.cueText{", 1))
    assert "@@" not in html, [l for l in html.split("\n") if "@@" in l][:3]
    open(OUT_DIR + cfg["file"], "w").write(html)
    return cfg["file"], len(html)


TEMPLATE = open(__file__.rsplit("/", 1)[0] + "/screen_template.html").read()

if __name__ == "__main__":
    import sys
    for n in sys.argv[1:] or list(EX):
        print(build(n))
