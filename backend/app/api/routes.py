import os
import uuid
import hashlib
import threading
import time
import subprocess
import asyncio
import functools
import websocket
import requests
from pathlib import Path
from fastapi import APIRouter, UploadFile, File, HTTPException, BackgroundTasks
from fastapi.responses import JSONResponse, FileResponse
import aiofiles

from app.models.schemas import (
    BatchSubmitRequest, BatchSubmitResponse, TaskMode, 
    VideoGenSubmitRequest, VideoGenSubmitResponse, VideoGenMode,
    ImageToPromptSubmitRequest, ImageToPromptSubmitResponse,
    ImageToStoryboardSubmitRequest, ImageToStoryboardSubmitResponse
)
from app.services.task_manager_instance import task_manager
from app.services.comfyui_client import ComfyUIClient
from config import Config

# 辅助函数：重启ComfyUI
async def _restart_comfyui():
    """重启ComfyUI服务"""
    async def _run_blocking(func, *args, **kwargs):
        loop = asyncio.get_running_loop()
        return await loop.run_in_executor(None, functools.partial(func, *args, **kwargs))
    
    def _test_ws_connection(client_id: str):
        """同步检查ComfyUI WebSocket连接"""
        test_ws = websocket.WebSocket()
        test_ws.connect(f"ws://127.0.0.1:8090/ws?clientId={client_id}", timeout=10)
        test_ws.close()
    
    try:
        # 查找并kill ComfyUI进程
        try:
            result = await _run_blocking(
                subprocess.run,
                ['lsof', '-ti', ':8090'],
                capture_output=True,
                text=True
            )
            if result.stdout.strip():
                pid = result.stdout.strip()
                await _run_blocking(subprocess.run, ['kill', '-9', pid], check=True)
                await asyncio.sleep(3)  # 等待进程完全终止
        except subprocess.CalledProcessError:
            pass
        
        # 启动ComfyUI
        cmd = f"tmux send-keys -t gen_video:1 'cd /home/lzw/project/ComfyUI && python main.py --port 8090 --listen' C-m"
        await _run_blocking(subprocess.run, cmd, shell=True, check=True)
        
        # 等待服务启动
        max_retries = 60
        for i in range(max_retries):
            try:
                response = await _run_blocking(
                    requests.get,
                    f"http://127.0.0.1:8090/system_stats",
                    timeout=10
                )
                if response.status_code == 200:
                    try:
                        await _run_blocking(_test_ws_connection, f"test_{i}")
                        await asyncio.sleep(5)  # 等待服务完全就绪
                        return True
                    except Exception:
                        pass
            except Exception:
                pass
            await asyncio.sleep(3)
        
        return False
    except Exception as e:
        print(f"重启ComfyUI失败: {str(e)}")
        return False

router = APIRouter()

# 文件上传锁机制 - 防止重复上传相同文件
file_upload_locks = {}
locks_lock = threading.Lock()

@router.post("/upload")
async def upload_file(file: UploadFile = File(...)):
    """文件上传接口 - 增加并发控制防止重复上传"""
    # 验证文件类型
    if file.content_type.startswith('image/'):
        if file.content_type not in Config.ALLOWED_IMAGE_TYPES:
            raise HTTPException(
                status_code=400,
                detail=f"不支持的图片格式: {file.content_type}"
            )
        upload_dir = f"{Config.COMFYUI_INPUT}/uploaded_images"
    elif file.content_type.startswith('audio/'):
        if file.content_type not in Config.ALLOWED_AUDIO_TYPES:
            raise HTTPException(
                status_code=400,
                detail=f"不支持的音频格式: {file.content_type}"
            )
        upload_dir = f"{Config.COMFYUI_INPUT}/uploaded_audios"
    elif file.content_type.startswith('video/'):
        if file.content_type not in Config.ALLOWED_VIDEO_TYPES:
            raise HTTPException(
                status_code=400,
                detail=f"不支持的视频格式: {file.content_type}"
            )
        upload_dir = f"{Config.COMFYUI_INPUT}/uploaded_videos"
    else:
        raise HTTPException(
            status_code=400,
            detail="不支持的文件类型"
        )

    # 确保上传目录存在
    os.makedirs(upload_dir, exist_ok=True)

    # 计算文件哈希值用于去重
    file_hash = hashlib.md5()
    file_size = 0
    chunk_size = 8192

    # 先读取文件计算哈希值
    file_content = bytearray()
    while True:
        chunk = await file.read(chunk_size)
        if not chunk:
            break
        file_hash.update(chunk)
        file_size += len(chunk)
        file_content.extend(chunk)
        if file_size > Config.MAX_FILE_SIZE:
            raise HTTPException(
                status_code=400,
                detail="文件大小超过限制"
            )

    # 获取文件哈希值
    file_hash_str = file_hash.hexdigest()

    # 使用文件哈希作为锁的键，防止相同文件并发上传
    with locks_lock:
        if file_hash_str in file_upload_locks:
            # 如果该文件正在上传，等待完成
            return JSONResponse({
                "message": "相同文件正在上传中，请稍候",
                "file_path": "",
                "filename": "",
                "duplicate": True,
                "status": "processing"
            })
        # 获取该文件的上传锁
        file_upload_locks[file_hash_str] = threading.Lock()

    file_lock = file_upload_locks[file_hash_str]

    try:
        with file_lock:
            # 再次检查是否已存在相同内容的文件（双重检查）
            existing_file_path = None
            if os.path.exists(upload_dir):
                for existing_file in os.listdir(upload_dir):
                    existing_file_full_path = os.path.join(upload_dir, existing_file)
                    if os.path.isfile(existing_file_full_path):
                        # 计算现有文件的哈希值
                        existing_hash = hashlib.md5()
                        try:
                            with open(existing_file_full_path, 'rb') as f:
                                while True:
                                    chunk = f.read(chunk_size)
                                    if not chunk:
                                        break
                                    existing_hash.update(chunk)

                            if existing_hash.hexdigest() == file_hash_str:
                                existing_file_path = existing_file_full_path
                                break
                        except Exception:
                            # 如果无法读取现有文件，跳过该文件
                            continue

            # 如果已存在相同内容的文件，直接返回现有文件路径
            if existing_file_path:
                return JSONResponse({
                    "message": "文件已存在，跳过上传",
                    "file_path": existing_file_path,
                    "filename": os.path.basename(existing_file_path),
                    "duplicate": True
                })

            # 生成文件名（保持原文件名，避免重复上传问题）
            file_ext = os.path.splitext(file.filename)[1]
            # 如果文件名已存在，添加数字后缀
            base_name = os.path.splitext(file.filename)[0]
            counter = 1
            unique_filename = f"{base_name}{file_ext}"
            file_path = os.path.join(upload_dir, unique_filename)

            # 检查文件是否已存在，如果存在则添加数字后缀
            while os.path.exists(file_path):
                unique_filename = f"{base_name}_{counter}{file_ext}"
                file_path = os.path.join(upload_dir, unique_filename)
                counter += 1

            # 保存文件
            try:
                async with aiofiles.open(file_path, 'wb') as f:
                    await f.write(file_content)
            except Exception as e:
                raise HTTPException(
                    status_code=500,
                    detail=f"文件保存失败: {str(e)}"
                )

            return JSONResponse({
                "message": "文件上传成功",
                "file_path": file_path,
                "filename": unique_filename,
                "duplicate": False
            })

    finally:
        # 清理文件锁
        with locks_lock:
            if file_hash_str in file_upload_locks:
                del file_upload_locks[file_hash_str]

@router.post("/batch/submit")
async def submit_batch_task(request: BatchSubmitRequest):
    """提交批量处理任务"""
    try:
        mode = request.config.mode

        # 生成+超分模式：必须提供图片和音频
        if mode == TaskMode.GENERATE_AND_UPSCALE:
            if not request.images:
                raise HTTPException(
                    status_code=400,
                    detail="生成模式下必须至少提供一张图片"
                )
            if not request.audios:
                raise HTTPException(
                    status_code=400,
                    detail="生成模式下必须至少提供一个音频"
                )

            # 验证文件存在
            for image_path in request.images:
                if not os.path.exists(image_path):
                    raise HTTPException(
                        status_code=400,
                        detail=f"图片文件不存在: {image_path}"
                    )

            for audio_path in request.audios:
                if not os.path.exists(audio_path):
                    raise HTTPException(
                        status_code=400,
                        detail=f"音频文件不存在: {audio_path}"
                    )

        # 仅超分模式：只校验输入视频
        elif mode == TaskMode.UPSCALE_ONLY:
            if not request.config.srInputVideo:
                raise HTTPException(
                    status_code=400,
                    detail="仅超分模式下必须提供 srInputVideo"
                )
            if not os.path.exists(request.config.srInputVideo):
                raise HTTPException(
                    status_code=400,
                    detail=f"输入视频文件不存在: {request.config.srInputVideo}"
                )

        # 创建任务
        trace_id = await task_manager.create_task(
            images=request.images,
            audios=request.audios,
            config=request.config
        )

        return BatchSubmitResponse(
            trace_id=trace_id,
            ws_url=f"ws://localhost:8000/ws/{trace_id}"
        )

    except Exception as e:
        print(f"任务提交错误: {str(e)}")
        raise HTTPException(
            status_code=500,
            detail=f"任务提交失败: {str(e)}"
        )

@router.get("/batch/status/{trace_id}")
async def get_task_status(trace_id: str):
    """获取任务状态"""
    task_status = task_manager.get_task_status(trace_id)
    if not task_status:
        raise HTTPException(
            status_code=404,
            detail="任务不存在"
        )

    return task_status

@router.delete("/batch/tasks/{trace_id}")
async def delete_task(trace_id: str):
    """删除任务"""
    try:
        # 清理任务资源
        await task_manager.cleanup_task(trace_id)
        return {"message": "任务删除成功", "trace_id": trace_id}
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"任务删除失败: {str(e)}"
        )

@router.get("/batch/all-tasks")
async def get_all_tasks():
    """获取所有任务状态 - 从项目根目录的task_status读取"""
    import os
    import json
    from pathlib import Path
    from config import Config

    # 使用Config中配置的task_status路径
    task_status_dir = Path(Config.TASK_STATUS)
    all_tasks = []

    print(f"正在读取任务状态目录: {task_status_dir}")

    if task_status_dir.exists():
        print(f"找到任务状态目录，包含 {len(list(task_status_dir.glob('*.json')))} 个任务文件")
        for status_file in task_status_dir.glob("*.json"):
            try:
                with open(status_file, 'r', encoding='utf-8') as f:
                    task_data = json.load(f)
                    # 返回所有任务状态（包括已完成和失败的）
                    all_tasks.append(task_data)
                    print(f"成功读取任务: {task_data.get('trace_id', 'unknown')}")
            except Exception as e:
                print(f"读取任务状态文件失败 {status_file}: {e}")
    else:
        print(f"任务状态目录不存在: {task_status_dir}")
        # 如果目录不存在，尝试创建它
        try:
            task_status_dir.mkdir(parents=True, exist_ok=True)
            print(f"已创建任务状态目录: {task_status_dir}")
        except Exception as e:
            print(f"创建任务状态目录失败: {e}")

    return {"tasks": all_tasks}

@router.get("/health")
async def health_check():
    """健康检查"""
    return {"status": "healthy", "service": "wanvideo-backend"}

@router.get("/files/images")
async def get_images():
    """获取所有上传的图片文件"""
    images_dir = Path(f"{Config.COMFYUI_INPUT}/uploaded_images")
    images = []

    if images_dir.exists():
        for file_path in images_dir.glob("*"):
            if file_path.is_file() and file_path.suffix.lower() in ['.png', '.jpg', '.jpeg', '.gif', '.bmp']:
                images.append({
                    "filename": file_path.name,
                    "path": str(file_path),
                    "size": file_path.stat().st_size,
                    "modified": file_path.stat().st_mtime
                })

    # 按修改时间排序，最新的在前
    images.sort(key=lambda x: x["modified"], reverse=True)
    return {"images": images}

@router.get("/files/audios")
async def get_audios():
    """获取所有上传的音频文件"""
    audios_dir = Path(f"{Config.COMFYUI_INPUT}/uploaded_audios")
    audios = []

    if audios_dir.exists():
        for file_path in audios_dir.glob("*"):
            if file_path.is_file() and file_path.suffix.lower() in ['.mp3', '.wav', '.m4a', '.flac', '.aac']:
                audios.append({
                    "filename": file_path.name,
                    "path": str(file_path),
                    "size": file_path.stat().st_size,
                    "modified": file_path.stat().st_mtime
                })

    # 按修改时间排序，最新的在前
    audios.sort(key=lambda x: x["modified"], reverse=True)
    return {"audios": audios}


@router.get("/files/videos")
async def get_videos():
    """获取所有上传的视频文件（用于仅超分模式）"""
    videos_dir = Path(f"{Config.COMFYUI_INPUT}/uploaded_videos")
    videos = []

    if videos_dir.exists():
        for file_path in videos_dir.glob("*"):
            if file_path.is_file() and file_path.suffix.lower() in ['.mp4', '.mkv', '.mov']:
                videos.append({
                    "filename": file_path.name,
                    "path": str(file_path),
                    "size": file_path.stat().st_size,
                    "modified": file_path.stat().st_mtime
                })

    videos.sort(key=lambda x: x["modified"], reverse=True)
    return {"videos": videos}

@router.delete("/files/{file_type}/{filename}")
async def delete_file(file_type: str, filename: str):
    """删除文件"""
    if file_type not in ["images", "audios", "videos"]:
        raise HTTPException(status_code=400, detail="无效的文件类型")

    if ".." in filename or "/" in filename or "\\" in filename:
        raise HTTPException(status_code=400, detail="无效的文件名")

    file_dir = Path(f"{Config.COMFYUI_INPUT}/uploaded_{file_type}")
    file_path = file_dir / filename

    if not file_path.exists():
        raise HTTPException(status_code=404, detail="文件不存在")

    if not file_path.is_file():
        raise HTTPException(status_code=400, detail="不是有效的文件")

    try:
        file_path.unlink()
        return {"message": "文件删除成功", "filename": filename}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"文件删除失败: {str(e)}")

@router.get("/files/{file_type}/{filename}")
async def get_file(file_type: str, filename: str):
    """获取文件（用于图片预览）"""
    if file_type not in ["images", "audios", "videos"]:
        raise HTTPException(status_code=400, detail="无效的文件类型")

    if ".." in filename or "/" in filename or "\\" in filename:
        raise HTTPException(status_code=400, detail="无效的文件名")

    file_dir = Path(f"{Config.COMFYUI_INPUT}/uploaded_{file_type}")
    file_path = file_dir / filename

    if not file_path.exists() or not file_path.is_file():
        raise HTTPException(status_code=404, detail="文件不存在")

    return FileResponse(file_path)


@router.get("/videos/{output_prefix}/{filename}")
async def download_video(output_prefix: str, filename: str):
    """下载最终生成/超分后的视频文件"""
    if ".." in output_prefix or "/" in output_prefix or "\\" in output_prefix:
        raise HTTPException(status_code=400, detail="无效的输出前缀")
    if ".." in filename or "/" in filename or "\\" in filename:
        raise HTTPException(status_code=400, detail="无效的文件名")

    video_dir = Path(Config.VIDEO_OUTPUT_DIR) / output_prefix
    file_path = video_dir / filename

    if not file_path.exists() or not file_path.is_file():
        raise HTTPException(status_code=404, detail="视频文件不存在")

    return FileResponse(
        file_path,
        media_type="video/mp4",
        filename=filename
    )

@router.get("/video-gen/videos/{output_name}")
async def get_video_gen_video(output_name: str):
    """获取video-gen生成的视频文件"""
    if ".." in output_name or "/" in output_name or "\\" in output_name:
        raise HTTPException(status_code=400, detail="无效的输出名称")
    
    # 查找ComfyUI output目录中的视频文件
    output_dir = Path(Config.COMFYUI_OUTPUT)
    video_files = []
    
    # 查找匹配的视频文件
    for pattern in [f"{output_name}_00001.mp4", f"{output_name}_sr_00001.mp4"]:
        video_path = output_dir / pattern
        if video_path.exists() and video_path.is_file():
            video_files.append({
                "filename": pattern,
                "path": str(video_path),
                "size": video_path.stat().st_size,
                "modified": video_path.stat().st_mtime
            })
    
    return {"videos": video_files}

@router.get("/video-gen/videos/{output_name}/{filename}")
async def download_video_gen_video(output_name: str, filename: str):
    """下载video-gen生成的视频文件"""
    if ".." in output_name or "/" in output_name or "\\" in output_name:
        raise HTTPException(status_code=400, detail="无效的输出名称")
    if ".." in filename or "/" in filename or "\\" in filename:
        raise HTTPException(status_code=400, detail="无效的文件名")
    
    video_path = Path(Config.COMFYUI_OUTPUT) / filename
    
    if not video_path.exists() or not video_path.is_file():
        raise HTTPException(status_code=404, detail="视频文件不存在")
    
    return FileResponse(
        video_path,
        media_type="video/mp4",
        filename=filename
    )

@router.post("/video-gen/submit")
async def submit_video_gen_task(request: VideoGenSubmitRequest):
    """提交视频生成任务（单图生视频或首尾帧生视频）"""
    try:
        # 验证输入文件
        if request.mode == VideoGenMode.SINGLE_IMAGE:
            if not request.singleImage:
                raise HTTPException(
                    status_code=400,
                    detail="单图生视频模式必须提供singleImage"
                )
            if not os.path.exists(request.singleImage):
                raise HTTPException(
                    status_code=400,
                    detail=f"图片文件不存在: {request.singleImage}"
                )
        elif request.mode == VideoGenMode.FIRST_LAST_FRAME:
            if not request.firstFrameImage or not request.lastFrameImage:
                raise HTTPException(
                    status_code=400,
                    detail="首尾帧生视频模式必须提供firstFrameImage和lastFrameImage"
                )
            if not os.path.exists(request.firstFrameImage):
                raise HTTPException(
                    status_code=400,
                    detail=f"首帧图片文件不存在: {request.firstFrameImage}"
                )
            if not os.path.exists(request.lastFrameImage):
                raise HTTPException(
                    status_code=400,
                    detail=f"尾帧图片文件不存在: {request.lastFrameImage}"
                )

        # 生成任务ID
        trace_id = str(uuid.uuid4())

        # 获取图片文件名（相对于ComfyUI input目录）
        if request.mode == VideoGenMode.SINGLE_IMAGE:
            # 从完整路径中提取文件名
            image_filename = os.path.basename(request.singleImage)
            # 如果路径包含uploaded_images，则使用相对路径
            if "uploaded_images" in request.singleImage:
                image_filename = f"uploaded_images/{image_filename}"
        else:
            first_frame_filename = os.path.basename(request.firstFrameImage)
            last_frame_filename = os.path.basename(request.lastFrameImage)
            if "uploaded_images" in request.firstFrameImage:
                first_frame_filename = f"uploaded_images/{first_frame_filename}"
            if "uploaded_images" in request.lastFrameImage:
                last_frame_filename = f"uploaded_images/{last_frame_filename}"

        # 创建ComfyUI客户端并执行工作流
        client = ComfyUIClient()

        if request.mode == VideoGenMode.SINGLE_IMAGE:
            # 执行单图生视频
            output_files = await client.execute_single_image_to_video(
                image_path=image_filename,
                output_prefix=request.outputName,
                positive_prompt=request.positivePrompt,
                negative_prompt=request.negativePrompt,
                video_length=request.videoLength
            )
        else:
            # 执行首尾帧生视频
            output_files = await client.execute_first_last_frame_to_video(
                first_frame_path=first_frame_filename,
                last_frame_path=last_frame_filename,
                output_prefix=request.outputName,
                positive_prompt=request.positivePrompt,
                negative_prompt=request.negativePrompt,
                video_length=request.videoLength
            )

        # 如果需要超分，执行超分处理
        final_output_name = request.outputName
        if request.needUpscale and output_files:
            # 获取生成的视频文件
            generated_video_path = output_files[0]
            video_filename = os.path.basename(generated_video_path)
            
            # 将生成的视频复制到input目录以便超分
            input_video_dir = Path(Config.COMFYUI_INPUT) / "uploaded_videos"
            input_video_dir.mkdir(parents=True, exist_ok=True)
            input_video_path = input_video_dir / video_filename
            
            # 复制文件
            import shutil
            shutil.copy2(generated_video_path, input_video_path)
            
            # 执行超分（使用相对路径）
            final_output_name = f"{request.outputName}_sr"
            sr_output_files = await client.execute_video_super_resolution(
                input_filename=f"uploaded_videos/{video_filename}",
                output_prefix=final_output_name
            )
            output_files = sr_output_files

        # 保存任务状态
        from app.models.schemas import TaskStatus, TaskStage, TaskLog
        from datetime import datetime
        import json
        
        task_status = TaskStatus(
            trace_id=trace_id,
            stage=TaskStage.COMPLETED,
            progress=1.0,
            completed=1,
            total=1,
            output_prefix=final_output_name,
            output_name=final_output_name,  # video-gen任务的输出名称
            mode=TaskMode.GENERATE_AND_UPSCALE,  # 使用现有枚举，但通过output_name区分
            logs=[
                TaskLog(
                    timestamp=datetime.now().isoformat(),
                    level="info",
                    message="视频生成任务完成",
                    details={"output_files": [os.path.basename(f) for f in output_files]}
                )
            ]
        )
        
        # 保存任务状态到文件
        task_status_dir = Path(Config.TASK_STATUS)
        task_status_dir.mkdir(parents=True, exist_ok=True)
        task_status_file = task_status_dir / f"{trace_id}.json"
        with open(task_status_file, 'w', encoding='utf-8') as f:
            json.dump(task_status.dict(), f, ensure_ascii=False, indent=2)

        return VideoGenSubmitResponse(
            trace_id=trace_id,
            message="视频生成任务提交成功"
        )

    except Exception as e:
        print(f"视频生成任务提交错误: {str(e)}")
        raise HTTPException(
            status_code=500,
            detail=f"任务提交失败: {str(e)}"
        )

@router.post("/image-gen/image-to-prompt")
async def submit_image_to_prompt_task(request: ImageToPromptSubmitRequest):
    """提交图生提示词任务"""
    try:
        # 验证输入文件
        if not request.image:
            raise HTTPException(status_code=400, detail="必须提供图片路径")
        if not os.path.exists(request.image):
            raise HTTPException(status_code=400, detail=f"图片文件不存在: {request.image}")
        
        # 获取图片文件名（相对于ComfyUI input目录）
        image_filename = os.path.basename(request.image)
        if "uploaded_images" in request.image:
            image_filename = f"uploaded_images/{image_filename}"
        
        # 创建ComfyUI客户端并执行工作流
        client = ComfyUIClient()
        
        # 执行图生提示词
        generated_prompt = await client.execute_image_to_prompt(
            image_path=image_filename,
            prompt=request.prompt
        )
        
        # 重启ComfyUI
        await _restart_comfyui()
        
        return ImageToPromptSubmitResponse(generated_prompt=generated_prompt)
    
    except Exception as e:
        print(f"图生提示词任务提交错误: {str(e)}")
        raise HTTPException(
            status_code=500,
            detail=f"任务提交失败: {str(e)}"
        )

@router.post("/image-gen/image-to-storyboard")
async def submit_image_to_storyboard_task(request: ImageToStoryboardSubmitRequest):
    """提交单图根据提示词生成分镜任务"""
    try:
        # 验证输入文件
        if not request.image:
            raise HTTPException(status_code=400, detail="必须提供图片路径")
        if not os.path.exists(request.image):
            raise HTTPException(status_code=400, detail=f"图片文件不存在: {request.image}")
        
        # 获取图片文件名（相对于ComfyUI input目录）
        image_filename = os.path.basename(request.image)
        if "uploaded_images" in request.image:
            image_filename = f"uploaded_images/{image_filename}"
        
        # 创建ComfyUI客户端并执行工作流
        client = ComfyUIClient()
        
        # 执行单图根据提示词生成分镜
        output_files = await client.execute_image_to_storyboard(
            image_path=image_filename,
            prompt=request.prompt,
            output_filename=request.outputFilename
        )
        
        # 重启ComfyUI
        await _restart_comfyui()
        
        # 只返回文件名，不返回完整路径
        output_filenames = [os.path.basename(f) for f in output_files]
        
        return ImageToStoryboardSubmitResponse(output_files=output_filenames)
    
    except Exception as e:
        print(f"单图生成分镜任务提交错误: {str(e)}")
        raise HTTPException(
            status_code=500,
            detail=f"任务提交失败: {str(e)}"
        )

@router.get("/image-gen/output/{filename}")
async def get_image_gen_output(filename: str):
    """获取image-gen生成的图片文件"""
    if ".." in filename or "/" in filename or "\\" in filename:
        raise HTTPException(status_code=400, detail="无效的文件名")
    
    image_path = Path(Config.COMFYUI_OUTPUT) / filename
    
    if not image_path.exists() or not image_path.is_file():
        raise HTTPException(status_code=404, detail="图片文件不存在")
    
    return FileResponse(image_path)