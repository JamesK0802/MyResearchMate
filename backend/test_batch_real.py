import requests
import json
import time

url = "http://127.0.0.1:8000/api/analyze"
data = {"targets": json.dumps([{"gene": "Gene1", "sequence": "A"*200, "targets": [{"target_id": "T1", "sgrna_seq": "A"*20, "window_size": 90}]}])}
files = [
    ("files", ("test1.fastq", b"@SEQ1\n" + b"A"*100 + b"\n+\n" + b"F"*100 + b"\n")),
    ("files", ("test2.fastq", b"@SEQ2\n" + b"A"*100 + b"\n+\n" + b"F"*100 + b"\n"))
]

res = requests.post(url, data=data, files=files)
task_id = res.json()["task_id"]
while True:
    st = requests.get(f"http://127.0.0.1:8000/api/status/{task_id}").json()
    if st["status"] in ["completed", "failed"]:
        print(st)
        break
    time.sleep(0.5)
