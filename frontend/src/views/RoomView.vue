<template>
  <div class="room">
    <!-- 알림 표시 -->
    <div v-if="notification.show" class="notification">
      {{ notification.message }}
    </div>
    <div class="room-header">
      <h2>방 코드: {{ roomCode }}</h2>
      <div class="expiry-timer" :class="{ 'expiry-warning': expiresIn < 600 }">
        남은 시간: {{ formatTime(expiresIn) }}
      </div>
    </div>

    <div class="room-content">
      <div class="content-panel">
        <!-- 파일 업로드 영역 -->
        <div class="file-upload-section">
          <h3>파일 업로드</h3>
          <div class="upload-form">
            <input
              type="file"
              ref="fileInput"
              @change="handleFileChange"
              class="file-input"
            />
            <button
              @click="uploadFile"
              :disabled="!selectedFile || isUploading"
              class="upload-button"
            >
              {{ isUploading ? '업로드 중...' : '업로드' }}
            </button>
          </div>
          <div v-if="uploadError" class="error-message">
            {{ uploadError }}
          </div>
          <div v-if="uploadSuccess" class="success-message">
            {{ uploadSuccess }}
          </div>
        </div>

        <!-- 파일 목록 영역 -->
        <div class="file-list-section">

          <div v-if="isLoading" class="loading-message">
            파일 목록을 불러오는 중...
          </div>
          <div v-else-if="files.length === 0" class="empty-message">
            공유된 파일이 없습니다.
          </div>
          <ul v-else class="file-list">
            <li
              v-for="file in files"
              :key="file._uniqueKey || generateUUID()"
              class="file-item"
              :class="{ 'is-office-document': file.isOfficeDocument, 'is-selected': selectedDocument && selectedDocument.filename === file.filename }"
            >
              <div class="file-info">
                <span class="file-name">{{ file.originalName }}</span>
                <span class="file-size">{{ formatFileSize(file.size) }}</span>
                <span class="file-date">{{ formatDate(file.uploadedAt) }}</span>
                <span v-if="file.viewCount > 0" class="view-count">{{ file.viewCount }} 명 보는 중</span>
              </div>
              <div class="file-actions">
                <button @click="downloadFile(file)" class="download-button">
                  다운로드
                </button>
                <button @click="deleteFile(file)" class="delete-button">
                  삭제
                </button>
              </div>
            </li>
          </ul>
        </div>
      </div>
    </div>
  </div>
</template>

<script>
import axios from 'axios'
import io from 'socket.io-client'

// UUID 생성 함수
function generateUUID() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
    const r = Math.random() * 16 | 0
    const v = c === 'x' ? r : (r & 0x3 | 0x8)
    return v.toString(16)
  })
}

export default {
  name: 'RoomView',
  data() {
    return {
      roomCode: this.$route.params.roomId,
      expiresIn: 3600,
      timerInterval: null,
      apiUrl: process.env.VUE_APP_API_URL || 'http://localhost:3001',
      socketUrl: process.env.VUE_APP_SOCKET_URL || 'http://localhost:3001',
      socket: null,
      selectedFile: null,
      isUploading: false,
      uploadError: '',
      uploadSuccess: '',
      files: [],
      isLoading: false,
      userId: `user_${Date.now()}_${Math.floor(Math.random() * 1000)}`, // 임시 사용자 ID
      hasJoinedRoom: false, // 방 참여 여부 추적
      notification: {
        show: false,
        message: '',
        timeout: null
      }
    }
  },
  async created() {
    try {
      // 방 참여 또는 생성 시도
      await this.joinOrCreateRoom()
      this.startExpiryTimer()
      this.loadFiles()
      this.connectSocket()
    } catch (error) {
      console.error('방 참여 오류:', error)
      this.navigateToHome()
    }
  },
  beforeDestroy() {
    if (this.timerInterval) {
      clearInterval(this.timerInterval)
    }

    // Socket.IO 연결 해제
    if (this.socket) {
      this.socket.disconnect()
    }
  },
  methods: {
    async joinOrCreateRoom() {
      try {
        // 방 참여 시도
        const response = await axios.post(`${this.apiUrl}/api/rooms/${this.roomCode}`)
        this.expiresIn = response.data.expiresIn || 3600

        // 처음 참여하는 경우에만 알림 표시
        if (!this.hasJoinedRoom) {
          this.showNotification('방에 성공적으로 참여했습니다.')
          this.hasJoinedRoom = true
        }
      } catch (error) {
        if (error.response && error.response.status === 404) {
          // 방이 없는 경우, 6자리 숫자인지 확인
          if (/^\d{6}$/.test(this.roomCode)) {
            // 방 생성 시도
            try {
              const createResponse = await axios.post(`${this.apiUrl}/api/rooms`, { roomCode: this.roomCode })
              this.expiresIn = createResponse.data.expiresIn || 3600
              this.showNotification('새 방이 생성되었습니다.')
              this.hasJoinedRoom = true
            } catch (createError) {
              console.error('방 생성 오류:', createError)
              throw createError
            }
          } else {
            throw error
          }
        } else {
          throw error
        }
      }
    },

    async checkRoomStatus() {
      try {
        const response = await axios.get(`${this.apiUrl}/api/rooms/${this.roomCode}/status`)
        if (!response.data.active) {
          this.navigateToHome()
          alert('방이 만료되었습니다.')
          return
        }
        this.expiresIn = response.data.expiresIn
      } catch (error) {
        console.error('방 상태 확인 실패:', error)
        this.navigateToHome()
      }
    },
    navigateToHome() {
      // 중복 이동 오류 처리
      this.$router.push('/').catch(err => {
        if (err.name !== 'NavigationDuplicated') {
          throw err
        }
      })
    },
    startExpiryTimer() {
      this.timerInterval = setInterval(() => {
        this.expiresIn--
        if (this.expiresIn <= 0) {
          clearInterval(this.timerInterval)
          this.navigateToHome()
          alert('방이 만료되었습니다.')
        } else if (this.expiresIn % 60 === 0) {
          // 1분마다 서버에서 실제 만료 시간 확인
          this.checkRoomStatus()
        }
      }, 1000)
    },
    formatTime(seconds) {
      const hours = Math.floor(seconds / 3600)
      const minutes = Math.floor((seconds % 3600) / 60)
      const remainingSeconds = seconds % 60

      return `${hours}:${String(minutes).padStart(2, '0')}:${String(remainingSeconds).padStart(2, '0')}`
    },

    // 파일 업로드 관련 메서드
    handleFileChange(event) {
      this.selectedFile = event.target.files[0] || null
      this.uploadError = ''
      this.uploadSuccess = ''
    },

    async uploadFile() {
      if (!this.selectedFile) {
        this.uploadError = '업로드할 파일을 선택해주세요.'
        return
      }

      this.isUploading = true
      this.uploadError = ''
      this.uploadSuccess = ''

      const formData = new FormData()
      formData.append('file', this.selectedFile)

      try {
        const response = await axios.post(
          `${this.apiUrl}/api/rooms/${this.roomCode}/files`,
          formData,
          {
            headers: {
              'Content-Type': 'multipart/form-data'
            }
          }
        )

        this.uploadSuccess = response.data.message || '파일이 성공적으로 업로드되었습니다.'
        this.selectedFile = null
        this.$refs.fileInput.value = ''

        // 파일 목록 새로고침
        this.loadFiles()
      } catch (error) {
        console.error('파일 업로드 오류:', error)
        this.uploadError = error.response?.data?.message || '파일 업로드에 실패했습니다.'
      } finally {
        this.isUploading = false
      }
    },

    // 파일 목록 관련 메서드
    async loadFiles() {
      this.isLoading = true

      try {
        const response = await axios.get(`${this.apiUrl}/api/rooms/${this.roomCode}/files`)
        const files = response.data.files || []

        // 중복 파일 제거 및 고유 ID 할당
        const filenameMap = new Map()

        // 파일명으로 중복 제거
        files.forEach(file => {
          // 이미 동일한 파일명이 있는 경우 가장 최근 파일로 대체
          if (!filenameMap.has(file.filename) || file.uploadedAt > filenameMap.get(file.filename).uploadedAt) {
            filenameMap.set(file.filename, file)
          }
        })

        // 중복이 제거된 파일 목록 가져오기
        const uniqueFiles = Array.from(filenameMap.values())

        // 각 파일에 고유 ID 할당 (이미 있는 경우 유지)
        this.files = uniqueFiles.map(file => ({
          ...file,
          _uniqueKey: generateUUID() // 렌더링용 고유 키
        }))
      } catch (error) {
        console.error('파일 목록 로드 오류:', error)
        this.files = []
      } finally {
        this.isLoading = false
      }
    },

    // 파일 다운로드 메서드
    async downloadFile(file) {
      try {
        // 다운로드 URL 생성 (ID 사용)
        const downloadUrl = `${this.apiUrl}/api/rooms/${this.roomCode}/files/download/${file.id}?download=true`

        // axios를 사용하여 파일 다운로드
        const response = await axios({
          url: downloadUrl,
          method: 'GET',
          responseType: 'blob'
        })

        // Blob 생성
        const blob = new Blob([response.data], { type: file.mimetype })

        // 다운로드 링크 생성
        const url = window.URL.createObjectURL(blob)
        const link = document.createElement('a')
        link.href = url
        link.setAttribute('download', file.originalName)
        document.body.appendChild(link)

        // 다운로드 시작
        link.click()

        // 링크 제거
        window.URL.revokeObjectURL(url)
        document.body.removeChild(link)
      } catch (error) {
        console.error('파일 다운로드 오류:', error)
        this.showNotification('파일 다운로드에 실패했습니다.')
      }
    },



    // 파일 삭제 메서드
    async deleteFile(file) {
      if (!confirm(`파일 "${file.originalName}"을(를) 삭제하시겠습니까?`)) {
        return
      }

      try {
        const response = await axios.delete(`${this.apiUrl}/api/rooms/${this.roomCode}/files/${file.id}`)

        // 파일 목록에서 삭제
        const fileIndex = this.files.findIndex(f => f.id === file.id)
        if (fileIndex !== -1) {
          this.files.splice(fileIndex, 1)
        }



        this.showNotification(response.data.message || '파일이 삭제되었습니다.')
      } catch (error) {
        console.error('파일 삭제 오류:', error)
        this.showNotification('파일 삭제에 실패했습니다.')
      }
    },

    // 알림 표시 메서드
    showNotification(message, duration = 3000) {
      // 이전 타이머가 있는 경우 취소
      if (this.notification.timeout) {
        clearTimeout(this.notification.timeout)
      }

      // 알림 표시
      this.notification.message = message
      this.notification.show = true

      // 일정 시간 후 알림 숨기기
      this.notification.timeout = setTimeout(() => {
        this.notification.show = false
      }, duration)
    },

    // 파일 크기 포맷팅
    formatFileSize(bytes) {
      if (bytes === 0) return '0 Bytes'

      const k = 1024
      const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB']
      const i = Math.floor(Math.log(bytes) / Math.log(k))

      return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i]
    },

    // 날짜 포맷팅
    formatDate(timestamp) {
      const date = new Date(timestamp)
      return date.toLocaleString()
    },

    // Socket.IO 연결 관련 메서드
    connectSocket() {
      // Socket.IO 연결 생성
      this.socket = io(this.socketUrl)

      // 연결 이벤트
      this.socket.on('connect', () => {
        console.log('Socket.IO 연결 성공')

        // 방에 참여
        this.socket.emit('joinRoom', this.roomCode)
      })

      // 파일 업로드 이벤트
      this.socket.on('fileUploaded', (data) => {
        console.log('새 파일 업로드 알림 수신:', data)

        // 파일에 고유 키 추가
        const newFile = {
          ...data.file,
          _uniqueKey: generateUUID()
        }

        // 파일 목록에 새 파일 추가 (중복 방지)
        const existingFileIndex = this.files.findIndex(file => file.filename === newFile.filename)

        if (existingFileIndex !== -1) {
          // 기존 파일의 고유 키 유지
          newFile._uniqueKey = this.files[existingFileIndex]._uniqueKey
          // 기존 파일 업데이트
          this.files.splice(existingFileIndex, 1, newFile)
        } else {
          // 새 파일 추가
          this.files.push(newFile)
        }

        // 파일 목록 정렬 (최신 업로드 순)
        this.files.sort((a, b) => b.uploadedAt - a.uploadedAt)
      })



      // 파일 삭제 이벤트
      this.socket.on('fileDeleted', (data) => {
        console.log('파일 삭제 알림 수신:', data)

        // 파일 목록에서 삭제
        const fileIndex = this.files.findIndex(file =>
          (file.id && file.id === data.id) ||
          file.filename === data.filename
        )

        if (fileIndex !== -1) {
          this.files.splice(fileIndex, 1)
          this.showNotification('파일이 삭제되었습니다.')
        }
      })

      // 연결 오류 이벤트
      this.socket.on('connect_error', (error) => {
        console.error('Socket.IO 연결 오류:', error)
      })
    }
  }
}
</script>

<style scoped>
:root {
  --primary-color: #3f51b5;
  --primary-light: #757de8;
  --primary-dark: #002984;
  --secondary-color: #ff4081;
  --secondary-light: #ff79b0;
  --secondary-dark: #c60055;
  --text-on-primary: #ffffff;
  --text-on-secondary: #ffffff;
  --background-color: #f5f7fa;
  --surface-color: #ffffff;
  --error-color: #f44336;
  --success-color: #4caf50;
  --warning-color: #ff9800;
  --info-color: #2196f3;
}

.room {
  padding: 20px;
  background-color: var(--background-color);
  min-height: 100vh;
  font-family: 'Roboto', 'Noto Sans KR', sans-serif;
}

.room-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 16px 24px;
  background-color: var(--primary-color);
  color: var(--text-on-primary);
  margin-bottom: 24px;
  border-radius: 12px;
  box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
  transition: all 0.3s ease;
}

.room-header h2 {
  margin: 0;
  font-size: 1.5rem;
  font-weight: 500;
}

.expiry-timer {
  font-family: 'Roboto Mono', monospace;
  padding: 8px 12px;
  border-radius: 20px;
  background-color: rgba(255, 255, 255, 0.2);
  color: var(--text-on-primary);
  font-weight: 500;
  letter-spacing: 1px;
  transition: all 0.3s ease;
}

.expiry-warning {
  background-color: var(--error-color);
  color: var(--text-on-secondary);
  animation: pulse 2s infinite;
  box-shadow: 0 0 10px rgba(244, 67, 54, 0.5);
}

.room-content {
  display: grid;
  grid-template-columns: 1fr;
  gap: 24px;
  transition: all 0.3s ease;
}

.content-panel {
  display: flex;
  flex-direction: column;
  gap: 24px;
}

.file-upload-section,
.file-list-section {
  background-color: var(--surface-color);
  padding: 24px;
  border-radius: 12px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.08);
  transition: all 0.3s ease;
}

.file-upload-section h3,
.file-list-section h3 {
  margin-top: 0;
  margin-bottom: 16px;
  color: var(--primary-color);
  font-size: 1.25rem;
  font-weight: 500;
  display: flex;
  align-items: center;
}

.file-upload-section h3::before,
.file-list-section h3::before {
  content: '';
  display: inline-block;
  width: 4px;
  height: 18px;
  background-color: var(--primary-color);
  margin-right: 8px;
  border-radius: 2px;
}

.upload-form {
  display: flex;
  margin-top: 16px;
  margin-bottom: 16px;
  position: relative;
}

.file-input {
  flex: 1;
  padding: 12px 16px;
  border: 2px solid #e0e0e0;
  border-radius: 8px 0 0 8px;
  font-size: 14px;
  transition: all 0.3s ease;
  outline: none;
}

.file-input:focus {
  border-color: var(--primary-color);
  box-shadow: 0 0 0 2px rgba(63, 81, 181, 0.2);
}

.upload-button {
  padding: 12px 20px;
  background-color: var(--primary-color);
  color: var(--text-on-primary);
  border: none;
  border-radius: 0 8px 8px 0;
  cursor: pointer;
  font-weight: 500;
  letter-spacing: 0.5px;
  transition: all 0.3s ease;
}

.upload-button:hover {
  background-color: var(--primary-dark);
  box-shadow: 0 4px 8px rgba(0, 0, 0, 0.1);
}

.upload-button:disabled {
  background-color: #cccccc;
  cursor: not-allowed;
  box-shadow: none;
}

.error-message {
  color: var(--error-color);
  margin-top: 12px;
  font-size: 14px;
  display: flex;
  align-items: center;
}

.error-message::before {
  content: '⚠️';
  margin-right: 6px;
}

.success-message {
  color: var(--success-color);
  margin-top: 12px;
  font-size: 14px;
  display: flex;
  align-items: center;
}

.success-message::before {
  content: '✅';
  margin-right: 6px;
}

.refresh-button {
  padding: 8px 16px;
  background-color: var(--info-color);
  color: var(--text-on-primary);
  border: none;
  border-radius: 20px;
  cursor: pointer;
  margin-left: 12px;
  font-size: 14px;
  font-weight: 500;
  display: inline-flex;
  align-items: center;
  transition: all 0.3s ease;
}

.refresh-button::before {
  content: '🔄';
  margin-right: 6px;
  font-size: 14px;
}

.refresh-button:hover {
  background-color: #1976d2;
  box-shadow: 0 2px 6px rgba(0, 0, 0, 0.15);
}

.loading-message,
.empty-message {
  margin-top: 16px;
  color: #757575;
  font-style: italic;
  text-align: center;
  padding: 24px;
  background-color: #f5f5f5;
  border-radius: 8px;
}

.loading-message::before {
  content: '⏳';
  margin-right: 8px;
}

.empty-message::before {
  content: '📂';
  margin-right: 8px;
}

.file-list {
  list-style: none;
  padding: 0;
  margin-top: 16px;
}

.file-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 16px;
  border: 1px solid #e0e0e0;
  border-radius: 8px;
  margin-bottom: 12px;
  background-color: white;
  transition: all 0.3s ease;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.05);
}

.file-item:hover {
  transform: translateY(-2px);
  box-shadow: 0 4px 8px rgba(0, 0, 0, 0.1);
}

.file-item.is-office-document {
  border-left: 4px solid var(--primary-color);
}

.file-item.is-selected {
  background-color: #e8eaf6;
  border-color: var(--primary-color);
}

.file-info {
  display: flex;
  flex-direction: column;
  flex: 1;
}

.file-name {
  font-weight: 500;
  margin-bottom: 8px;
  color: #333;
  font-size: 16px;
  word-break: break-all;
}

.file-size,
.file-date {
  font-size: 13px;
  color: #757575;
  margin-bottom: 4px;
  display: flex;
  align-items: center;
}

.file-size::before {
  content: '📊';
  margin-right: 6px;
  font-size: 12px;
}

.file-date::before {
  content: '🕒';
  margin-right: 6px;
  font-size: 12px;
}

.view-count {
  font-size: 13px;
  color: var(--primary-color);
  background-color: #e8eaf6;
  padding: 4px 10px;
  border-radius: 16px;
  display: inline-flex;
  align-items: center;
  margin-top: 8px;
  font-weight: 500;
}

.view-count::before {
  content: '👁️';
  margin-right: 6px;
  font-size: 12px;
}

.file-actions {
  display: flex;
  gap: 10px;
}

.download-button,
.view-button {
  padding: 8px 16px;
  border: none;
  border-radius: 20px;
  cursor: pointer;
  font-size: 14px;
  font-weight: 500;
  display: inline-flex;
  align-items: center;
  transition: all 0.3s ease;
}

.download-button {
  background-color: var(--info-color);
  color: var(--text-on-primary);
}

.download-button::before {
  content: '⬇️';
  margin-right: 6px;
  font-size: 14px;
}

.download-button:hover {
  background-color: #1976d2;
  box-shadow: 0 2px 6px rgba(0, 0, 0, 0.15);
}

.view-button {
  background-color: var(--success-color);
  color: var(--text-on-primary);
}

.view-button::before {
  content: '👁️';
  margin-right: 6px;
  font-size: 14px;
}

.view-button:hover {
  background-color: #388e3c;
  box-shadow: 0 2px 6px rgba(0, 0, 0, 0.15);
}

.delete-button {
  background-color: var(--error-color);
  color: var(--text-on-primary);
}

.delete-button::before {
  content: '🗑️';
  margin-right: 6px;
  font-size: 14px;
}

.delete-button:hover {
  background-color: #d32f2f;
  box-shadow: 0 2px 6px rgba(0, 0, 0, 0.15);
}



@keyframes pulse {
  0% { opacity: 1; }
  50% { opacity: 0.5; }
  100% { opacity: 1; }
}

.notification {
  position: fixed;
  top: 20px;
  right: 20px;
  background-color: #2ecc71; /* 더 선명한 녹색 */
  color: white;
  padding: 16px 24px;
  border-radius: 12px;
  box-shadow: 0 8px 16px rgba(46, 204, 113, 0.3);
  z-index: 1000;
  animation: slideIn 0.3s ease-out, fadeOut 0.5s ease-in 2.5s forwards;
  display: flex;
  align-items: center;
  font-weight: 500;
  max-width: 80%;
  border-left: 5px solid #27ae60; /* 왼쪽 테두리 추가 */
}

.notification::before {
  content: '✅';
  margin-right: 10px;
  font-size: 18px;
}

@keyframes slideIn {
  from { transform: translateX(100%); opacity: 0; }
  to { transform: translateX(0); opacity: 1; }
}

@keyframes fadeOut {
  from { opacity: 1; }
  to { opacity: 0; }
}

/* 반응형 디자인 */
@media (max-width: 992px) {

  .room-header {
    flex-direction: column;
    align-items: flex-start;
    gap: 10px;
  }

  .expiry-timer {
    align-self: flex-start;
  }

  .file-actions {
    flex-direction: column;
    gap: 8px;
  }

  .download-button, .view-button {
    width: 100%;
    justify-content: center;
  }
}

@media (max-width: 576px) {
  .room {
    padding: 12px;
  }

  .room-header {
    padding: 12px 16px;
    margin-bottom: 16px;
  }

  .file-upload-section, .file-list-section {
    padding: 16px;
  }

  .upload-form {
    flex-direction: column;
  }

  .file-input {
    border-radius: 8px 8px 0 0;
  }

  .upload-button {
    border-radius: 0 0 8px 8px;
  }

  .file-item {
    flex-direction: column;
    align-items: flex-start;
  }

  .file-info {
    width: 100%;
    margin-bottom: 12px;
  }

  .file-actions {
    width: 100%;
  }

  .notification {
    top: 10px;
    right: 10px;
    left: 10px;
    max-width: calc(100% - 20px);
    padding: 12px 16px;
  }
}
</style>
