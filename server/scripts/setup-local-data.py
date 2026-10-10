"""Install free local translation and Greek place lookup data. No accounts or keys."""
from pathlib import Path
import json
import subprocess
import sys
import urllib.request
import venv
import zipfile

base = Path(__file__).resolve().parents[1] / "data"
base.mkdir(parents=True, exist_ok=True)

def download(url, destination, limit=400_000_000):
    if destination.exists():
        return
    print("Downloading " + destination.name, flush=True)
    request = urllib.request.Request(url, headers={"User-Agent": "EstiaPropertySearch/0.2"})
    temporary = destination.with_suffix(".download")
    try:
        with urllib.request.urlopen(request, timeout=60) as response, temporary.open("wb") as output:
            count = 0
            while block := response.read(1024 * 1024):
                count += len(block)
                if count > limit:
                    raise ValueError("Download exceeds expected size.")
                output.write(block)
        temporary.replace(destination)
    finally:
        temporary.unlink(missing_ok=True)

places = base / "places"
places.mkdir(exist_ok=True)
download("https://download.geonames.org/export/dump/GR.zip", places / "GR.zip", 20_000_000)
with zipfile.ZipFile(places / "GR.zip") as archive:
    (places / "GR.txt").write_bytes(archive.read("GR.txt"))
print("Greek place lookup data ready (GeoNames CC BY 4.0).", flush=True)

translation = base / "translation"
translation.mkdir(exist_ok=True)
environment = translation / "venv"
executable = environment / ("Scripts/python.exe" if sys.platform == "win32" else "bin/python")
if not executable.exists():
    venv.create(environment, with_pip=True)
subprocess.run([str(executable), "-m", "pip", "install", "--disable-pip-version-check",
                "ctranslate2==4.8.2", "sentencepiece==0.2.2"], check=True)
download("https://argos-net.com/v1/translate-el_en-1_9.argosmodel", translation / "el-en.argosmodel")
with zipfile.ZipFile(translation / "el-en.argosmodel") as archive:
    for member in archive.infolist():
        destination = (translation / member.filename).resolve()
        if not destination.is_relative_to(translation.resolve()):
            raise ValueError("Unsafe archive member.")
        archive.extract(member, translation)
models = list(translation.glob("*/model/model.bin"))
if len(models) != 1:
    raise ValueError("Expected one Greek-to-English translation model.")
model_root = models[0].parent.parent
(translation / "installed.json").write_text(json.dumps({
    "model": model_root.name,
    "engine": "Argos Greek-English 1.9 / CTranslate2 4.8.2",
    "source": "https://github.com/argosopentech/argospm-index"
}), encoding="utf-8")
print("Local Greek-to-English translation ready.", flush=True)
