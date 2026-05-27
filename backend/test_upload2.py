import asyncio
from starlette.datastructures import FormData, UploadFile as StarletteUploadFile
from fastapi import UploadFile as FastApiUploadFile

print("Starlette UploadFile is FastAPI UploadFile?", StarletteUploadFile is FastApiUploadFile)
