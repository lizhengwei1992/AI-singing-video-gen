from fastapi import FastAPI, WebSocket, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
import uvicorn

from config import Config
from app.api.routes import router as api_router
from app.websocket.handler import websocket_manager

# 确保目录存在
Config.ensure_directories()

app = FastAPI(
    title="AI-singing-video-gen",
    description="基于 ComfyUI 的AI-singing-video-gen",
    version="1.0.0"
)

# CORS 配置
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://127.0.0.1:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# 挂载 API 路由
app.include_router(api_router, prefix="/api")

# WebSocket 路由
@app.websocket("/ws/{trace_id}")
async def websocket_endpoint(websocket: WebSocket, trace_id: str):
    await websocket_manager.handle_websocket(websocket, trace_id)

# 健康检查
@app.get("/")
async def root():
    return {
        "message": "AI-singing-video-gen",
        "version": "1.0.0",
        "status": "running"
    }

# 错误处理
@app.exception_handler(HTTPException)
async def http_exception_handler(request, exc):
    from fastapi.responses import JSONResponse
    return JSONResponse(
        status_code=exc.status_code,
        content={
            "error": {
                "message": exc.detail,
                "code": exc.status_code
            }
        }
    )

if __name__ == "__main__":
    uvicorn.run(
        "main:app",
        host="0.0.0.0",
        port=8000,
        reload=True,
        log_level="info"
    )