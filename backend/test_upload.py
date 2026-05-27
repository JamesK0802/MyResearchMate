import requests
import json
import time

url = "http://127.0.0.1:8000/api/analyze"
data = {
    "targets": json.dumps([{"target_id": "T1", "reference_seq": "A"*200, "sgrna_seq": "A"*20, "window_size": 90}])
}
files = [
    ("files", ("test.fastq", b"@SEQ_ID\n" + b"A"*100 + b"\n+\n" + b"F"*100 + b"\n"))
]

print("Sending request...")
response = requests.post(url, data=data, files=files)
print("Response:", response.json())

task_id = response.json().get("task_id")
if task_id:
    while True:
        status_res = requests.get(f"http://127.0.0.1:8000/api/status/{task_id}")
        print("Status:", status_res.json())
        if status_res.json().get("status") in ["completed", "failed"]:
            break
        time.sleep(0.5)
