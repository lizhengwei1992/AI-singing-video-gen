import json
import uuid
import websocket
import urllib.request
import urllib.parse
import requests
import re
from typing import Dict, Any, List
import asyncio
import aiofiles
import time
from pathlib import Path

from config import Config

class ComfyUIClient:
    def __init__(self):
        self.server_address = f"{Config.COMFYUI_HOST}:{Config.COMFYUI_PORT}"
        self.client_id = str(uuid.uuid4())

    def _log_info(self, message: str):
        """记录信息日志"""
        print(f"[ComfyUI Client INFO] {message}")

    def _log_warning(self, message: str):
        """记录警告日志"""
        print(f"[ComfyUI Client WARNING] {message}")

    def _log_error(self, message: str):
        """记录错误日志"""
        print(f"[ComfyUI Client ERROR] {message}")

    def queue_prompt(self, prompt: Dict[str, Any], prompt_id: str) -> str:
        """提交提示到 ComfyUI"""
        p = {"prompt": prompt, "client_id": self.client_id, "prompt_id": prompt_id}
        data = json.dumps(p).encode('utf-8')
        req = urllib.request.Request(f"http://{self.server_address}/prompt", data=data)
        response = urllib.request.urlopen(req).read()
        return response.decode('utf-8')

    def get_history(self, prompt_id: str) -> Dict[str, Any]:
        """获取提示执行历史"""
        with urllib.request.urlopen(f"http://{self.server_address}/history/{prompt_id}") as response:
            return json.loads(response.read())

    def get_image(self, filename: str, subfolder: str, folder_type: str) -> bytes:
        """获取生成的图像"""
        data = {"filename": filename, "subfolder": subfolder, "type": folder_type}
        url_values = urllib.parse.urlencode(data)
        with urllib.request.urlopen(f"http://{self.server_address}/view?{url_values}") as response:
            return response.read()

    async def execute_workflow(self, workflow: Dict[str, Any], timeout: int = 900) -> Dict[str, Any]:
        """
        执行工作流并等待完成
        当收到 executing 消息中 node 为 None 时，表示执行完成
        """
        return await asyncio.to_thread(self._execute_workflow_sync, workflow, timeout)

    def _execute_workflow_sync(self, workflow: Dict[str, Any], timeout: int) -> Dict[str, Any]:
        prompt_id = str(uuid.uuid4())

        # 提交提示
        self.queue_prompt(workflow, prompt_id)

        # 连接 WebSocket 监听执行状态
        ws = websocket.WebSocket()
        ws.connect(f"ws://{self.server_address}/ws?clientId={self.client_id}")

        output_files = {}
        start_time = time.monotonic()

        try:
            while True:
                # 检查超时
                if time.monotonic() - start_time > timeout:
                    raise TimeoutError(f"工作流执行超时 ({timeout/60}分钟)")

                out = ws.recv()
                if isinstance(out, str):
                    message = json.loads(out)

                    # 检测执行完成消息 - 当 executing 消息中 node 为 None 时，表示执行完成
                    if message['type'] == 'executing':
                        data = message['data']
                        if data['node'] is None and data['prompt_id'] == prompt_id:
                            # 执行完成，退出循环
                            self._log_info("工作流执行完成")
                            break

                    # 可选：检测 status 消息中的执行完成信息（用于日志记录）
                    elif message['type'] == 'status' and message.get('data'):
                        status_data = message['data']
                        if status_data.get('status') and 'Prompt executed in' in status_data['status']:
                            # 提取执行时间信息用于日志
                            match = re.search(r'Prompt executed in ([\d.]+) seconds', status_data['status'])
                            if match:
                                execution_time = float(match.group(1))
                                self._log_info(f"提示：检测到执行耗时: {execution_time}秒")

                else:
                    # 二进制数据（预览等），跳过
                    continue

        finally:
            ws.close()

        # 获取执行结果
        history = self.get_history(prompt_id)
        if prompt_id not in history:
            raise Exception(f"提示 {prompt_id} 未找到执行历史")

        prompt_history = history[prompt_id]

        # 收集输出文件
        for node_id in prompt_history['outputs']:
            node_output = prompt_history['outputs'][node_id]
            if 'images' in node_output:
                images_output = []
                for image in node_output['images']:
                    image_data = self.get_image(
                        image['filename'],
                        image['subfolder'],
                        image['type']
                    )
                    images_output.append({
                        'filename': image['filename'],
                        'data': image_data
                    })
                output_files[node_id] = images_output

        return output_files

    async def execute_video_generation(
        self,
        image_path: str,
        audio_path: str,
        output_prefix: str,
        prompt_text: str
    ) -> List[str]:
        """执行视频生成工作流"""
        # 加载单人单图工作流
        workflow_path = f"{Config.WORKFLOW_PATH}/singvideo.json"
        async with aiofiles.open(workflow_path, 'r', encoding='utf-8') as f:
            workflow_content = await f.read()

        workflow = json.loads(workflow_content)

        # 更新工作流参数
        # 设置图片路径
        workflow["61"]["inputs"]["image"] = image_path

        # 设置音频路径
        workflow["62"]["inputs"]["audio"] = audio_path

        # 设置输出文件名前缀
        workflow["67"]["inputs"]["filename_prefix"] = output_prefix

        # 设置提示文本
        workflow["52"]["inputs"]["text"] = prompt_text

        # 执行工作流
        result = await self.execute_workflow(workflow)

        # 返回生成的文件路径
        output_files = []
        for node_id, images in result.items():
            for image in images:
                output_files.append(image['filename'])

        return output_files

    async def execute_video_super_resolution(
        self,
        input_filename: str,
        output_prefix: str
    ) -> List[str]:
        """
        使用 SeedVR2 工作流对视频进行超分处理
        :param input_filename: 已放置到 ComfyUI input 目录的视频文件名
        :param output_prefix: 输出文件前缀（会在原文件名后添加 _sr）
        """
        workflow_path = f"{Config.WORKFLOW_PATH}/SeedVR2.json"
        async with aiofiles.open(workflow_path, 'r', encoding='utf-8') as f:
            workflow_content = await f.read()

        workflow = json.loads(workflow_content)

        # 设置输入视频文件名（ComfyUI 相对 input 目录）
        workflow["968"]["inputs"]["video"] = input_filename

        # 设置输出前缀为原始文件名 + _sr
        workflow["1082"]["inputs"]["filename_prefix"] = output_prefix

        await self.execute_workflow(workflow)

        # SeedVR2 工作流固定输出单个 mp4 文件，验证其存在性
        expected_video = Path(Config.COMFYUI_OUTPUT) / f"{output_prefix}_00001.mp4"
        if not expected_video.exists():
            raise FileNotFoundError(f"未在 ComfyUI 输出目录中找到超分结果: {expected_video}")

        return [str(expected_video)]