import React, { useState, useEffect } from 'react'
import { Card, List, Space, Button, Image, Typography, Checkbox, Row, Col, Empty, message, Pagination, Tooltip } from 'antd'
import { DeleteOutlined, EyeOutlined, ReloadOutlined, SoundOutlined, PictureOutlined, ZoomInOutlined } from '@ant-design/icons'

const { Text } = Typography

interface FileItem {
  filename: string
  path: string
  size: number
  modified: number
}

interface FileManagerProps {
  fileType: 'images' | 'audios' | 'videos'
  selectedFiles: string[]
  onSelectionChange: (files: string[]) => void
  onFilesChange?: (files: FileItem[]) => void
}

const FileManager: React.FC<FileManagerProps> = ({
  fileType,
  selectedFiles,
  onSelectionChange,
  onFilesChange
}) => {
  const [files, setFiles] = useState<FileItem[]>([])
  const [loading, setLoading] = useState(false)
  const [previewImage, setPreviewImage] = useState<string>('')
  const [currentPage, setCurrentPage] = useState(1)
  const pageSize = 10

  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return '0 Bytes'
    const k = 1024
    const sizes = ['Bytes', 'KB', 'MB', 'GB']
    const i = Math.floor(Math.log(bytes) / Math.log(k))
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i]
  }

  const formatDate = (timestamp: number) => {
    return new Date(timestamp * 1000).toLocaleString('zh-CN')
  }

  const loadFiles = async () => {
    setLoading(true)
    try {
      const response = await fetch(`/api/files/${fileType}`)
      if (!response.ok) {
        throw new Error('获取文件列表失败')
      }
      const data = await response.json()
      const fileList = data[fileType] || []
      setFiles(fileList)
      if (onFilesChange) {
        onFilesChange(fileList)
      }
    } catch (error) {
      message.error(`加载文件失败: ${error}`)
    } finally {
      setLoading(false)
    }
  }

  const deleteFile = async (filename: string) => {
    try {
      const response = await fetch(`/api/files/${fileType}/${filename}`, {
        method: 'DELETE'
      })
      if (!response.ok) {
        throw new Error('删除文件失败')
      }
      message.success('文件删除成功')
      // 从选中列表中移除
      const newSelected = selectedFiles.filter(f => f !== filename)
      onSelectionChange(newSelected)
      // 重新加载文件列表
      loadFiles()
    } catch (error) {
      message.error(`删除文件失败: ${error}`)
    }
  }

  const handleCheckboxChange = (filePath: string, checked: boolean) => {
    if (checked) {
      onSelectionChange([...selectedFiles, filePath])
    } else {
      onSelectionChange(selectedFiles.filter(f => f !== filePath))
    }
  }

  useEffect(() => {
    loadFiles()
    // 设置定时器定期刷新文件列表
    const interval = setInterval(() => {
      loadFiles()
    }, 5000) // 每5秒刷新一次

    return () => {
      clearInterval(interval)
    }
  }, [fileType])

  const isImage = fileType === 'images'
  const isAudio = fileType === 'audios'
  const isVideo = fileType === 'videos'

  // 图片网格显示模式
  const renderImageGrid = () => {
    const pageFiles = files.slice((currentPage - 1) * pageSize, currentPage * pageSize)

    return (
      <div style={{ marginBottom: 16 }}>
        <Row gutter={[16, 16]}>
          {pageFiles.map((file) => (
            <Col key={file.path} xs={12} sm={8} md={6} lg={4.8}>
              <Card
                hoverable
                size="small"
                style={{
                  height: '200px',
                  position: 'relative',
                  border: selectedFiles.includes(file.path) ? '2px solid #1890ff' : '1px solid #d9d9d9',
                  transition: 'all 0.3s ease',
                  cursor: 'pointer'
                }}
                bodyStyle={{ padding: '8px', height: '100%' }}
                onClick={() => handleCheckboxChange(file.path, !selectedFiles.includes(file.path))}
              >
                <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
                  {/* 图片缩略图 */}
                  <div style={{
                    flex: 1,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    marginBottom: '8px',
                    overflow: 'hidden',
                    cursor: 'pointer',
                    position: 'relative'
                  }}>
                    <img
                      src={`/api/files/images/${file.filename}`}
                      alt={file.filename}
                      style={{
                        maxWidth: '100%',
                        maxHeight: '120px',
                        objectFit: 'contain',
                        transition: 'transform 0.3s ease'
                      }}
                      onClick={(e) => {
                        e.stopPropagation()
                        setPreviewImage(`/api/files/images/${file.filename}`)
                      }}
                      onMouseOver={(e) => {
                        e.currentTarget.style.transform = 'scale(1.1)'
                      }}
                      onMouseOut={(e) => {
                        e.currentTarget.style.transform = 'scale(1)'
                      }}
                    />
                    {/* 悬停时显示放大图标 */}
                    <div style={{
                      position: 'absolute',
                      top: '4px',
                      right: '4px',
                      backgroundColor: 'rgba(0, 0, 0, 0.6)',
                      borderRadius: '4px',
                      padding: '2px 4px',
                      opacity: 0,
                      transition: 'opacity 0.3s ease'
                    }}
                    onMouseOver={(e) => {
                      e.currentTarget.style.opacity = '1'
                    }}
                    onMouseOut={(e) => {
                      e.currentTarget.style.opacity = '0'
                    }}
                    >
                      <ZoomInOutlined style={{ color: 'white', fontSize: '14px' }} />
                    </div>
                  </div>

                  {/* 文件名和操作按钮 */}
                  <div style={{ flexShrink: 0 }}>
                    <Text
                      style={{
                        fontSize: '12px',
                        display: 'block',
                        marginBottom: '4px',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap'
                      }}
                      title={file.filename}
                    >
                      {file.filename}
                    </Text>

                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <Text type="secondary" style={{ fontSize: '11px' }}>
                        {formatFileSize(file.size)}
                      </Text>

                      <Space size="small">
                        <Button
                          icon={<EyeOutlined />}
                          size="small"
                          onClick={(e) => {
                            e.stopPropagation()
                            setPreviewImage(`/api/files/images/${file.filename}`)
                          }}
                        />
                        <Button
                          icon={<DeleteOutlined />}
                          size="small"
                          danger
                          onClick={(e) => {
                            e.stopPropagation()
                            deleteFile(file.filename)
                          }}
                        />
                      </Space>
                    </div>
                  </div>

                  {/* 选择状态指示器 */}
                  {selectedFiles.includes(file.path) && (
                    <div style={{
                      position: 'absolute',
                      top: '8px',
                      right: '8px',
                      backgroundColor: '#1890ff',
                      color: 'white',
                      borderRadius: '50%',
                      width: '24px',
                      height: '24px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: '14px'
                    }}>
                      ✓
                    </div>
                  )}
                </div>
              </Card>
            </Col>
          ))}
        </Row>
      </div>
    )
  }

  return (
    <Card
      title={
        <Space>
          {isImage && <PictureOutlined />}
          {isAudio && !isImage && <SoundOutlined />}
          {isVideo && !isImage && !isAudio && <SoundOutlined />}
          {isImage ? '图片文件' : isAudio ? '音频文件' : '视频文件'}
        </Space>
      }
      extra={
        <Button
          icon={<ReloadOutlined />}
          onClick={loadFiles}
          loading={loading}
          size="small"
        >
          刷新
        </Button>
      }
    >
      {files.length === 0 ? (
        <Empty
          description={`暂无${isImage ? '图片' : isAudio ? '音频' : '视频'}文件`}
          style={{ padding: '40px 0' }}
        />
      ) : (
        <>
          {/* 图片使用缩略图网格显示 */}
          {isImage ? (
            renderImageGrid()
          ) : (
            /* 音频和视频使用列表显示 */
            <List
              dataSource={files.slice((currentPage - 1) * pageSize, currentPage * pageSize)}
              renderItem={(file) => (
              <List.Item
                actions={[
                  isImage && (
                    <Button
                      icon={<EyeOutlined />}
                      size="small"
                      onClick={() => setPreviewImage(`/api/files/images/${file.filename}`)}
                    >
                      预览
                    </Button>
                  ),
                  <Button
                    icon={<DeleteOutlined />}
                    size="small"
                    danger
                    onClick={() => deleteFile(file.filename)}
                  >
                    删除
                  </Button>
                ].filter(Boolean)}
              >
                <List.Item.Meta
                  avatar={
                    <Checkbox
                      checked={selectedFiles.includes(file.path)}
                      onChange={(e) => handleCheckboxChange(file.path, e.target.checked)}
                    />
                  }
                  title={
                    <Space>
                      <Text>{file.filename}</Text>
                      <Text type="secondary" style={{ fontSize: '12px' }}>
                        {formatFileSize(file.size)}
                      </Text>
                    </Space>
                  }
                  description={
                    <Text type="secondary" style={{ fontSize: '12px' }}>
                      {formatDate(file.modified)}
                    </Text>
                  }
                />
              </List.Item>
            )}
            />
          )}
          <div style={{ marginTop: 16, textAlign: 'right' }}>
            <Pagination
              current={currentPage}
              total={files.length}
              pageSize={pageSize}
              onChange={(page) => setCurrentPage(page)}
              showSizeChanger={false}
              showTotal={(total) => `共 ${total} 个文件`}
            />
          </div>
        </>
      )}

      {/* 图片预览模态框 */}
      {isImage && (
        <Image
          preview={{
            visible: !!previewImage,
            onVisibleChange: (visible) => !visible && setPreviewImage(''),
            src: previewImage,
          }}
          src={previewImage}
          style={{ display: 'none' }}
        />
      )}
    </Card>
  )
}

export default FileManager