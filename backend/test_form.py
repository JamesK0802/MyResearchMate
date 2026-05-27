from fastapi import FastAPI, Request
from starlette.testclient import TestClient
from starlette.datastructures import UploadFile as StarletteUploadFile

app = FastAPI()

@app.post("/upload")
async def upload(request: Request):
    form = await request.form()
    results = []
    for field_name, value in form.multi_items():
        is_starlette = isinstance(value, StarletteUploadFile)
        results.append({
            "name": field_name,
            "type": str(type(value)),
            "is_starlette": is_starlette
        })
    return results

client = TestClient(app)
res = client.post("/upload", files=[("files", ("my_file.txt", b"Hello"))])
print(res.json())
