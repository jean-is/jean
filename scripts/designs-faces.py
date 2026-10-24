# Designs' phase 0: renames each of the nine faces to its voice and checks it (scripts/designs-faces.js
# fetches them). Needs fontTools and brotli: python -m pip install fonttools brotli, in a place of its
# own; nothing of it ships. Reads <out>/faces.json, writes <out>/voices/<voice>-<family>-<subset>.woff2
# and <out>/checked.json: each file's size before and after renaming, its glyphs and axes, the
# letters of Vietnamese, Yoruba and Hausa its family covers, and the features Arabic and Hebrew need.
import json
import sys
from fontTools.ttLib import TTFont

OUT = sys.argv[1]
VIETNAMESE = "ẠạẢảẤấẦầẨẩẪẫẬậẮắẰằẲẳẴẵẶặẸẹẺẻẼẽẾếỀềỂểỄễỆệỈỉỊịỌọỎỏỐốỒồỔổỖỗỘộỚớỜờỞởỠỡỢợỤụỦủỨứỪừỬửỮữỰựỲỳỴỵỶỷỸỹĐđƠơƯư"
# Yoruba: the dotted vowels and s, and the tone marks laid over any vowel, combining.
YORUBA = "ẸẹỌọṢṣÀÁÈÉÌÍÒÓÙÚàáèéìíòóùú̀́̄"
HAUSA = "ƁɓƊɗƘƙƳƴʼ"
NAMES = (1, 4, 6, 16)
# The letters beyond English that each of Jean's Latin, Cyrillic and Greek languages writes: a voice is
# offered in a language only where its face has every one of them.
LANGUAGES = {
    "fr": "ÀÂÆÇÉÈÊËÎÏÔŒÙÛÜŸàâæçéèêëîïôœùûüÿ", "fr-CA": "ÀÂÇÉÈÊËÎÏÔÙÛÜàâçéèêëîïôùûü", "es": "ÁÉÍÑÓÚÜáéíñóúü¿¡",
    "de": "ÄÖÜäöüß", "it": "ÀÈÉÌÒÙàèéìòù", "pt": "ÁÂÃÀÇÉÊÍÓÔÕÚáâãàçéêíóôõú", "nl": "ËÏëï", "da": "ÆØÅæøå", "sv": "ÅÄÖåäö",
    "fi": "ÄÖÅäöåŠšŽž", "pl": "ĄĆĘŁŃÓŚŹŻąćęłńóśźż", "cs": "ÁČĎÉĚÍŇÓŘŠŤÚŮÝŽáčďéěíňóřšťúůýž", "sk": "ÁÄČĎÉÍĹĽŇÓÔŔŠŤÚÝŽáäčďéíĺľňóôŕšťúýž",
    "hu": "ÁÉÍÓÖŐÚÜŰáéíóöőúüű", "ro": "ĂÂÎȘȚăâîșț", "hr": "ČĆĐŠŽčćđšž", "tr": "ÇĞİÖŞÜçğıöşü", "br": "ÑÙñù", "co": "ÀÈÌÒÙàèìòù",
    "vi": VIETNAMESE, "yo": "ẸẹỌọṢṣÀÁÈÉÌÍÒÓÙÚàáèéìíòóùú̀́", "ha": HAUSA, "id": "", "ms": "", "tl": "Ññ", "sw": "",
    "ru": "АБВГДЕЁЖЗИЙКЛМНОПРСТУФХЦЧШЩЪЫЬЭЮЯабвгдеёжзийклмнопрстуфхцчшщъыьэюя", "uk": "ҐЄІЇґєії", "bg": "ЪЬЮЯъьюя",
    "el": "ΑΒΓΔΕΖΗΘΙΚΛΜΝΞΟΠΡΣΤΥΦΧΨΩαβγδεζηθικλμνξοπρσςτυφχψωάέήίόύώΐΰ",
}


def features(font, table):
    if table not in font:
        return []
    found = font[table].table.FeatureList
    return sorted({record.FeatureTag for record in found.FeatureRecord}) if found else []


def scripts(font, table):
    if table not in font or not font[table].table.ScriptList:
        return []
    return sorted({record.ScriptTag for record in font[table].table.ScriptList.ScriptRecord})


def renamed(path, voice, target):
    font = TTFont(path)
    for record in font["name"].names:
        if record.nameID in NAMES:
            record.string = voice.replace(" ", "") if record.nameID == 6 else voice
        if record.nameID == 3:
            record.string = f"{voice};Designs"
    font.flavor = "woff2"
    font.save(target)
    return font


faces = json.load(open(f"{OUT}/faces.json", encoding="utf-8"))
checked = []
for face in faces:
    covered = set()
    entry = {"family": face["family"], "voice": face["voice"], "reserved": face["reserved"], "copyright": face["copyright"], "missing": face["missing"], "files": []}
    for one in face["files"]:
        target = f"{OUT}/voices/{face['voice'].lower()}-{face['dir']}-{one['subset']}.woff2"
        font = renamed(one["path"], face["voice"], target)
        after = TTFont(target)
        covered |= set(after.getBestCmap() or {})
        import os
        entry["files"].append({
            "subset": one["subset"],
            "before": one["bytes"],
            "after": os.path.getsize(target),
            "glyphs": len(after.getGlyphOrder()),
            "axes": [axis.axisTag for axis in after["fvar"].axes] if "fvar" in after else [],
            "name": after["name"].getDebugName(1),
            "gsub": features(after, "GSUB"),
            "gpos": features(after, "GPOS"),
            "scripts": scripts(after, "GSUB"),
        })
    def lacking(letters):
        return "".join(char for char in letters if ord(char) not in covered)
    if any(one["subset"].startswith("latin") for one in face["files"]):
        entry["lacks"] = {"vietnamese": lacking(VIETNAMESE), "yoruba": lacking(YORUBA), "hausa": lacking(HAUSA)}
        entry["languages"] = {lang: lacking(letters) for lang, letters in LANGUAGES.items()}
    checked.append(entry)

summary = []
for entry in checked:
    line = {
        "family": entry["family"], "voice": entry["voice"], "reserved": entry["reserved"],
        "kb": round(sum(one["after"] for one in entry["files"]) / 1024, 1),
        "renamed_delta_bytes": sum(one["after"] - one["before"] for one in entry["files"]),
        "axes": sorted({axis for one in entry["files"] for axis in one["axes"]}),
    }
    if "lacks" in entry:
        line["lacks"] = {key: value for key, value in entry["lacks"].items() if value}
        line["not_offered_in"] = {lang: value for lang, value in entry["languages"].items() if value}
    arabic = [one for one in entry["files"] if one["subset"] in ("arabic", "hebrew")]
    for one in arabic:
        line[f"{one['subset']}_features"] = [tag for tag in one["gsub"] + one["gpos"] if tag in ("init", "medi", "fina", "isol", "rlig", "liga", "calt", "mark", "mkmk", "kern", "ccmp")]
    summary.append(line)
json.dump({"faces": checked, "summary": summary}, open(f"{OUT}/checked.json", "w", encoding="utf-8"), ensure_ascii=False, indent=2)
