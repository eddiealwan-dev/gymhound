"""Contrast 'pop' pass: string swaps applied in order to every artboard's CSS and gradient defs."""
SWAPS = [
    (".base{fill:#2C3948;stroke:rgba(0,0,0,.72);stroke-width:.7;stroke-linejoin:round}",
     ".base{fill:#3B4D62;stroke:rgba(0,0,0,.85);stroke-width:.85;stroke-linejoin:round}"),
    (".mus{stroke:rgba(0,0,0,.72);stroke-width:.7;stroke-linejoin:round}",
     ".mus{stroke:rgba(0,0,0,.85);stroke-width:.85;stroke-linejoin:round}"),
    (".vol{fill:url(#vol);stroke:url(#rim);stroke-width:.8;pointer-events:none}",
     ".vol{fill:url(#vol);stroke:url(#rim);stroke-width:1.05;pointer-events:none}"),
    (".fib{fill:none;stroke:rgba(255,255,255,.15);stroke-width:.5;stroke-linecap:round}",
     ".fib{fill:none;stroke:rgba(255,255,255,.24);stroke-width:.5;stroke-linecap:round}"),
    (".sil{fill:#151E29;", ".sil{fill:#0F161F;"),
    ('<stop offset="0" style="stop-color: #ffffff; stop-opacity: .3"></stop><stop offset=".45" style="stop-color: #ffffff; stop-opacity: 0"></stop><stop offset="1" style="stop-color: #000000; stop-opacity: .6"></stop>',
     '<stop offset="0" style="stop-color: #ffffff; stop-opacity: .46"></stop><stop offset=".4" style="stop-color: #ffffff; stop-opacity: 0"></stop><stop offset="1" style="stop-color: #000000; stop-opacity: .72"></stop>'),
    ('<stop offset="0" style="stop-color: #E6F6FF; stop-opacity: .55"></stop><stop offset=".38" style="stop-color: #E6F6FF; stop-opacity: 0"></stop>',
     '<stop offset="0" style="stop-color: #E6F6FF; stop-opacity: .9"></stop><stop offset=".42" style="stop-color: #E6F6FF; stop-opacity: 0"></stop>'),
    ("const NOT_INVOLVED_COLOR = '#2C3948';", "const NOT_INVOLVED_COLOR = '#3B4D62';"),
    (".face .base{stroke-width:.45}", ".face .base{stroke-width:.55}"),
    # definition pass 2
    (".base{fill:#3B4D62;stroke:rgba(0,0,0,.85);stroke-width:.85;stroke-linejoin:round}",
     ".base{fill:#3B4D62;stroke:rgba(0,0,0,.9);stroke-width:1;stroke-linejoin:round}\n.joint{fill:#2E3D4F;stroke:rgba(0,0,0,.9);stroke-width:.9}"),
    (".mus{stroke:rgba(0,0,0,.85);stroke-width:.85;stroke-linejoin:round}", ".mus{stroke:rgba(0,0,0,.9);stroke-width:1;stroke-linejoin:round}"),
    (".vol{fill:url(#vol);stroke:url(#rim);stroke-width:1.05;pointer-events:none}", ".vol{fill:url(#vol);stroke:url(#rim);stroke-width:1.3;pointer-events:none}"),
    (".fib{fill:none;stroke:rgba(255,255,255,.24);stroke-width:.5;stroke-linecap:round}", ".fib{fill:none;stroke:rgba(255,255,255,.34);stroke-width:.55;stroke-linecap:round}"),
    # definition pass 3 (+10%)
    (".fib{fill:none;stroke:rgba(255,255,255,.34);stroke-width:.55;stroke-linecap:round}", ".fib{fill:none;stroke:rgba(255,255,255,.4);stroke-width:.6;stroke-linecap:round}"),
    (".vol{fill:url(#vol);stroke:url(#rim);stroke-width:1.3;pointer-events:none}", ".vol{fill:url(#vol);stroke:url(#rim);stroke-width:1.45;pointer-events:none}"),
    (".base{fill:#3B4D62;stroke:rgba(0,0,0,.9);stroke-width:1;stroke-linejoin:round}", ".base{fill:#3B4D62;stroke:rgba(0,0,0,.92);stroke-width:1.1;stroke-linejoin:round}"),
    (".mus{stroke:rgba(0,0,0,.9);stroke-width:1;stroke-linejoin:round}", ".mus{stroke:rgba(0,0,0,.92);stroke-width:1.1;stroke-linejoin:round}"),
    ('<stop offset="0" style="stop-color: #ffffff; stop-opacity: .46"></stop><stop offset=".4" style="stop-color: #ffffff; stop-opacity: 0"></stop><stop offset="1" style="stop-color: #000000; stop-opacity: .72"></stop>',
     '<stop offset="0" style="stop-color: #ffffff; stop-opacity: .52"></stop><stop offset=".38" style="stop-color: #ffffff; stop-opacity: 0"></stop><stop offset="1" style="stop-color: #000000; stop-opacity: .8"></stop>'),
]


def apply(s, required=True):
    for a, b in SWAPS:
        if a in s:
            s = s.replace(a, b)
        elif required and not a.startswith("const") and not a.startswith(".face"):
            raise AssertionError("missing: " + a[:60])
    return s
