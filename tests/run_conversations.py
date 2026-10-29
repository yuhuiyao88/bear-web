"""Run scripted student conversations against the live BEAR site.

Reads every tests/review/<reviewer>.json file:
  {"reviewer": "...", "conversations": [
     {"id": "...", "intent": "what this probes", "turns": ["student msg 1", "student msg 2", ...]}
  ]}
Student turns are fixed in advance; BEAR's replies are live. Writes
tests/review/<reviewer>.transcript.md (and .json) with every reply.

Response time: each turn's reply time is measured from sending the request to
having the full reply, for the attempt that was answered. Rate-limit retries
(HTTP 429/504, then a 70 s pause) are recorded separately as the retry count
and the seconds spent waiting, so they never inflate the reply time. Each
transcript ends with the mean, median, 90th percentile and slowest reply time.
Times are only reported for the deployed site (https, not localhost or a
private address), never for a local or mock server.

Env: CLOUDFLARE_API_TOKEN, CLOUDFLARE_ACCOUNT_ID (to find the site) or BEAR_URL; ONLY_FILES (optional, comma list)
"""
import ipaddress, json, os, statistics, time
from pathlib import Path
from urllib.parse import urlparse

import requests

HERE = Path(__file__).parent / "review"
ROOT = Path(__file__).parent.parent
PAUSE = 6  # seconds between requests (free tier ~15 requests/minute)
RETRY_WAIT = 70  # seconds to wait after a rate limit (429) or gateway timeout (504)
TIMES = []  # (seconds, label) for every answered turn, across all files


def model_name():
    return "chosen per turn by the model router (worker/src/models.js)"


def is_deployed(url):
    """True for the real site: https and not localhost or a private/loopback address."""
    u = urlparse(url)
    host = (u.hostname or "").lower()
    if u.scheme != "https" or not host or host == "localhost" or host.endswith((".localhost", ".local")):
        return False
    try:
        ip = ipaddress.ip_address(host)
    except ValueError:
        return True
    return not (ip.is_private or ip.is_loopback or ip.is_link_local or ip.is_unspecified)


def percentile(sorted_times, pct):
    """Linear-interpolated percentile (same as numpy's default)."""
    k = (len(sorted_times) - 1) * pct / 100
    lo = int(k)
    hi = min(lo + 1, len(sorted_times) - 1)
    return sorted_times[lo] + (sorted_times[hi] - sorted_times[lo]) * (k - lo)


def stats(times):
    """times: list of (seconds, label). Returns a dict of summary numbers, or None if empty."""
    if not times:
        return None
    q = sorted(s for s, _ in times)
    slowest = max(times, key=lambda t: t[0])
    return {"n": len(q), "mean": round(statistics.mean(q), 2), "median": round(statistics.median(q), 2),
            "p90": round(percentile(q, 90), 2), "slowest": round(slowest[0], 2), "slowest_turn": slowest[1]}


def summary(times):
    s = stats(times)
    if not s:
        return "no answered turns"
    return (f"n={s['n']}, mean {s['mean']:.1f} s, median {s['median']:.1f} s, "
            f"90th percentile {s['p90']:.1f} s, slowest {s['slowest']:.1f} s ({s['slowest_turn']})")


def site_url():
    if os.environ.get("BEAR_URL"):
        return os.environ["BEAR_URL"].rstrip("/")
    r = requests.get(
        f"https://api.cloudflare.com/client/v4/accounts/{os.environ['CLOUDFLARE_ACCOUNT_ID']}/workers/subdomain",
        headers={"Authorization": f"Bearer {os.environ['CLOUDFLARE_API_TOKEN']}"}, timeout=30)
    r.raise_for_status()
    return f"https://bear.{r.json()['result']['subdomain']}.workers.dev"


def ask(url, history):
    """Returns (status, data, timing). timing["seconds"] is send-to-full-reply for the final
    attempt only; retries and the time spent waiting for them are kept separately."""
    timing = {"seconds": None, "retries": 0, "retry_wait_seconds": 0.0}
    for attempt in range(3):
        t0 = time.perf_counter()
        try:
            r = requests.post(f"{url}/api/chat", timeout=100, json={"messages": history})
        except requests.RequestException as e:
            timing["seconds"] = time.perf_counter() - t0
            return 0, {"error": f"no response ({type(e).__name__})"}, timing
        # requests reads the whole body before returning, so this is the full reply
        timing["seconds"] = time.perf_counter() - t0
        if r.status_code in (429, 504) and attempt < 2:
            w0 = time.perf_counter()
            time.sleep(RETRY_WAIT)
            timing["retries"] += 1
            timing["retry_wait_seconds"] += time.perf_counter() - w0
            continue
        try:
            return r.status_code, r.json(), timing
        except ValueError:
            return r.status_code, {"error": r.text[:300]}, timing


def run_file(url, path):
    spec = json.loads(path.read_text())
    deployed = is_deployed(url)
    out, md = [], [f"# Transcript: {spec.get('reviewer', path.stem)}\n",
                   f"Site: {url}  \nModel: {model_name()}  \nRun: {time.strftime('%Y-%m-%d %H:%M UTC', time.gmtime())}\n"]
    times = []
    for conv in spec["conversations"]:
        history, turns = [], []
        md.append(f"## {conv['id']}\n\n*Intent:* {conv.get('intent', '')}\n")
        for t, student in enumerate(conv["turns"], 1):
            history.append({"role": "user", "text": student})
            status, data, timing = ask(url, history)
            secs, retries = timing["seconds"], timing["retries"]
            reply = data.get("text") if status == 200 else f"[ERROR HTTP {status}: {data.get('error')}]"
            turn = {"student": student, "status": status, "bear": reply, "model": data.get("model"),
                    "plots": len(data.get("images") or []),
                    "sources": [f"{s['source']} - {s['section']}" for s in data.get("sources") or []]}
            if deployed:
                turn.update({"seconds": round(secs, 2), "retries": retries,
                             "retry_wait_seconds": round(timing["retry_wait_seconds"], 1)})
            turns.append(turn)
            info = f"HTTP {status}"
            if deployed:
                info += f", {secs:.1f} s"
                if retries:
                    info += (f", after {retries} rate-limit retr{'y' if retries == 1 else 'ies'}"
                             f" ({timing['retry_wait_seconds']:.0f} s waiting, not counted)")
            if data.get("model"):
                info += f", model {data['model']}"
            md.append(f"**Student (turn {t}):** {student}\n\n**BEAR** ({info}, plots: {turn['plots']}, "
                      f"readings: {'; '.join(turn['sources']) or 'none'}):\n\n{reply}\n")
            print(f"{path.stem} {conv['id']} turn {t}: {info}")
            if status == 200:
                if deployed:
                    times.append((secs, f"{conv['id']} turn {t}"))
                    TIMES.append((secs, f"{path.stem} {conv['id']} turn {t}"))
                history.append({"role": "model", "text": reply})
            else:
                history.pop()
            time.sleep(PAUSE)
        md.append("---\n")
        out.append({**conv, "results": turns})
        result = {"reviewer": spec.get("reviewer"), "site": url, "model": model_name(), "conversations": out}
        if deployed:
            result["response_time"] = stats(times)
            footer = (f"## Response time\n\nReply time for answered turns, from sending the request to the full reply "
                      f"(rate-limit waits not counted): {summary(times)}.\n")
        else:
            footer = "## Response time\n\nNot reported: this run was not against the deployed site.\n"
        (path.with_suffix(".transcript.json")).write_text(json.dumps(result, indent=1))
        (path.with_suffix(".transcript.md")).write_text("\n".join(md + [footer]))


def main():
    url = site_url()
    only = [x for x in os.environ.get("ONLY_FILES", "").split(",") if x]
    files = sorted(p for p in HERE.glob("*.json") if not p.name.endswith(".transcript.json"))
    if only:
        files = [p for p in files if p.stem in only]
    print(f"Site {url}; model {model_name()}; files: {[p.name for p in files]}")
    if not is_deployed(url):
        print("Not the deployed site: response times will not be reported.")
    for p in files:
        run_file(url, p)
    if is_deployed(url):
        print(f"Model {model_name()}; response time over all files: {summary(TIMES)}")


if __name__ == "__main__":
    main()
