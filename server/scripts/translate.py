"""Local Greek-to-English NMT. Reads a JSON string array on stdin; writes translations."""
from pathlib import Path
import json
import re
import sys
import ctranslate2
import sentencepiece

sys.stdin.reconfigure(encoding="utf-8")
sys.stdout.reconfigure(encoding="utf-8")
base = Path(__file__).resolve().parents[1] / "data" / "translation"
info = json.loads((base / "installed.json").read_text(encoding="utf-8"))
root = base / info["model"]
processor = sentencepiece.SentencePieceProcessor(model_file=str(root / "sentencepiece.model"))
translator = ctranslate2.Translator(str(root / "model"), device="cpu", compute_type="int8",
                                   inter_threads=1, intra_threads=4)
texts = json.load(sys.stdin)
if not isinstance(texts, list) or len(texts) > 500:
    raise ValueError("Expected up to 500 texts.")
output = []
for text in texts:
    if not isinstance(text, str) or len(text) > 10000:
        raise ValueError("Invalid translation text.")
    if not re.search(r"[\u0370-\u03ff\u1f00-\u1fff]", text):
        output.append(text)
        continue
    # Translate complete sentences, retaining paragraph order; keep model inputs bounded.
    chunks = re.split(r"(?<=[.!?;])\s+(?=[A-ZΑ-ΩΆΈΉΊΌΎΏ])|\n+", text.strip())
    tokens = []
    for chunk in chunks:
        encoded = processor.encode(chunk, out_type=str)
        tokens.extend(encoded[i:i+240] for i in range(0, len(encoded), 240))
    results = translator.translate_batch(tokens, beam_size=4, max_decoding_length=512,
                                         repetition_penalty=1.1, no_repeat_ngram_size=4)
    output.append(" ".join(processor.decode(result.hypotheses[0]) for result in results))
json.dump(output, sys.stdout, ensure_ascii=False)
