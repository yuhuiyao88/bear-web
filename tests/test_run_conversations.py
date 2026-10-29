"""Offline checks for the response-time code in run_conversations.py.

Run: python -m unittest tests/test_run_conversations.py
No network: requests.post, time.sleep and the clock are replaced with fakes.
"""
import json, sys, tempfile, unittest
from pathlib import Path
from unittest import mock

sys.path.insert(0, str(Path(__file__).parent))
import run_conversations as rc


class Clock:
    """Fake perf_counter; sleep() and fake requests advance it."""
    def __init__(self):
        self.now = 1000.0

    def perf_counter(self):
        return self.now

    def sleep(self, secs):
        self.now += secs


class Resp:
    def __init__(self, status, body):
        self.status_code, self._body, self.text = status, body, json.dumps(body)

    def json(self):
        return self._body


def fake_post(clock, replies):
    """replies: list of (seconds the request takes, status, body)."""
    it = iter(replies)

    def post(*a, **k):
        secs, status, body = next(it)
        clock.now += secs
        return Resp(status, body)
    return post


class TimingTest(unittest.TestCase):
    def setUp(self):
        self.clock = Clock()
        for target, fn in (("time.perf_counter", self.clock.perf_counter), ("time.sleep", self.clock.sleep)):
            p = mock.patch(f"run_conversations.{target}", fn)
            p.start()
            self.addCleanup(p.stop)
        rc.TIMES.clear()

    def test_reply_time_excludes_rate_limit_wait(self):
        replies = [(1.5, 429, {"error": "rate"}), (2.0, 504, {"error": "timeout"}), (3.25, 200, {"text": "hi"})]
        with mock.patch("run_conversations.requests.post", fake_post(self.clock, replies)):
            status, data, timing = rc.ask("https://bear.example.workers.dev", [])
        self.assertEqual(status, 200)
        self.assertAlmostEqual(timing["seconds"], 3.25)
        self.assertEqual(timing["retries"], 2)
        self.assertAlmostEqual(timing["retry_wait_seconds"], 2 * rc.RETRY_WAIT)

    def test_no_retry(self):
        with mock.patch("run_conversations.requests.post", fake_post(self.clock, [(4.0, 200, {"text": "ok"})])):
            _, _, timing = rc.ask("https://bear.example.workers.dev", [])
        self.assertEqual(timing, {"seconds": 4.0, "retries": 0, "retry_wait_seconds": 0.0})

    def test_stats(self):
        times = [(float(s), f"turn {s}") for s in range(1, 11)]
        s = rc.stats(times)
        self.assertEqual(s["n"], 10)
        self.assertEqual(s["mean"], 5.5)
        self.assertEqual(s["median"], 5.5)
        self.assertEqual(s["p90"], 9.1)  # numpy.percentile([1..10], 90)
        self.assertEqual((s["slowest"], s["slowest_turn"]), (10.0, "turn 10"))
        self.assertIsNone(rc.stats([]))
        self.assertEqual(rc.stats([(2.0, "only")])["p90"], 2.0)

    def test_is_deployed(self):
        for url in ("https://bear.yaolab.workers.dev", "https://bear.example.org"):
            self.assertTrue(rc.is_deployed(url), url)
        for url in ("http://localhost:8787", "https://localhost", "http://bear.yaolab.workers.dev",
                    "https://127.0.0.1:8000", "https://192.168.1.5", "https://10.0.0.2", "https://[::1]:9000",
                    "https://bear.local", "https://0.0.0.0"):
            self.assertFalse(rc.is_deployed(url), url)

    def run_spec(self, url, replies):
        spec = {"reviewer": "T", "conversations": [{"id": "c1", "intent": "x", "turns": ["a", "b", "c"]}]}
        with tempfile.TemporaryDirectory() as d:
            path = Path(d) / "t.json"
            path.write_text(json.dumps(spec))
            with mock.patch("run_conversations.requests.post", fake_post(self.clock, replies)):
                rc.run_file(url, path)
            return path.with_suffix(".transcript.md").read_text(), json.loads(path.with_suffix(".transcript.json").read_text())

    def test_transcript_on_deployed_site(self):
        replies = [(2.0, 200, {"text": "one"}), (1.0, 429, {}), (5.0, 200, {"text": "two"}), (3.0, 500, {"error": "boom"})]
        md, js = self.run_spec("https://bear.yaolab.workers.dev", replies)
        turns = js["conversations"][0]["results"]
        self.assertEqual([t["seconds"] for t in turns], [2.0, 5.0, 3.0])
        self.assertEqual(turns[1]["retries"], 1)
        self.assertEqual(turns[1]["retry_wait_seconds"], rc.RETRY_WAIT)
        # only answered (HTTP 200) turns count, and the 70 s wait is not in them
        self.assertEqual(js["response_time"], {"n": 2, "mean": 3.5, "median": 3.5, "p90": 4.7,
                                               "slowest": 5.0, "slowest_turn": "c1 turn 2"})
        self.assertIn("(HTTP 200, 5.0 s, after 1 rate-limit retry (70 s waiting, not counted)", md)
        self.assertTrue(md.rstrip().endswith("90th percentile 4.7 s, slowest 5.0 s (c1 turn 2)."))
        self.assertEqual(len(rc.TIMES), 2)

    def test_mock_server_times_never_reported(self):
        replies = [(2.0, 200, {"text": "one"}), (5.0, 200, {"text": "two"}), (3.0, 200, {"text": "three"})]
        md, js = self.run_spec("http://localhost:8787", replies)
        self.assertNotIn("response_time", js)
        for t in js["conversations"][0]["results"]:
            self.assertNotIn("seconds", t)
        self.assertNotRegex(md, r"\d\.\d s")
        self.assertIn("Not reported: this run was not against the deployed site.", md)
        self.assertEqual(rc.TIMES, [])


if __name__ == "__main__":
    unittest.main()
