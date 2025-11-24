import asyncio
import os
import uuid
from pathlib import Path
import subprocess
from typing import List

import aiofiles

from config import Config

class AudioProcessor:
    @staticmethod
    async def split_audio(
        audio_path: str,
        segment_duration: int = 30,
        output_prefix: str = "segment"
    ) -> List[str]:
        """
        使用 FFmpeg 分割音频文件

        Args:
            audio_path: 音频文件路径
            segment_duration: 分割时长（秒）
            output_prefix: 输出文件前缀

        Returns:
            分割后的音频文件路径列表
        """
        output_dir = f"{Config.COMFYUI_INPUT}/temp_segments"
        Path(output_dir).mkdir(parents=True, exist_ok=True)

        # 生成唯一的输出前缀
        unique_prefix = f"{output_prefix}_{uuid.uuid4().hex[:8]}"

        # 构建 FFmpeg 命令
        cmd = [
            'ffmpeg',
            '-i', audio_path,
            '-f', 'segment',
            '-segment_time', str(segment_duration),
            '-c', 'copy',
            '-reset_timestamps', '1',
            '-map', '0:a',
            f"{output_dir}/{unique_prefix}_%03d.mp3"
        ]

        # 执行 FFmpeg 命令
        process = await asyncio.create_subprocess_exec(
            *cmd,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE
        )

        stdout, stderr = await process.communicate()

        if process.returncode != 0:
            raise Exception(f"音频分割失败: {stderr.decode()}")

        # 获取生成的音频片段文件
        segment_files = []
        for file_path in Path(output_dir).glob(f"{unique_prefix}_*.mp3"):
            segment_files.append(str(file_path))

        # 按文件名排序
        segment_files.sort()

        return segment_files

    @staticmethod
    async def get_audio_duration(audio_path: str) -> float:
        """获取音频文件时长（秒）"""
        cmd = [
            'ffprobe',
            '-v', 'error',
            '-show_entries', 'format=duration',
            '-of', 'default=noprint_wrappers=1:nokey=1',
            audio_path
        ]

        process = await asyncio.create_subprocess_exec(
            *cmd,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE
        )

        stdout, stderr = await process.communicate()

        if process.returncode != 0:
            raise Exception(f"获取音频时长失败: {stderr.decode()}")

        return float(stdout.decode().strip())

    @staticmethod
    async def combine_videos(
        video_files: List[str],
        output_path: str,
        include_audio: bool = True
    ) -> str:
        """
        合并多个视频文件

        Args:
            video_files: 视频文件路径列表
            output_path: 输出文件路径
            include_audio: 是否包含音频

        Returns:
            合并后的视频文件路径
        """
        if not video_files:
            raise ValueError("没有视频文件可合并")

        # 创建文件列表
        list_file = f"{Config.TEMP_FILES}/concat_list.txt"
        async with aiofiles.open(list_file, 'w') as f:
            for video_file in video_files:
                await f.write(f"file '{video_file}'\n")

        # 构建 FFmpeg 命令
        cmd = [
            'ffmpeg',
            '-f', 'concat',
            '-safe', '0',
            '-i', list_file,
            '-c', 'copy'
        ]

        if not include_audio:
            cmd.extend(['-an'])

        cmd.append(output_path)

        # 执行 FFmpeg 命令
        process = await asyncio.create_subprocess_exec(
            *cmd,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE
        )

        stdout, stderr = await process.communicate()

        if process.returncode != 0:
            raise Exception(f"视频合并失败: {stderr.decode()}")

        # 清理临时文件
        os.remove(list_file)

        return output_path