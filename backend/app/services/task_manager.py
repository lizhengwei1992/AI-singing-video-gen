import asyncio
import json
import uuid
from typing import Dict, List, Optional
from pathlib import Path
import aiofiles
from datetime import datetime
from fastapi import WebSocket
import subprocess
import time
import requests
import websocket

from app.models.schemas import (
    TaskStage, TaskInfo, TaskConfig, TaskStatus, TaskLog,
    ProgressEvent, TaskStartEvent, TaskCompleteEvent,
    TaskFailedEvent, BatchCompleteEvent, ErrorEvent
)
from app.services.comfyui_client import ComfyUIClient
from app.services.audio_processor import AudioProcessor
from config import Config

class TaskManager:
    def __init__(self):
        self.active_tasks: Dict[str, TaskStatus] = {}
        self.ws_connections: Dict[str, List] = {}
        self.comfyui_client = ComfyUIClient()
        self.audio_processor = AudioProcessor()

    async def _ensure_comfyui_ready(self, trace_id: str) -> bool:
        """确保ComfyUI服务就绪"""
        try:
            # 检查HTTP服务
            response = requests.get(f"http://127.0.0.1:8090/system_stats", timeout=10)
            if response.status_code != 200:
                return False

            # 检查WebSocket服务
            try:
                test_ws = websocket.WebSocket()
                test_ws.connect(f"ws://127.0.0.1:8090/ws?clientId=readiness_check", timeout=10)
                test_ws.close()
                return True
            except Exception:
                return False
        except Exception:
            return False

    async def _restart_comfyui(self, trace_id: str):
        """重启ComfyUI服务，确保完全启动后再返回"""
        try:
            await self._add_log(trace_id, "正在重启ComfyUI服务...", "info")

            # 查找并kill ComfyUI进程
            try:
                # 查找运行在8090端口的进程
                result = subprocess.run(['lsof', '-ti', ':8090'], capture_output=True, text=True)
                if result.stdout.strip():
                    pid = result.stdout.strip()
                    subprocess.run(['kill', '-9', pid], check=True)
                    await self._add_log(trace_id, f"已终止ComfyUI进程: PID {pid}", "info")
                    time.sleep(3)  # 等待进程完全终止
            except subprocess.CalledProcessError:
                await self._add_log(trace_id, "未找到ComfyUI进程或终止失败", "warn")

            # 启动ComfyUI
            await self._add_log(trace_id, "正在启动ComfyUI服务...", "info")

            # 使用tmux在第一个窗口启动ComfyUI (窗口1)
            cmd = f"tmux send-keys -t gen_video:1 'cd /home/lzw/project/ComfyUI && python main.py --port 8090 --listen' C-m"
            subprocess.run(cmd, shell=True, check=True)

            await self._add_log(trace_id, "ComfyUI启动命令已发送，等待服务启动...", "info")

            # 更严格的启动检测
            max_retries = 60  # 最多尝试60次，每次3秒 = 3分钟
            for i in range(max_retries):
                try:
                    # 第一步：检查端口是否响应
                    response = requests.get(f"http://127.0.0.1:8090/system_stats", timeout=10)
                    if response.status_code == 200:
                        await self._add_log(trace_id, f"ComfyUI HTTP服务响应正常 (尝试 {i+1})", "info")

                        # 第二步：检查WebSocket连接是否正常
                        try:
                            test_ws = websocket.WebSocket()
                            test_ws.connect(f"ws://127.0.0.1:8090/ws?clientId=test_{i}", timeout=10)
                            test_ws.close()
                            await self._add_log(trace_id, "ComfyUI WebSocket服务正常", "info")

                            # 第三步：等待额外时间确保服务完全就绪
                            await asyncio.sleep(5)
                            await self._add_log(trace_id, "ComfyUI服务完全启动成功", "info")
                            return True
                        except Exception as ws_error:
                            await self._add_log(trace_id, f"WebSocket连接失败: {ws_error}，继续等待...", "warn")

                except requests.exceptions.RequestException as e:
                    await self._add_log(trace_id, f"ComfyUI服务未响应 (尝试 {i+1}/{max_retries}): {str(e)}", "debug")
                except Exception as e:
                    await self._add_log(trace_id, f"启动检测异常 (尝试 {i+1}/{max_retries}): {str(e)}", "debug")

                await asyncio.sleep(3)

            await self._add_log(trace_id, "ComfyUI服务重启失败：超时", "error")
            return False

        except Exception as e:
            await self._add_log(trace_id, f"重启ComfyUI服务失败: {str(e)}", "error")
            return False

    async def _add_log(self, trace_id: str, message: str, level: str = "info", details: Optional[Dict] = None):
        """添加任务日志"""
        if trace_id not in self.active_tasks:
            return

        task_status = self.active_tasks[trace_id]
        if not task_status.logs:
            task_status.logs = []

        log_entry = TaskLog(
            timestamp=datetime.now().isoformat(),
            level=level,
            message=message,
            details=details
        )

        task_status.logs.append(log_entry)

        # 保存状态到文件
        await self._save_task_status(trace_id, task_status)

    async def create_task(
        self,
        images: List[str],
        audios: List[str],
        config: TaskConfig
    ) -> str:
        """创建新任务"""
        trace_id = str(uuid.uuid4())

        task_status = TaskStatus(
            trace_id=trace_id,
            stage=TaskStage.PENDING,
            progress=0.0,
            completed=0,
            total=0,
            # 保存ComfyUI生成参数信息
            input_images=images,
            input_audios=audios,
            segment_duration=config.segmentDuration,
            output_prefix=config.outputPrefix,
            prompt=config.prompt
        )

        self.active_tasks[trace_id] = task_status
        self.ws_connections[trace_id] = []

        # 保存任务状态到文件
        await self._save_task_status(trace_id, task_status)

        # 异步执行任务
        asyncio.create_task(self._execute_task(trace_id, images, audios, config))

        return trace_id

    async def _execute_task(
        self,
        trace_id: str,
        images: List[str],
        audios: List[str],
        config: TaskConfig
    ):
        """执行任务的主要流程"""
        try:
            # 添加任务开始日志
            await self._add_log(trace_id, "任务开始执行", "info", {
                "images": len(images),
                "audios": len(audios),
                "segment_duration": config.segmentDuration,
                "output_prefix": config.outputPrefix
            })

            # 1. 音频分割阶段
            await self._update_task_status(
                trace_id,
                stage=TaskStage.SPLITTING,
                progress=0.1
            )

            await self._add_log(trace_id, "开始音频分割阶段", "info")

            all_segments = []
            for i, audio_path in enumerate(audios):
                # 添加音频分割日志
                await self._add_log(trace_id, f"正在分割音频: {Path(audio_path).name}", "info", {
                    "audio_path": audio_path,
                    "index": i + 1
                })

                # 更新当前处理的音频文件信息
                current_audio_task = TaskInfo(
                    audio=Path(audio_path).name,
                    image="",  # 音频分割阶段没有图片
                    index=i + 1
                )

                await self._update_task_status(
                    trace_id,
                    current_task=current_audio_task,
                    progress=0.1 + (i / len(audios)) * 0.1  # 在0.1-0.2之间显示音频分割进度
                )

                segments = await self.audio_processor.split_audio(
                    audio_path,
                    config.segmentDuration,
                    f"audio_{i}"
                )
                all_segments.extend(segments)

                await self._add_log(trace_id, f"音频分割完成: {Path(audio_path).name} -> {len(segments)} 个片段", "info", {
                    "segments_count": len(segments),
                    "segment_paths": [str(Path(seg).name) for seg in segments]
                })

            # 计算任务映射：将音频片段均匀分配到图片上
            # 例如：13个片段，6张图片 -> 每2个片段对应1张图片，最后3个片段对应第6张图片
            task_mappings = []
            total_segments = len(all_segments)
            total_images = len(images)

            for segment_index, segment_path in enumerate(all_segments):
                # 计算这个片段应该对应哪张图片
                image_index = min(segment_index * total_images // total_segments, total_images - 1)
                image_path = images[image_index]

                task_mappings.append({
                    "sub_task_{}".format(segment_index): [
                        image_path,
                        segment_path,
                        f"{config.outputPrefix}_{segment_index:03d}"
                    ]
                })

            total_tasks = len(all_segments)  # 任务总数等于音频片段数

            # 音频分割完成，更新到处理阶段
            await self._update_task_status(
                trace_id,
                stage=TaskStage.PROCESSING,
                progress=0.2,
                total=total_tasks,
                current_task=None  # 清除当前任务信息
            )

            # 按图片名称排序
            images_sorted = sorted(images, key=lambda x: Path(x).name)
            await self._add_log(trace_id, f"图片按名称排序完成: {[Path(img).name for img in images_sorted]}", "info")

            # 计算任务映射：将音频片段均匀分配到图片上
            # 例如：13个片段，6张图片 -> 每2个片段对应1张图片，最后3个片段对应第6张图片
            task_mappings = []
            total_segments = len(all_segments)
            total_images = len(images_sorted)

            for segment_index, segment_path in enumerate(all_segments):
                # 计算这个片段应该对应哪张图片
                image_index = min(segment_index * total_images // total_segments, total_images - 1)
                image_path = images_sorted[image_index]

                task_mappings.append({
                    "sub_task_{}".format(segment_index): [
                        image_path,
                        segment_path,
                        f"{config.outputPrefix}_{segment_index:03d}"
                    ]
                })

            # 2. 批量生成阶段
            video_chunks_with_audio: List[str] = []
            video_chunks_without_audio: List[str] = []
            preview_frames: List[str] = []

            await self._add_log(trace_id, "开始视频生成阶段", "info")

            # 在第一个任务开始前，确保ComfyUI完全启动
            if len(task_mappings) > 0:
                await self._add_log(trace_id, "检查ComfyUI服务状态...", "info")
                comfyui_ready = await self._ensure_comfyui_ready(trace_id)
                if not comfyui_ready:
                    await self._add_log(trace_id, "ComfyUI服务未就绪，尝试重启...", "warn")
                    restart_success = await self._restart_comfyui(trace_id)
                    if not restart_success:
                        raise Exception("ComfyUI服务无法启动，无法继续执行任务")

            for task_index, mapping in enumerate(task_mappings):
                # 从映射中提取信息
                sub_task_key = list(mapping.keys())[0]
                image_path, segment_path, output_prefix = mapping[sub_task_key]

                task_info = TaskInfo(
                    audio=Path(segment_path).name,
                    image=Path(image_path).name,
                    index=task_index + 1
                )

                # 发送任务开始事件
                await self._send_websocket_message(
                    trace_id,
                    "task_start",
                    self._serialize_event(TaskStartEvent(task=task_info))
                )

                try:
                    # 执行视频生成
                    await self._add_log(trace_id, f"调用ComfyUI生成视频: 图片={Path(image_path).name}, 音频={Path(segment_path).name}", "info", {
                        "image_path": image_path,
                        "audio_path": segment_path,
                        "output_prefix": output_prefix
                    })

                    output_files = await self.comfyui_client.execute_video_generation(
                        image_path=image_path,
                        audio_path=segment_path,
                        output_prefix=output_prefix,
                        prompt_text=config.prompt
                    )

                    # 根据规范，每个子任务输出 3 个文件
                    chunk_with_audio = Path(Config.COMFYUI_OUTPUT) / f"{output_prefix}_00001-audio.mp4"
                    chunk_without_audio = Path(Config.COMFYUI_OUTPUT) / f"{output_prefix}_00001.mp4"
                    preview_image = Path(Config.COMFYUI_OUTPUT) / f"{output_prefix}_00001.png"

                    # 记录文件存在情况
                    chunk_files_info = []
                    for label, file_path in [
                        ("with_audio", chunk_with_audio),
                        ("without_audio", chunk_without_audio),
                        ("preview", preview_image)
                    ]:
                        if file_path.exists():
                            chunk_files_info.append(str(file_path.name))
                        else:
                            await self._add_log(
                                trace_id,
                                f"未找到子任务输出文件: {file_path}",
                                "warn",
                                {"label": label}
                            )

                    if chunk_with_audio.exists():
                        video_chunks_with_audio.append(str(chunk_with_audio))
                    if chunk_without_audio.exists():
                        video_chunks_without_audio.append(str(chunk_without_audio))
                    if preview_image.exists():
                        preview_frames.append(str(preview_image))

                    await self._add_log(trace_id, f"视频生成成功: {output_prefix}", "info", {
                        "output_files": chunk_files_info
                    })

                    # 发送任务完成事件
                    event_files = [
                        str(chunk_with_audio.name) if chunk_with_audio.exists() else None,
                        str(chunk_without_audio.name) if chunk_without_audio.exists() else None,
                        str(preview_image.name) if preview_image.exists() else None
                    ]
                    await self._send_websocket_message(
                        trace_id,
                        "task_complete",
                        self._serialize_event(TaskCompleteEvent(
                            task=task_info,
                            files=[f for f in event_files if f]
                        ))
                    )

                    # 只有在当前任务完全完成后，才考虑重启ComfyUI（除了最后一个任务）
                    if task_index < len(task_mappings) - 1:
                        await self._add_log(trace_id, f"任务 {task_index + 1} 完成，等待重启ComfyUI以清除显存...", "info")
                        # 给ComfyUI一点时间来完成清理
                        await asyncio.sleep(2)
                        restart_success = await self._restart_comfyui(trace_id)
                        if not restart_success:
                            await self._add_log(trace_id, "ComfyUI重启失败，继续执行但可能影响性能", "warn")
                    else:
                        await self._add_log(trace_id, "所有任务完成，无需重启ComfyUI", "info")

                except Exception as e:
                    await self._add_log(trace_id, f"视频生成失败: {str(e)}", "error", {
                        "error": str(e),
                        "task_index": task_index + 1
                    })

                    # 发送任务失败事件
                    await self._send_websocket_message(
                        trace_id,
                        "task_failed",
                    self._serialize_event(TaskFailedEvent(
                            task=task_info,
                            error=str(e)
                    ))
                    )

                # 更新进度
                progress = 0.2 + (task_index + 1) / total_tasks * 0.6
                await self._update_task_status(
                    trace_id,
                    progress=progress,
                    completed=task_index + 1
                )

            # 3. 视频拼接阶段
            await self._update_task_status(
                trace_id,
                stage=TaskStage.COMBINING,
                progress=0.8
            )

            await self._add_log(trace_id, "开始视频拼接阶段", "info", {
                "generated_videos_count": len(video_chunks_with_audio)
            })

            if not video_chunks_with_audio:
                raise Exception("未找到任何带音频的视频片段，无法合并最终视频")
            if not video_chunks_without_audio:
                raise Exception("未找到任何不带音频的视频片段，无法合并最终视频")

            # 准备最终视频输出目录
            final_output_dir = Path(Config.VIDEO_OUTPUT_DIR) / config.outputPrefix
            final_output_dir.mkdir(parents=True, exist_ok=True)

            # 合并视频
            final_video_with_audio = str(final_output_dir / f"{config.outputPrefix}-audio.mp4")
            await self._add_log(trace_id, f"开始合并视频: {Path(final_video_with_audio).name}", "info", {
                "output_path": final_video_with_audio,
                "include_audio": True
            })

            await self.audio_processor.combine_videos(
                video_chunks_with_audio,
                final_video_with_audio,
                include_audio=True
            )

            await self._add_log(trace_id, f"带音频视频合并完成: {Path(final_video_with_audio).name}", "info")

            # 合并视频（不带音频）
            final_video_no_audio = str(final_output_dir / f"{config.outputPrefix}.mp4")
            await self._add_log(trace_id, f"开始合并视频（不带音频）: {Path(final_video_no_audio).name}", "info", {
                "output_path": final_video_no_audio,
                "include_audio": False
            })

            await self.audio_processor.combine_videos(
                video_chunks_without_audio,
                final_video_no_audio,
                include_audio=False
            )

            await self._add_log(trace_id, f"不带音频视频合并完成: {Path(final_video_no_audio).name}", "info")

            # 清理子任务输出文件
            cleanup_files = set(video_chunks_with_audio + video_chunks_without_audio + preview_frames)
            deleted_files = []
            for file_path in cleanup_files:
                path_obj = Path(file_path)
                if path_obj.exists():
                    try:
                        path_obj.unlink()
                        deleted_files.append(path_obj.name)
                    except Exception as cleanup_error:
                        await self._add_log(
                            trace_id,
                            f"删除子任务文件失败: {path_obj}",
                            "warn",
                            {"error": str(cleanup_error)}
                        )

            if deleted_files:
                await self._add_log(trace_id, "已清理子任务输出文件", "info", {
                    "deleted_files": deleted_files
                })

            # 4. 任务完成
            await self._update_task_status(
                trace_id,
                stage=TaskStage.COMPLETED,
                progress=1.0,
                completed=total_tasks
            )

            await self._add_log(trace_id, "任务执行完成", "info", {
                "final_videos": [
                    str(Path(final_video_with_audio).name),
                    str(Path(final_video_no_audio).name)
                ]
            })

            # 发送批量完成事件
            await self._send_websocket_message(
                trace_id,
                "batch_complete",
                self._serialize_event(BatchCompleteEvent(
                    final_videos=[final_video_with_audio, final_video_no_audio]
                ))
            )

        except Exception as e:
            # 任务失败
            await self._add_log(trace_id, f"任务执行失败: {str(e)}", "error", {
                "error": str(e),
                "error_type": type(e).__name__
            })

            await self._update_task_status(
                trace_id,
                stage=TaskStage.FAILED,
                error=str(e)
            )

            await self._send_websocket_message(
                trace_id,
                "error",
                self._serialize_event(ErrorEvent(
                    message=str(e),
                    code="TASK_EXECUTION_ERROR"
                ))
            )

    async def _update_task_status(
        self,
        trace_id: str,
        stage: Optional[TaskStage] = None,
        progress: Optional[float] = None,
        completed: Optional[int] = None,
        total: Optional[int] = None,
        current_task: Optional[TaskInfo] = None,
        error: Optional[str] = None
    ):
        """更新任务状态并发送进度事件"""
        if trace_id not in self.active_tasks:
            return

        task_status = self.active_tasks[trace_id]

        if stage is not None:
            task_status.stage = stage
        if progress is not None:
            task_status.progress = progress
        if completed is not None:
            task_status.completed = completed
        if total is not None:
            task_status.total = total
        if current_task is not None:
            task_status.current_task = current_task
        if error is not None:
            task_status.error = error

        # 保存状态到文件
        await self._save_task_status(trace_id, task_status)

        # 发送进度事件
        progress_payload = ProgressEvent(
            stage=task_status.stage.value,
            progress=task_status.progress,
            current_task=task_status.current_task,
            completed=task_status.completed,
            total=task_status.total
        )
        await self._send_websocket_message(
            trace_id,
            "progress",
            self._serialize_event(progress_payload)
        )

    async def _save_task_status(self, trace_id: str, task_status: TaskStatus):
        """保存任务状态到文件"""
        status_file = f"{Config.TASK_STATUS}/{trace_id}.json"
        async with aiofiles.open(status_file, 'w', encoding='utf-8') as f:
            await f.write(task_status.model_dump_json(indent=2) if hasattr(task_status, 'model_dump_json') else json.dumps(task_status.dict(), indent=2, ensure_ascii=False))

    def _serialize_event(self, event_model):
        """兼容pydantic v1/v2的序列化"""
        if hasattr(event_model, "model_dump"):
            return event_model.model_dump()
        if hasattr(event_model, "dict"):
            return event_model.dict()
        raise TypeError(f"Unsupported event model type: {type(event_model)}")

    async def _send_websocket_message(self, trace_id: str, event: str, data: dict):
        """向所有连接的客户端发送 WebSocket 消息"""
        if trace_id not in self.ws_connections:
            return

        message = {
            "event": event,
            "data": data
        }

        # 发送消息到所有连接的WebSocket客户端
        disconnected_connections = []
        for websocket in self.ws_connections[trace_id]:
            try:
                # 检查WebSocket连接状态
                if hasattr(websocket, 'client_state') and websocket.client_state.name == 'CONNECTED':
                    await websocket.send_text(json.dumps(message))
                else:
                    # 标记为断开连接
                    disconnected_connections.append(websocket)
            except Exception as e:
                print(f"发送WebSocket消息失败: {e}")
                disconnected_connections.append(websocket)

        # 清理断开的连接
        for websocket in disconnected_connections:
            if websocket in self.ws_connections[trace_id]:
                self.ws_connections[trace_id].remove(websocket)

    def register_websocket_connection(self, trace_id: str, websocket):
        """注册 WebSocket 连接"""
        if trace_id not in self.ws_connections:
            self.ws_connections[trace_id] = []
        self.ws_connections[trace_id].append(websocket)

    def unregister_websocket_connection(self, trace_id: str, websocket):
        """注销 WebSocket 连接"""
        if trace_id in self.ws_connections:
            if websocket in self.ws_connections[trace_id]:
                self.ws_connections[trace_id].remove(websocket)

    def get_task_status(self, trace_id: str) -> Optional[TaskStatus]:
        """获取任务状态"""
        return self.active_tasks.get(trace_id)

    async def cleanup_task(self, trace_id: str):
        """清理任务资源"""
        if trace_id in self.active_tasks:
            del self.active_tasks[trace_id]
        if trace_id in self.ws_connections:
            del self.ws_connections[trace_id]

        # 删除状态文件
        status_file = f"{Config.TASK_STATUS}/{trace_id}.json"
        if Path(status_file).exists():
            Path(status_file).unlink()