import { WebSocketEvents } from '../types'

export class WebSocketClient {
  private socket: WebSocket | null = null
  private listeners: Map<string, Function[]> = new Map()
  private reconnectTimer: NodeJS.Timeout | null = null
  private traceId: string = ''

  connect(traceId: string): void {
    this.traceId = traceId

    if (this.socket?.readyState === WebSocket.OPEN) {
      this.socket.close()
    }

    // 使用原生WebSocket连接
    this.socket = new WebSocket(`ws://localhost:8000/ws/${traceId}`)

    this.socket.onopen = () => {
      console.log('WebSocket 连接成功')
      this.emit('connection', { trace_id: traceId })
    }

    this.socket.onclose = (event) => {
      console.log('WebSocket 断开连接:', event.reason)
      this.emit('disconnect', { reason: event.reason })

      // 自动重连机制
      if (this.reconnectTimer) {
        clearTimeout(this.reconnectTimer)
      }
      this.reconnectTimer = setTimeout(() => {
        console.log('尝试重新连接WebSocket...')
        this.connect(traceId)
      }, 3000)
    }

    this.socket.onerror = (error) => {
      console.error('WebSocket 错误:', error)
      this.emit('error', { message: 'WebSocket连接错误' })
    }

    this.socket.onmessage = (event) => {
      try {
        const message = JSON.parse(event.data)
        const { event: eventName, data } = message

        if (eventName) {
          this.emit(eventName as keyof WebSocketEvents, data)
        }
      } catch (error) {
        console.error('解析WebSocket消息失败:', error)
      }
    }
  }

  disconnect(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer)
      this.reconnectTimer = null
    }

    if (this.socket) {
      this.socket.close()
      this.socket = null
    }
  }

  on<K extends keyof WebSocketEvents>(
    event: K,
    callback: (data: WebSocketEvents[K]) => void
  ): void {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, [])
    }
    this.listeners.get(event)?.push(callback)
  }

  off<K extends keyof WebSocketEvents>(
    event: K,
    callback: (data: WebSocketEvents[K]) => void
  ): void {
    const eventListeners = this.listeners.get(event)
    if (eventListeners) {
      const index = eventListeners.indexOf(callback)
      if (index > -1) {
        eventListeners.splice(index, 1)
      }
    }
  }

  private emit<K extends keyof WebSocketEvents>(
    event: K,
    data: WebSocketEvents[K]
  ): void {
    const eventListeners = this.listeners.get(event)
    if (eventListeners) {
      eventListeners.forEach(callback => {
        try {
          callback(data)
        } catch (error) {
          console.error(`Error in ${event} listener:`, error)
        }
      })
    }
  }

  isConnected(): boolean {
    return this.socket?.readyState === WebSocket.OPEN
  }
}