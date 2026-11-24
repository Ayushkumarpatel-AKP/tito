"""Narration for the Tito demo video: one mp3 per line (Microsoft Edge neural voice via edge-tts) + a timing file.
usage: python tools/make-voice.py"""
import asyncio, json, os, subprocess
import edge_tts

VOICE = 'en-IN-NeerjaNeural'
OUT = os.path.join(os.path.dirname(__file__), '..', 'website', 'video-src', 'audio')
LINES = [
    ('hello',     "Hi, I'm Tito, the tiny astronaut who lives on your screen."),
    ('shortcut',  "See something you don't understand? Press Control, Shift and Space."),
    ('draw',      "Then just draw a loop around it, or drag a box."),
    ('answer',    "Tito looks closely, and explains it in simple words."),
    ('translate', "Need it in Hindi, Marathi or Tamil? One tap translates it."),
    ('offline',   "No internet? No problem. A small built-in AI and an offline Hindi translator live right on your PC."),
    ('more',      "Save any answer as a clean PDF, keep it in your notebook, and bring any AI key. Free ones from Gemini or Groq work great."),
    ('cta',       "Tito is free for Windows. Say hello at tito dot enigmadev dot tech."),
]

def duration(path):
    r = subprocess.run(['ffprobe', '-v', 'error', '-show_entries', 'format=duration', '-of', 'default=nw=1:nk=1', path], capture_output=True, text=True)
    return float(r.stdout.strip())

async def main():
    os.makedirs(OUT, exist_ok=True); timing = []
    for key, text in LINES:
        p = os.path.join(OUT, key + '.mp3')
        await edge_tts.Communicate(text, VOICE, rate='-4%').save(p)
        timing.append({'key': key, 'text': text, 'dur': round(duration(p), 3)})
        print(key.ljust(10), timing[-1]['dur'])
    json.dump(timing, open(os.path.join(OUT, 'timing.json'), 'w'), indent=1)
asyncio.run(main())
