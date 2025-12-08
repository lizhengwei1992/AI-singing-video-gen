from app.services.task_manager import TaskManager

# 全局唯一的 TaskManager 实例，供 API 与 WebSocket 共享
task_manager = TaskManager()

