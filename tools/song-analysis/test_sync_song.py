"""Unit tests for the parts of sync_song.py that don't need audio or whisper.
Run:  python -m unittest discover tools/song-analysis      (only needs numpy)
"""
import json
import tempfile
import unittest
from pathlib import Path

import sync_song as S

ROOT = Path(__file__).resolve().parents[2]


class LyricsFile(unittest.TestCase):
    def test_sections_shouts_pins_and_comments(self):
        with tempfile.TemporaryDirectory() as d:
            p = Path(d) / "lyrics.txt"
            p.write_text("# Song — Boss\n[verse]\nIf a ^BOXCAR fell@12.5\n\n# skipped\n[chorus]\nToot toot\n", encoding="utf-8")
            lines = S.parse_lyrics(p)
            self.assertEqual(S.title_of(p), "Song")
        self.assertEqual([l["section"] for l in lines], ["verse", "chorus"])
        self.assertEqual(lines[0]["text"], "If a ^BOXCAR fell")  # the @pin is not shown in the game
        w = lines[0]["words"]
        self.assertTrue(w[2]["shout"])
        self.assertEqual(w[2]["text"], "BOXCAR")
        self.assertEqual(w[3]["pin"], 12.5)


class Alignment(unittest.TestCase):
    def test_tokens(self):
        self.assertEqual(S.parts_of("a-tumblin'"), ["a", "tumblin"])
        self.assertEqual(S.canon("running"), S.canon("runnin'"))
        self.assertEqual(S.canon("40"), "forty")

    def test_tolerates_misheard_and_missing_words(self):
        lyric = ["chugga", "chugga", "choo", "the", "trunk", "fell"]
        heard = ["tugga", "chugga", "choo", "uh", "truck", "fell"]
        pairs = S.align(lyric, heard)
        self.assertEqual(pairs, {0: 0, 1: 1, 2: 2, 4: 4, 5: 5})  # "the" was not heard

    def test_consensus_majority_wins(self):
        t, sure = S.consensus([(22.88, 0.16), (23.48, 0.91), (23.46, 0.92)])
        self.assertAlmostEqual(t, 23.47, places=2)
        self.assertTrue(sure)

    def test_consensus_disagreement_is_unsure(self):
        _, sure = S.consensus([(10.0, 0.9), (11.0, 0.9), (12.0, 0.9)])
        self.assertFalse(sure)

    def test_repair_spreads_squashed_repeats_over_vocal_onsets(self):
        disp = [(0, {"text": w}) for w in ["TOOT!", "TOOT!", "Choo-choo!"]]
        times = {0: 58.30, 1: 58.36, 2: 58.89}
        moved = S.repair_squashed(disp, times, vocal_on=[58.32, 58.74, 58.99])
        self.assertEqual(moved, {1})
        self.assertAlmostEqual(times[1], 58.74)

    def test_repair_leaves_fast_but_real_syllables(self):
        disp = [(0, {"text": w}) for w in ["Got", "a", "furnace"]]
        times = {0: 23.48, 1: 23.56, 2: 23.72}
        self.assertEqual(S.repair_squashed(disp, times, vocal_on=[23.5, 23.6]), set())


class Draft(unittest.TestCase):
    def test_draft_breaks_lines_at_pauses_and_sections_at_long_pauses(self):
        heard = [
            {"w": "All", "s": 4.3, "e": 4.6, "p": 0.9}, {"w": "aboard!", "s": 5.0, "e": 5.6, "p": 0.9},
            {"w": "Tickets,", "s": 9.7, "e": 10.1, "p": 0.9}, {"w": "please.", "s": 10.6, "e": 11.0, "p": 0.9},
            {"w": "Well", "s": 15.4, "e": 15.6, "p": 0.9}, {"w": "howdy", "s": 15.7, "e": 16.0, "p": 0.9},
        ]
        text = S.draft_lyrics(heard, "Old Smokestack")
        with tempfile.TemporaryDirectory() as d:
            p = Path(d) / "lyrics.txt"
            p.write_text(text, encoding="utf-8")
            lines = S.parse_lyrics(p)
        self.assertEqual([l["text"] for l in lines], ["All aboard!", "Tickets, please.", "Well howdy"])
        self.assertEqual(len({l["section"] for l in lines}), 3)


class TempoAndAnchors(unittest.TestCase):
    def test_tempo_map_matches_the_game(self):
        tm = S.TempoMap([{"beat": 0, "bpm": 120}, {"beat": 8, "bpm": 60}], offset_sec=0.5)
        self.assertAlmostEqual(tm.beat_of_time(0.5), 0)
        self.assertAlmostEqual(tm.beat_of_time(4.5), 8)
        self.assertAlmostEqual(tm.beat_of_time(6.5), 10)

    def test_anchors_resolve_like_the_game(self):
        level = json.loads((ROOT / "public/data/levels/smokestack.json").read_text(encoding="utf-8"))
        words = S.song_words(level["lyrics"])
        got = {(e["type"], e["anchor"]): S.resolve_anchor(words, e) for e in level["events"] if "anchor" in e}
        self.assertEqual(got[("drop", "BOXCAR")], 80)
        self.assertEqual(got[("drop", "PIANO")], 192)
        self.assertEqual(got[("groundWave", "TOOT#3")], 132)
        self.assertEqual(got[("groundWave", "TOOT#5")], 244)


if __name__ == "__main__":
    unittest.main()
