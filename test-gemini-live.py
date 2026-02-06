#!/usr/bin/env python3
"""
Gemini Live API 测试脚本 (简化版)
用于验证 API 是否正常工作

安装依赖:
pip install google-genai pyaudio

运行:
export GEMINI_API_KEY=your_api_key
python test-gemini-live.py
"""

import os
import asyncio
import pyaudio
from google import genai
from google.genai import types

# 音频配置
FORMAT = pyaudio.paInt16
CHANNELS = 1
SEND_SAMPLE_RATE = 16000
RECEIVE_SAMPLE_RATE = 24000
CHUNK_SIZE = 1024

# Gemini 配置
MODEL = "models/gemini-2.5-flash-native-audio-preview-09-2025"

# 初始化客户端
client = genai.Client(
    http_options={"api_version": "v1beta"},
    api_key=os.environ.get("GEMINI_API_KEY"),
)

CONFIG = types.LiveConnectConfig(
    response_modalities=["AUDIO"],
    media_resolution="MEDIA_RESOLUTION_MEDIUM",
    speech_config=types.SpeechConfig(
        voice_config=types.VoiceConfig(
            prebuilt_voice_config=types.PrebuiltVoiceConfig(voice_name="Achird")
        )
    ),
)

pya = pyaudio.PyAudio()


class SimpleLiveTest:
    def __init__(self):
        self.audio_in_queue = None
        self.out_queue = None
        self.session = None
        self.audio_stream = None
        self.is_recording = False

    async def listen_audio(self):
        """从麦克风读取音频并发送到队列"""
        mic_info = pya.get_default_input_device_info()
        self.audio_stream = await asyncio.to_thread(
            pya.open,
            format=FORMAT,
            channels=CHANNELS,
            rate=SEND_SAMPLE_RATE,
            input=True,
            input_device_index=mic_info["index"],
            frames_per_buffer=CHUNK_SIZE,
        )

        print("🎤 麦克风已就绪，开始录音...")

        while self.is_recording:
            try:
                data = await asyncio.to_thread(
                    self.audio_stream.read,
                    CHUNK_SIZE,
                    exception_on_overflow=False
                )
                await self.out_queue.put({"data": data, "mime_type": "audio/pcm"})
            except Exception as e:
                print(f"❌ 读取音频错误: {e}")
                break

    async def send_realtime(self):
        """从队列读取数据并发送给 Gemini"""
        while True:
            msg = await self.out_queue.get()
            try:
                await self.session.send(input=msg)
            except Exception as e:
                print(f"❌ 发送数据错误: {e}")

    async def receive_audio(self):
        """接收 Gemini 的响应"""
        while True:
            try:
                turn = self.session.receive()
                async for response in turn:
                    if data := response.data:
                        # 收到音频数据
                        self.audio_in_queue.put_nowait(data)
                    if text := response.text:
                        # 收到文本数据
                        print(f"💬 AI: {text}")

                print("✅ AI 回复完成")

                # 清空音频队列 (用于支持打断)
                while not self.audio_in_queue.empty():
                    self.audio_in_queue.get_nowait()

            except Exception as e:
                print(f"❌ 接收响应错误: {e}")
                break

    async def play_audio(self):
        """播放接收到的音频"""
        stream = await asyncio.to_thread(
            pya.open,
            format=FORMAT,
            channels=CHANNELS,
            rate=RECEIVE_SAMPLE_RATE,
            output=True,
        )

        print("🔊 音频播放器已就绪")

        while True:
            try:
                bytestream = await self.audio_in_queue.get()
                await asyncio.to_thread(stream.write, bytestream)
            except Exception as e:
                print(f"❌ 播放音频错误: {e}")

    async def handle_user_input(self):
        """处理用户交互"""
        print("\n" + "="*50)
        print("Gemini Live API 测试")
        print("="*50)
        print("命令:")
        print("  r - 开始录音")
        print("  s - 停止录音并等待 AI 回复")
        print("  q - 退出")
        print("="*50 + "\n")

        while True:
            command = await asyncio.to_thread(input, "\n命令 > ")
            command = command.strip().lower()

            if command == "q":
                print("👋 退出中...")
                raise asyncio.CancelledError("用户请求退出")

            elif command == "r":
                if not self.is_recording:
                    self.is_recording = True
                    print("🔴 开始录音... (输入 's' 停止)")
                else:
                    print("⚠️ 已经在录音中")

            elif command == "s":
                if self.is_recording:
                    self.is_recording = False
                    print("⏹️ 停止录音，等待 AI 回复...")
                    # 发送 end_of_turn 信号
                    await self.session.send(input="", end_of_turn=True)
                else:
                    print("⚠️ 当前没有录音")

            else:
                print(f"❌ 未知命令: {command}")

    async def run(self):
        """主运行函数"""
        try:
            print("🔗 正在连接到 Gemini Live API...")

            async with (
                client.aio.live.connect(model=MODEL, config=CONFIG) as session,
                asyncio.TaskGroup() as tg,
            ):
                self.session = session
                print("✅ 已连接到 Gemini Live API")

                # 初始化队列
                self.audio_in_queue = asyncio.Queue()
                self.out_queue = asyncio.Queue(maxsize=50)

                # 启动所有任务
                user_input_task = tg.create_task(self.handle_user_input())
                tg.create_task(self.send_realtime())
                tg.create_task(self.listen_audio())
                tg.create_task(self.receive_audio())
                tg.create_task(self.play_audio())

                # 等待用户退出
                await user_input_task

        except asyncio.CancelledError:
            print("\n✅ 清理资源...")
            if self.audio_stream:
                self.audio_stream.close()
        except Exception as e:
            print(f"\n❌ 错误: {e}")
            import traceback
            traceback.print_exc()
        finally:
            print("👋 再见!")


if __name__ == "__main__":
    # 检查 API Key
    if not os.environ.get("GEMINI_API_KEY"):
        print("❌ 错误: 请设置环境变量 GEMINI_API_KEY")
        print("   export GEMINI_API_KEY=your_api_key")
        exit(1)

    # 运行测试
    test = SimpleLiveTest()
    asyncio.run(test.run())
