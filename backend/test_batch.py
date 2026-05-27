import requests
import json
url = "http://127.0.0.1:8000/api/analyze"
data = {"targets": json.dumps([{"target_id": "T1", "reference_seq": "A"*200, "sgrna_seq": "A"*20, "window_size": 90}])}
files = [
    ("files", ("1_sample.fastq", b"@1\n" + b"A"*100 + b"\n+\n" + b"F"*100 + b"\n"))
]
res = requests.post(url, data=data, files=files)
import time
task_id = res.json()["task_id"]
while True:
    st = requests.get(f"http://127.0.0.1:8000/api/status/{task_id}").json()
    if st["status"] in ["completed", "failed"]:
        print(st)
        break
    time.sleep(0.5)
