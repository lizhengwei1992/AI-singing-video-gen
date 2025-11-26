from fastapi import WebSocket, WebSocketDisconnect
import json
from typing import Dict

from app.services.task_manager_instance import task_manager

class WebSocketManager:
    def __init__(self):
        self.active_connections: Dict[str, WebSocket] = {}
        self.task_manager = task_manager

    async def connect(self, websocket: WebSocket, trace_id: str):
        await websocket.accept()
        self.active_connections[trace_id] = websocket
        self.task_manager.register_websocket_connection(trace_id, websocket)

        # 发送连接成功消息
        await self.send_message(websocket, {
            "event": "connection",
            "data": {"trace_id": trace_id}
        })

        # 发送当前任务状态
        task_status = self.task_manager.get_task_status(trace_id)
        if task_status:
            await self.send_message(websocket, {
                "event": "progress",
                "data": {
                    "stage": task_status.stage.value,
                    "progress": task_status.progress,
                    "current_task": task_status.current_task.dict() if task_status.current_task else None,
                    "completed": task_status.completed,
                    "total": task_status.total
                }
            })

    def disconnect(self, trace_id: str, websocket: WebSocket):
        if trace_id in self.active_connections:
            del self.active_connections[trace_id]
        self.task_manager.unregister_websocket_connection(trace_id, websocket)

    async def send_message(self, websocket: WebSocket, message: dict):
        try:
            await websocket.send_text(json.dumps(message))
        except Exception as e:
            print(f"发送 WebSocket 消息失败: {e}")

    async def send_to_trace(self, trace_id: str, message: dict):
        """向特定 trace_id 的所有连接发送消息"""
        if trace_id in self.active_connections:
            websocket = self.active_connections[trace_id]
            await self.send_message(websocket, message)

    async def handle_websocket(self, websocket: WebSocket, trace_id: str):
        await self.connect(websocket, trace_id)

        try:
            while True:
                # 接收客户端消息（如果需要双向通信）
                data = await websocket.receive_text()
                message = json.loads(data)

                # 处理客户端消息
                await self.handle_client_message(websocket, trace_id, message)

        except WebSocketDisconnect:
            self.disconnect(trace_id, websocket)
        except Exception as e:
            print(f"WebSocket 处理错误: {e}")
            self.disconnect(trace_id, websocket)

    async def handle_client_message(self, websocket: WebSocket, trace_id: str, message: dict):
        """处理客户端发送的消息"""
        event = message.get("event")
        data = message.get("data", {})

        if event == "ping":
            # 响应心跳
            await self.send_message(websocket, {
                "event": "pong",
                "data": {"timestamp": data.get("timestamp")}
            })

        elif event == "get_status":
            # 获取任务状态
            task_status = self.task_manager.get_task_status(trace_id)
            if task_status:
                await self.send_message(websocket, {
                    "event": "status",
                    "data": task_status.dict()
                })

        else:
            # 未知事件
            await self.send_message(websocket, {
                "event": "error",
                "data": {
                    "message": f"未知事件: {event}",
                    "code": "UNKNOWN_EVENT"
                }
            })

# 全局 WebSocket 管理器实例
websocket_manager = WebSocketManager()