from fastapi import FastAPI, UploadFile, File
from starlette.testclient import TestClient
import shutil
import os

app = FastAPI()

@app.post("/upload")
async def upload(files: list[UploadFile] = File(...)):
    for value in files:
        filename = os.path.basename(value.filename).split("_")[-1]
        save_path = f"test_{filename}"
        await value.seek(0)
        with open(save_path, "wb") as buffer:
            shutil.copyfileobj(value.file, buffer, length=1024*1024*10)
        print("Size:", os.path.getsize(save_path))
    return {"status": "ok"}

client = TestClient(app)
res = client.post("/upload", files=[("files", ("my_file.txt", b"Hello "*100000))])
print(res.json())
