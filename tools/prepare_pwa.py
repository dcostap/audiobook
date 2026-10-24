"""Set the PWA cache version from the published files. Run before deployment."""

import hashlib
import json
from pathlib import Path
import re

SITE = Path(__file__).resolve().parents[1] / "site"
worker = SITE / "sw.js"
source = worker.read_text(encoding="utf-8")
assets = ["./", "index.html", "app.js", "pwa.js", "style.css", "manifest.webmanifest", "library.json"]
assets += sorted(p.relative_to(SITE).as_posix() for folder in ("fonts", "icons")
                 for p in (SITE / folder).iterdir() if p.suffix in (".woff2", ".png", ".ico")
                 and p.name != "icon-1024.png")
assets += [book["cover"] for book in json.loads((SITE / "library.json").read_text(encoding="utf-8"))]
precache = "const ASSETS = " + json.dumps(list(dict.fromkeys(assets)), indent=2) + ";"
source = re.sub(r"// BEGIN PRECACHE.*?// END PRECACHE",
                "// BEGIN PRECACHE\n" + precache + "\n// END PRECACHE", source, flags=re.S)
source = re.sub(r'const VERSION = "[^"]*";', 'const VERSION = "dev";', source)
digest = hashlib.sha256(source.encode())
# Include chapter text too, so a data-only deployment also updates the library.
for path in sorted(SITE.rglob("*")):
    if not path.is_file() or path == worker or path.suffix == ".mp3":
        continue
    digest.update(path.relative_to(SITE).as_posix().encode())
    digest.update(path.read_bytes())
version = digest.hexdigest()[:16]
worker.write_text(source.replace('const VERSION = "dev";', f'const VERSION = "{version}";'),
                  encoding="utf-8", newline="\n")
print(f"PWA version {version}; {len(assets)} cached files")
