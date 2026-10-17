"""Anatomical (skinless, faceless) rig: one source for the preview PNG and the DC artboard SVG."""
import cairosvg

OUT = "./"

# Muscle shapes in the standing pose, facing right. group = highlightable muscle id, or None = base tissue.
SHIN = [
    (None, "M147 304 C149 324 150 346 150 368 L152 374 C153 352 153 326 153 305 Z"),                     # peroneus longus
    (None, "M152.5 306 C154 326 154.5 348 153.5 368 L155 371 C156 350 156.5 328 155 308 Z"),             # ext. digitorum
    (None, "M154.5 304 C159 318 159 344 157 364 C156 370 154 373 153 375 C155 356 156 330 154.5 306 Z"),  # tibialis anterior
    ("calves", "M140 302 C134 312 132 326 134 340 C137 350 142 356 146 360 C146.5 344 146.5 326 145.5 307 Z"),  # gastroc lateral head
    ("calves", "M140 302 C131 313 129 330 132 344 C133 347 135 349 136.5 350 C133 340 133 326 135.5 314 C137 309 138.5 305 140 302 Z"),  # gastroc medial head
    ("calves", "M132 345 C135 357 140 366 144 372 L148 372 C148 362 147 354 146.5 347 C142 352 137 350 132 345 Z"),  # soleus
]
SHIN_FIB = ("M137 312 C134 324 134 338 139 350 M141 309 C138 322 139 336 143.5 352 M144 309 C142.5 322 143 338 145.5 354 "
            "M134 330 C134 338 135 344 137 348 M135 351 C138 358 141 364 145 369 M139 352 C141 359 143 365 146 370 "
            "M156 312 C157 330 157 350 155 366 M150 312 C151 330 151.5 350 151.5 366")
THIGH = [
    ("hams", "M135 226 C130 244 130 266 134 282 C136 288 138 292 140 296 C141 280 140 254 139 228 Z"),      # biceps femoris long
    ("hams", "M139 228 C140 254 141 280 140 296 C142 299 143 301 144.5 302 C145 284 144.5 256 142.5 230 Z"),  # semitendinosus
    ("adductors", "M133 234 C130 244 130.5 255 134 263 C136 256 137.5 246 138.5 236 Z"),                     # adductor magnus
    (None, "M142.5 228 C144.5 256 145.5 284 145.5 302 L148 302 C148 280 147 252 146 226 Z"),                 # vastus intermedius
    ("quads", "M146 220 C158 225 167 244 167 264 C167 280 163 291 159 297 C152 288 148 271 146.5 252 Z"),   # vastus lateralis
    ("quads", "M159 214 C167 229 171 250 170 268 C169 276 167 282 164.5 287 C163 276 163 250 159 214 Z"),   # rectus femoris
    ("quads", "M160 280 C166 283 168 292 162.5 301 C158.5 299 157.5 290 160 280 Z"),                         # vastus medialis teardrop
    ("glutes", "M132 194 C121 204 121 224 128 237 C135 245 146 243 152 235 C152 221 148 204 141 195 Z"),    # glute max
    (None, "M158 197 C163 202 166 210 165 218 L160 216 C160 209 159 203 156 199 Z"),                          # TFL
]
THIGH_FIB = ("M137 232 C134 250 135 270 138.5 288 M140.5 236 C141 254 142 274 142.5 294 "
             "M151 232 C158 248 160 268 157 288 M155 229 C162 246 163 266 160 286 M159 238 C163 254 163.5 270 161 284 "
             "M162.5 224 C166.5 242 167.5 262 166 278 M165.5 236 C168 250 168 264 167 272 "
             "M161 285 C163 289 163.5 294 162 298 "
             "M126 208 C128 222 135 234 145 240 M130 201 C132 215 139 227 149 233 M135 197 C138 210 143 220 151 226 M124 220 C127 230 133 237 140 241")
TORSO = [
    ("upperback", "M130 134 C129 152 134 170 141 182 C148 172 153 158 153 140 C146 135 138 133 130 134 Z"),  # lats
    ("upperback", "M131 128 C135 123 142 123 147 128 L141 136 C137 134 133.5 132 131 128 Z"),                  # teres major
    ("upperback", "M131 116 C133 108 137 102 141 98 L141.5 112 C137.5 114 134 116 131 116 Z"),                 # mid traps / rhomboid
    (None, "M150 146 L164 151.5 L160.5 157 Z"),                                                                 # serratus fingers
    (None, "M151 154 L166 159.5 L162 165 Z"),
    (None, "M152 162 L167 167.5 L163 172 Z"),
    ("erectors", "M137 218 C133 204 134 190 136 180 C137 170 133 158 131 150 L135 150 C136.5 162 139 176 138.5 190 C138 202 138.5 210 139 218 Z"),   # iliocostalis
    ("erectors", "M139 218 C138.5 210 138 202 138.5 190 C139 176 136.5 162 135 150 L139 150 C141 162 144 176 143 190 C142 201 142 209 142 218 Z"),  # longissimus
    ("core", "M141 184 C146 174 154 169 161.5 168 C163.5 182 163.5 197 163.5 212 L143 216 C142 206 141 194 141 184 Z"),  # external oblique
    ("core", "M161.5 152.5 C164.5 152 167 152.5 168 154 C168.6 158 168.6 161 168.2 164 L162 164 C162 160 162 156 161.5 152.5 Z"),  # abs 1
    ("core", "M162 166 L168.4 166 C168.8 169.5 168.8 172.5 168.6 176 L162.3 176 C162.4 172.5 162.3 169 162 166 Z"),               # abs 2
    ("core", "M162.3 178 L168.6 178 C168.8 181.5 168.7 184.5 168.4 188 L162.4 188 C162.5 184.5 162.5 181 162.3 178 Z"),           # abs 3
    ("core", "M162.4 190 L168.3 190 C168 196 167.2 203 165.8 210 L161.5 210 C162.4 203 162.6 196 162.4 190 Z"),                   # lower abs
    (None, "M156 110 C163.5 111 170.5 116 173 122 L157 122 Z"),                                                # pec clavicular head
    (None, "M152 123 L174 124 C176 130 175 136 172 138 C165 142 156 140 152 132 Z"),                           # pec sternal head
    ("upperback", "M140 89 C137 96 135 104 137 113 L147 102 C147 96 147 92 147 89 Z"),                         # upper traps
    (None, "M145 81 L158 81 L161 98 L142 98 Z"),                                                               # neck (splenius)
    (None, "M150 82 L154.5 81.5 L160 96.5 L155 98 Z"),                                                         # SCM
    (None, "M137 100 C139.5 97.5 141.5 96.5 144 96 C145 106 146 118 147.5 129.5 C142 124 136 112 137 100 Z"),  # rear delt
    (None, "M144 96 C147 95 150 96.5 152 99 C151.5 108 151.5 119 152.5 129 C151 130 149 130.5 147.5 129.5 C146 118 145 106 144 96 Z"),  # mid delt
    (None, "M152 99 C158 101 162 106 162 112 C161.5 120 157.5 126 152.5 129 C151.5 119 151.5 108 152 99 Z"),  # front delt
    (None, "M150 111 C157 113 158 121 152 128 C146 135 138 142 131 145 C128 146 126 143 127 140 Z"),          # triceps
    (None, "M150 111 C145 105 140 108 137 113 C132 120 127 128 123 135 C122 139 124 141 127 140 Z"),          # biceps
    (None, "M127 140 C133 141 135 136 137 128 C139 120 142 112 144 107 L141 104 Z"),                          # forearm flexors
    (None, "M127 140 C122 138 122 133 125 127 C130 118 134 110 138 103 L141 104 Z"),                          # brachioradialis / extensors
    (None, "M136.5 104 A5 5 0 1 0 146.5 104 A5 5 0 1 0 136.5 104 Z"),                                          # fist
]
TORSO_FIB = ("M134 142 C138 155 143 166 146 172 M140 139 C144 150 148 159 150 165 M136 146 C139 156 142 164 144 170 M145 138 C148 146 150 152 151 157 "
             "M133 127 L144 131 M134 110 L140 104 M135 113 L141 108 "
             "M134.5 210 C134 198 135.5 186 136.5 176 M137 168 C135.5 162 134 157 133 152 M140.5 210 C140 198 141 188 141.5 180 M139 170 C138.5 162 137.5 157 137 152 "
             "M144 190 L160 173 M144 200 L162 182 M145 210 L163 194 M147 185 L159 174 "
             "M158 113 L171 120 M155 125 L172 128 M154 130 L170 135 M156 134 L167 138 "
             "M147 84 L157 97 M140 100 C142 110 145 120 146.5 127 M147 98 C148 108 148.5 118 149.5 128 M155 102 C157 110 157 117 155 124 "
             "M151 115 L131 141 M147 110 L127 135 M128 137 L141 108 M131 135 L143 109")
TENDONS = {
    "shin": [(2.4, "M145.5 360 C146 368 146.5 374 147 380"), (2.6, "M159 304 C158.5 309 158 313 157 317"),
             (.9, "M150 369 L157.5 367.5 M150 373.5 L157.5 372.5")],
    "thigh": [(1.8, "M146 226 C147 250 148 276 150 298"), (1.6, "M163.5 287 L161.5 293")],
    "torso": [(.8, "M165 152 L166 210")],
}
SIL = {
    "foot": "M131 388 C125 388 124 381 128 375 C132 369 142 367 151 369 C161 371 172 377 182 381 C188 384 188 388 182 388 Z",
    "shin": "M139 298 C130 310 128 327 130 341 C132 354 139 364 143 373 L145 382 L157 382 C157 368 158 350 159 330 C160 315 162 305 160 298 Z",
    "thigh": "M134 212 C128 232 128 258 132 277 C135 289 138 298 139 306 L161 306 C165 295 170 282 171 265 C172 245 169 227 165 212 Z",
    "torso": "M138 216 C132 206 133 192 136 180 C138 168 130 150 128 133 C127 117 134 103 144 94 L158 94 C165 102 176 110 177 128 C178 143 171 153 170 166 C169 182 170 198 167 210 C163 218 148 221 138 216 Z",
}
HEAD = "M139 68 C139 54 149 46 160 48 C171 50 176 60 175 71 C174 80 170 86 163 88 L148 88 C142 84 139 76 139 68 Z"


def _groups(parts):
    seen = []
    for g, _ in parts:
        if g and g not in seen:
            seen.append(g)
    return seen


def muscles(parts, fill_for, op_for):
    """Colored muscle groups (glow-able), then base tissue, then a volume + rim-light pass over every belly."""
    out = []
    by_group = {}
    for group, d in parts:
        by_group.setdefault(group, []).append(d)
    for group, ds in by_group.items():
        paths = "".join(f'<path d="{d}"></path>' for d in ds)
        if group is None:
            out.append(f'<g class="base">{paths}</g>')
        else:
            out.append(f'<g id="m-{group}" class="mus" fill="{fill_for(group)}" opacity="{op_for(group)}">{paths}</g>')
    out.append('<g class="vol">' + "".join(f'<path d="{d}"></path>' for _, d in parts) + "</g>")
    return "".join(out)


def glows(parts, pulse_for):
    return "".join(f'<use href="#m-{g}" filter="url(#glow)" class="rig {pulse_for(g)}"></use>' for g in _groups(parts))


def sheens(parts, sheen_for):
    return "".join(f'<use href="#m-{g}" class="rig sheen {sheen_for(g)}"></use>' for g in _groups(parts))


def tendons(key):
    return "".join(f'<path class="ten" style="stroke-width: {w}" d="{d}"></path>' for w, d in TENDONS[key])


def figure(fill_for, op_for, pulse_for, sheen_for, shin_attr, thigh_attr, torso_attr, with_fx=True):
    """shin_attr etc. are the attribute strings that make each group rotate (static transform or animation class)."""
    def seg(parts, fib, key):
        aura = glows(parts, pulse_for) if with_fx else ""
        sheen = sheens(parts, sheen_for) if with_fx else ""
        return f'{aura}{muscles(parts, fill_for, op_for)}{sheen}<path class="fib" d="{fib}"></path>{tendons(key)}'
    return f"""
<path class="sil" d="{SIL['foot']}"></path>
<path class="base" d="M133 386 C129 385 129 379 132 375 C137 371 145 371 151 372 C160 374 170 379 179 383 C182 385 181 386 178 386 Z"></path>
<path class="ten" style="stroke-width: .8" d="M156 375 L178 384 M154 377 L173 385 M152 379 L167 386"></path>
<circle class="node" cx="150" cy="380" r="2.2"></circle>
<g {shin_attr}>
<path class="sil" d="{SIL['shin']}"></path>
{seg(SHIN, SHIN_FIB, 'shin')}
<circle class="node" cx="150" cy="300" r="2.2"></circle>
<g {thigh_attr}>
<path class="sil" d="{SIL['thigh']}"></path>
{seg(THIGH, THIGH_FIB, 'thigh')}
<ellipse class="bone" cx="160.5" cy="298" rx="3.6" ry="5"></ellipse>
<circle class="node" cx="150" cy="215" r="2.2"></circle>
<g {torso_attr}>
<path class="sil" d="{SIL['torso']}"></path>
{seg(TORSO, TORSO_FIB, 'torso')}
<path class="head" d="{HEAD}"></path><path class="volHead" d="{HEAD}"></path>
<path class="fib" d="M146 60 C150 66 152 74 151 82 M152 56 C156 62 158 70 157 78 M142 66 C145 72 147 78 148 84"></path>
<path class="spec" d="M147 56 C152 51 160 50 166 53"></path>
<circle class="plate" cx="144" cy="101" r="25"></circle>
<circle class="plate" cx="144" cy="101" r="4"></circle>
<circle class="node" cx="150" cy="105" r="2.2"></circle>
</g>
</g>
</g>
"""


DEFS = """<radialGradient id="vol" cx="0.36" cy="0.3" r="0.82"><stop offset="0" style="stop-color: #ffffff; stop-opacity: .3"></stop><stop offset=".45" style="stop-color: #ffffff; stop-opacity: 0"></stop><stop offset="1" style="stop-color: #000000; stop-opacity: .6"></stop></radialGradient>
<linearGradient id="rim" x1="0" y1="0" x2="1" y2="1"><stop offset="0" style="stop-color: #E6F6FF; stop-opacity: .55"></stop><stop offset=".38" style="stop-color: #E6F6FF; stop-opacity: 0"></stop></linearGradient>"""

FIGURE_CSS = """.sil{fill:#151E29;stroke:#5EC8FF;stroke-opacity:.45;stroke-width:1}
.base{fill:#2C3948;stroke:rgba(0,0,0,.72);stroke-width:.7;stroke-linejoin:round}
.mus{stroke:rgba(0,0,0,.72);stroke-width:.7;stroke-linejoin:round}
.vol{fill:url(#vol);stroke:url(#rim);stroke-width:.8;pointer-events:none}
.volHead{fill:url(#vol);pointer-events:none}
.fib{fill:none;stroke:rgba(255,255,255,.15);stroke-width:.5;stroke-linecap:round}
.ten{fill:none;stroke:#D3DEE8;stroke-opacity:.6;stroke-linecap:round}
.bone{fill:#DCE6EF;fill-opacity:.9;stroke:rgba(0,0,0,.4);stroke-width:.5}
.head{fill:#253140;stroke:#5EC8FF;stroke-opacity:.5;stroke-width:1}
.spec{fill:none;stroke:#BFE9FF;stroke-opacity:.35;stroke-width:1.2;stroke-linecap:round}
.plate{fill:rgba(169,182,198,.04);stroke:#A9B6C6;stroke-opacity:.55;stroke-width:1}
.node{fill:#E8F6FF;stroke:#5EC8FF;stroke-width:1.4}"""

if __name__ == "__main__":
    col = {"quads": "#FF6A2B", "glutes": "#FF6A2B", "hams": "#FFC247", "erectors": "#668BAE", "core": "#668BAE", "calves": "#668BAE"}
    f = lambda a, b, c: figure(col.get, lambda g: 1, lambda g: "", lambda g: "", f'transform="rotate({a} 150 380)"',
                               f'transform="rotate({b} 150 300)"', f'transform="rotate({c} 150 215)"', with_fx=False)
    head = f'<svg xmlns="http://www.w3.org/2000/svg" WH><style>{FIGURE_CSS}</style><defs>{DEFS}</defs><rect x="-1000" y="-1000" width="3000" height="3000" fill="#0A0E13"></rect>'
    svg = head.replace("WH", 'width="1350" height="600" viewBox="0 0 900 400"') + f'{f(0,0,0)}<g transform="translate(300,0)">{f(20,-75,77)}</g><g transform="translate(600,0)">{f(35,-130,117)}</g></svg>'
    cairosvg.svg2png(bytestring=svg.encode(), write_to=OUT + "poses.png")
    zoom = head.replace("WH", 'width="420" height="1470" viewBox="100 40 100 350"') + f(0, 0, 0) + "</svg>"
    cairosvg.svg2png(bytestring=zoom.encode(), write_to=OUT + "zoom.png")
    print("ok")
