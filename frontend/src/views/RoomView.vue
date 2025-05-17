<template>
  <div class="room">
    <!-- 알림 표시 -->
    <div
      v-if="notification.show"
      class="notification"
      :class="{ 'error-notification': notification.isError }"
    >
      {{ notification.message }}
    </div>
    <div class="room-header">
      <div class="room-info">
        <h2>방 코드: {{ roomCode }}</h2>
        <div class="user-name-container">
          <span v-if="!isEditingUserName" @click="startEditUserName" class="user-name">
            사용자 이름: {{ userName }} <span class="edit-icon">✏️</span>
          </span>
          <div v-else class="user-name-edit">
            <input
              ref="userNameInput"
              v-model="editUserName"
              @keyup.enter="saveUserName"
              @blur="saveUserName"
              placeholder="사용자 이름 입력"
              class="user-name-input"
            />
          </div>
        </div>
      </div>
      <div class="expiry-timer" :class="{ 'expiry-warning': expiresIn < 600 }">
        남은 시간: {{ formatTime(expiresIn) }}
      </div>
    </div>

    <div class="room-content">
      <div class="content-panel">
        <!-- 파일 업로드 영역 -->
        <div class="file-upload-section">
          <h3>파일 업로드</h3>

          <!-- 드래그 앤 드롭 영역 -->
          <div class="drop-zone-container">
            <div
              class="drop-zone"
              :class="{ 'drop-zone-active': isDragging }"
              @dragover.prevent="onDragOver"
              @dragleave.prevent="onDragLeave"
              @drop.prevent="onDrop"
              @click="openFilePicker"
            >
              <div class="drop-zone-content">
                <div class="drop-icon">📤</div>
                <p>파일을 드래그하거나 클릭하세요</p>
                <p style="font-size: 12px; color: #666; margin-top: 5px;">자동으로 업로드됩니다</p>
                <input
                  type="file"
                  id="fileInput"
                  ref="fileInput"
                  @change="handleFileChange"
                  class="file-input"
                  style="display: none;"
                  @click.stop
                  accept="*/*"
                />
              </div>
              <div v-if="selectedFile" class="selected-file">
                <span class="selected-file-name">{{ selectedFile.name }}</span>
                <button @click.stop="clearSelectedFile" class="clear-file-button">✕</button>
              </div>
            </div>
          </div>
        </div>

        <!-- 파일 목록 영역 -->
        <div class="file-list-section">
          <div class="file-list-header">
            <h3>파일 목록</h3>
            <button
              v-if="files.length > 0"
              @click="downloadAllFiles"
              class="download-all-button"
              :class="{ 'downloading': isDownloadingAll }"
              :disabled="isDownloadingAll"
            >
              <span class="button-text">{{ isDownloadingAll ? '다운로드 중...' : '전체 파일 다운로드' }}</span>
              <span v-if="isDownloadingAll" class="loading-spinner"></span>
            </button>
          </div>

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
              :class="{
                'is-office-document': file.isOfficeDocument,
                'is-selected': selectedDocument && selectedDocument.filename === file.filename
              }"
            >
              <div class="file-info">
                <span class="file-name">{{ file.originalName }}</span>
                <div class="file-details">
                  <span class="file-size">{{ formatFileSize(file.size) }}</span>
                  <span class="file-date">{{ formatDate(file.uploadedAt) }}</span>
                  <span class="file-uploader">
                    <span class="uploader-label">업로더:</span>
                    <span class="uploader-name">{{ file.userName }}</span>
                  </span>
                  <!-- 디버깅용 -->
                  <span class="debug-info" style="display: none;">{{ JSON.stringify(file) }}</span>
                  <span v-if="file.viewCount > 0" class="view-count">{{ file.viewCount }} 명 보는 중</span>
                </div>
              </div>
              <div class="file-actions">
                <button @click="previewFile(file)" class="preview-button">
                  미리보기
                </button>
                <button @click="downloadFile(file)" class="download-button">
                  다운로드
                </button>
              </div>
            </li>
          </ul>
        </div>
      </div>
    </div>

    <!-- 파일 미리보기 모달 -->
    <div class="preview-modal" v-if="previewModal.show" @click="closePreview">
      <div class="preview-content" @click.stop>
        <div class="preview-header">
          <h3>{{ previewModal.file ? previewModal.file.originalName : '파일 미리보기' }}</h3>
          <button class="close-button" @click="closePreview">×</button>
        </div>
        <div class="preview-body">
          <div v-if="previewModal.isLoading" class="preview-loading">
            <div class="loading-spinner"></div>
            <p>미리보기 로딩 중...</p>
          </div>

          <!-- 이미지 미리보기 -->
          <img
            v-else-if="previewModal.file && isImageFile(previewModal.file)"
            :src="previewModal.previewUrl"
            alt="이미지 미리보기"
            class="preview-image"
          />

          <!-- PDF 미리보기 -->
          <iframe
            v-else-if="previewModal.file && isPdfFile(previewModal.file)"
            :src="previewModal.previewUrl"
            class="preview-pdf"
            frameborder="0"
          ></iframe>

          <!-- Excel 파일 미리보기 -->
          <iframe
            v-else-if="previewModal.file && isExcelFile(previewModal.file)"
            :src="previewModal.officeViewerUrl"
            class="preview-excel"
            frameborder="0"
          ></iframe>

          <!-- Office 파일 미리보기 -->
          <iframe
            v-else-if="previewModal.file && isOfficeFile(previewModal.file)"
            :src="previewModal.officeViewerUrl"
            class="preview-office"
            frameborder="0"
          ></iframe>

          <!-- 비디오 미리보기 -->
          <video
            v-else-if="previewModal.file && isVideoFile(previewModal.file)"
            :src="previewModal.previewUrl"
            controls
            class="preview-video"
          ></video>

          <!-- 오디오 미리보기 -->
          <audio
            v-else-if="previewModal.file && isAudioFile(previewModal.file)"
            :src="previewModal.previewUrl"
            controls
            class="preview-audio"
          ></audio>

          <!-- 텍스트 미리보기 -->
          <div
            v-else-if="previewModal.file && isTextFile(previewModal.file) && previewModal.textContent"
            class="preview-text"
          >
            <pre>{{ previewModal.textContent }}</pre>
          </div>

          <!-- 미리보기 불가능한 파일 -->
          <div v-else class="preview-unsupported">
            <div class="unsupported-icon">📄</div>
            <p>이 파일 형식은 미리보기를 지원하지 않습니다.</p>
            <button @click="downloadFile(previewModal.file)" class="download-button">
              다운로드
            </button>
          </div>
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
    const apiBaseUrl = process.env.VUE_APP_API_URL || 'http://localhost:3001';

    return {
      roomCode: this.$route.params.roomId,
      expiresIn: 3600,
      timerInterval: null,
      apiUrl: apiBaseUrl,
      socketUrl: apiBaseUrl,
      socket: null,
      selectedFile: null,
      isUploading: false,
      uploadError: '',
      uploadSuccess: '',
      files: [],
      isLoading: false,
      userId: `user_${Date.now()}_${Math.floor(Math.random() * 1000)}`, // 임시 사용자 ID
      hasJoinedRoom: false, // 방 참여 여부 추적
      isDragging: false, // 드래그 앤 드롭 상태 추적
      isDownloadingAll: false, // 전체 파일 다운로드 상태
      notification: {
        show: false,
        message: '',
        timeout: null,
        isError: false
      },
      userName: '', // 사용자 이름 저장 변수 추가
      isEditingUserName: false, // 사용자 이름 편집 모드 상태
      editUserName: '', // 편집 중인 사용자 이름
      previewModal: {
        show: false,
        file: null,
        previewUrl: '',
        officeViewerUrl: '',
        textContent: null,
        isLoading: false
      }
    }
  },
  async created() {
    // 환경 변수 확인 및 로깅
    console.log('API URL:', this.apiUrl)
    console.log('Socket URL:', this.socketUrl)

    // URL 쿼리 파라미터에서 userName 가져오기
    console.log('URL 쿼리 파라미터:', this.$route.query);

    // URL에서 직접 userName 파라미터 추출
    const urlParams = new URLSearchParams(window.location.search);
    const userNameFromUrl = urlParams.get('userName');
    console.log('URL에서 직접 추출한 userName:', userNameFromUrl);

    // 주소창에서만 사용자 이름 가져오기 (기본값: '사용자')
    this.userName = userNameFromUrl || '사용자';
    console.log('최종 설정된 사용자 이름:', this.userName);

    // 현재 URL에 userName 파라미터가 없으면 추가
    if (!userNameFromUrl) {
      const currentUrl = new URL(window.location.href);
      currentUrl.searchParams.set('userName', this.userName);
      window.history.replaceState({}, '', currentUrl.toString());
    }

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

      // 파일이 선택되면 자동으로 업로드 시작 (모바일 사용자 편의성 개선)
      if (this.selectedFile) {
        this.showNotification('파일 업로드 중...', 10000) // 업로드 중 알림 (최대 10초)
        this.uploadFile()
      }
    },

    // 드래그 앤 드롭 관련 메서드
    onDragOver() {
      this.isDragging = true
    },

    onDragLeave() {
      this.isDragging = false
    },

    onDrop(event) {
      this.isDragging = false

      if (event.dataTransfer.files.length) {
        this.selectedFile = event.dataTransfer.files[0]
        this.uploadError = ''
        this.uploadSuccess = ''

        // 파일이 드롭되면 자동으로 업로드 시작
        this.showNotification('파일 업로드 중...', 10000) // 업로드 중 알림 (최대 10초)
        this.uploadFile()
      }
    },

    openFilePicker(event) {
      // 이미 선택된 파일이 표시되는 영역 또는 삭제 버튼을 클릭한 경우
      // 파일 피커가 열리지 않도록 방지
      if (event.target.closest('.selected-file') ||
          event.target.closest('.file-select-button') ||
          event.target.closest('.clear-file-button')) {
        return;
      }

      // 파일 입력 필드 클릭
      this.$refs.fileInput.click();
    },

    clearSelectedFile() {
      this.selectedFile = null
      this.$refs.fileInput.value = ''
      this.uploadError = ''
      this.uploadSuccess = ''
    },

    async uploadFile() {
      if (!this.selectedFile) {
        this.uploadError = '업로드할 파일을 선택해주세요.'
        this.showNotification('업로드할 파일을 선택해주세요.', 3000, true)
        return
      }

      this.isUploading = true
      this.uploadError = ''
      this.uploadSuccess = ''

      const formData = new FormData()
      formData.append('file', this.selectedFile)

      // 사용자 이름 다시 확인 (URL에서 직접 추출)
      const urlParams = new URLSearchParams(window.location.search);
      const userNameFromUrl = urlParams.get('userName');

      // 주소창에서만 사용자 이름 가져오기
      const userName = userNameFromUrl
      formData.append('userName', userName)

      // 사용자 이름 설정
      this.userName = userName;

      // 현재 URL에 userName 파라미터가 없으면 추가
      if (!userNameFromUrl) {
        // 현재 URL 가져오기
        const currentUrl = new URL(window.location.href);
        // userName 파라미터 설정
        currentUrl.searchParams.set('userName', userName);
        // 브라우저 히스토리 업데이트 (페이지 새로고침 없이)
        window.history.replaceState({}, '', currentUrl.toString());
      }

      console.log('업로드 시 사용자 이름:', userName)

      console.log('업로드 시작:', {
        fileName: this.selectedFile.name,
        fileSize: this.selectedFile.size,
        fileType: this.selectedFile.type,
        roomCode: this.roomCode
      })

      try {
        console.log('요청 URL:', `${this.apiUrl}/api/rooms/${this.roomCode}/files`)

        const response = await axios.post(
          `${this.apiUrl}/api/rooms/${this.roomCode}/files`,
          formData,
          {
            headers: {
              'Content-Type': 'multipart/form-data'
            },
            timeout: 60000, // 60초로 타임아웃 시간 증가
            onUploadProgress: progressEvent => {
              const percentCompleted = Math.round(
                (progressEvent.loaded * 100) / progressEvent.total
              )
              console.log('업로드 진행률:', percentCompleted + '%')
            }
          }
        )

        console.log('업로드 응답:', response.data)

        const successMessage = response.data.message || '파일이 성공적으로 업로드되었습니다.'
        this.uploadSuccess = successMessage
        this.showNotification(successMessage, 3000)

        this.selectedFile = null
        if (this.$refs.fileInput) {
          this.$refs.fileInput.value = ''
        }

        // 파일 목록 새로고침
        this.loadFiles()
      } catch (error) {
        console.error('파일 업로드 오류:', error)

        if (error.response) {
          console.error('서버 응답 오류:', {
            status: error.response.status,
            data: error.response.data,
            headers: error.response.headers
          })
        } else if (error.request) {
          console.error('요청은 전송됐으나 응답 없음:', error.request)
        } else {
          console.error('요청 생성 중 오류:', error.message)
        }

        const errorMessage = error.response?.data?.message || '파일 업로드에 실패했습니다.'
        this.uploadError = errorMessage
        this.showNotification(errorMessage, 5000, true)
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

        console.log('서버에서 받은 파일 목록:', uniqueFiles);

        // 각 파일에 고유 ID 할당 (이미 있는 경우 유지)
        this.files = uniqueFiles.map(file => {
          // 사용자 이름 처리 (항상 Redis에 저장된 이름 사용)
          if (file.userName === undefined || file.userName === null || file.userName === '') {
            console.log('사용자 이름 없음, 기본값 사용:', file.originalName);
            file.userName = '사용자';
          }
          // 사용자 이름이 있는 경우 그대로 사용
          console.log('파일 정보:', file.originalName, '업로더:', file.userName);
          return {
            ...file,
            _uniqueKey: generateUUID() // 렌더링용 고유 키
          };
        })
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
        this.showNotification('파일 다운로드 중...', 5000)

        // 다운로드 URL 생성 (ID 사용)
        const downloadUrl = `${this.apiUrl}/api/rooms/${this.roomCode}/files/download/${file.id}?download=true`
        console.log('파일 다운로드 시도:', file.originalName, downloadUrl)

        // axios를 사용하여 파일 다운로드
        const response = await axios({
          url: downloadUrl,
          method: 'GET',
          responseType: 'blob',
          timeout: 60000 // 60초 타임아웃
        })

        // 파일 타입 결정 (MIME 타입이 있으면 사용, 없으면 기본값)
        const contentType = file.mimetype || 'application/octet-stream'

        // Blob 생성
        const blob = new Blob([response.data], { type: contentType })

        // 다운로드 링크 생성
        const url = window.URL.createObjectURL(blob)
        const link = document.createElement('a')
        link.href = url
        link.setAttribute('download', file.originalName)
        document.body.appendChild(link)

        // 다운로드 시작
        link.click()

        // 약간의 지연 후 링크 제거 (브라우저가 다운로드를 시작할 시간 제공)
        setTimeout(() => {
          window.URL.revokeObjectURL(url)
          document.body.removeChild(link)
        }, 100)

        this.showNotification('파일 다운로드가 시작되었습니다.', 3000)
      } catch (error) {
        console.error('파일 다운로드 오류:', error)
        console.error('오류 세부 정보:', error.message, error.stack)
        this.showNotification('파일 다운로드에 실패했습니다.', 5000, true)
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

    // 전체 파일 다운로드 메서드
    async downloadAllFiles() {
      if (this.files.length === 0) {
        this.showNotification('다운로드할 파일이 없습니다.', 3000, true)
        return
      }

      this.isDownloadingAll = true
      this.showNotification('전체 파일 다운로드 준비 중...', 10000)

      try {
        // 현재 표시된 파일 목록 사용 (API 호출 대신)
        console.log('현재 파일 목록 사용:', this.files)

        const filesToDownload = this.files || []

        if (filesToDownload.length === 0) {
          this.showNotification('다운로드할 파일이 없습니다.', 3000, true)
          this.isDownloadingAll = false
          return
        }

        this.showNotification(`${filesToDownload.length}개 파일 다운로드 중...`, 30000)

        // 각 파일을 순차적으로 다운로드
        let downloadedCount = 0
        let failedCount = 0

        for (let i = 0; i < filesToDownload.length; i++) {
          const file = filesToDownload[i]
          try {
            // 다운로드 URL 생성
            const downloadUrl = `${this.apiUrl}/api/rooms/${this.roomCode}/files/download/${file.id}`
            console.log(`파일 다운로드 시도 (${i+1}/${filesToDownload.length}):`, file.originalName, downloadUrl)

            // 파일 다운로드
            const fileResponse = await axios({
              url: downloadUrl,
              method: 'GET',
              responseType: 'blob',
              timeout: 60000 // 60초로 타임아웃 증가
            })

            // 파일 타입 결정 (MIME 타입이 있으면 사용, 없으면 기본값)
            const contentType = file.mimetype || 'application/octet-stream'

            // Blob 생성
            const blob = new Blob([fileResponse.data], { type: contentType })

            // 다운로드 링크 생성
            const url = window.URL.createObjectURL(blob)
            const link = document.createElement('a')
            link.href = url
            link.setAttribute('download', file.originalName)

            // 링크를 DOM에 추가하고 클릭 이벤트 발생
            document.body.appendChild(link)
            link.click()

            // 약간의 지연 후 링크 제거 (브라우저가 다운로드를 시작할 시간 제공)
            setTimeout(() => {
              window.URL.revokeObjectURL(url)
              document.body.removeChild(link)
            }, 100)

            downloadedCount++

            // 진행 상황 업데이트
            if (i < filesToDownload.length - 1) {
              this.showNotification(`파일 다운로드 중... (${downloadedCount}/${filesToDownload.length})`, 30000)
            }

            // 잠시 대기 (브라우저 다운로드 처리 시간 제공)
            await new Promise(resolve => setTimeout(resolve, 1000))
          } catch (fileError) {
            console.error(`파일 다운로드 오류 (${file.originalName}):`, fileError)
            console.error('오류 세부 정보:', fileError.message, fileError.stack)
            failedCount++
          }
        }

        if (failedCount > 0) {
          this.showNotification(`${downloadedCount}개 파일 다운로드 완료, ${failedCount}개 실패`, 5000, true)
        } else {
          this.showNotification(`${downloadedCount}개 파일 다운로드가 완료되었습니다.`, 5000)
        }
      } catch (error) {
        console.error('전체 파일 다운로드 오류:', error)
        console.error('오류 세부 정보:', error.message, error.stack)
        this.showNotification('전체 파일 다운로드에 실패했습니다.', 5000, true)
      } finally {
        this.isDownloadingAll = false
      }
    },

    // 알림 표시 메서드
    showNotification(message, duration = 3000, isError = false) {
      // 이전 타이머가 있는 경우 취소
      if (this.notification.timeout) {
        clearTimeout(this.notification.timeout)
      }

      // 알림 표시
      this.notification.message = message
      this.notification.show = true
      this.notification.isError = isError

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

    // 사용자 이름 편집 시작
    startEditUserName() {
      this.editUserName = this.userName
      this.isEditingUserName = true

      // 다음 틱에서 입력 필드에 포커스
      this.$nextTick(() => {
        if (this.$refs.userNameInput) {
          this.$refs.userNameInput.focus()
        }
      })
    },

    // 사용자 이름 저장
    saveUserName() {
      // 빈 문자열이면 기본값 사용
      if (!this.editUserName.trim()) {
        this.editUserName = '사용자'
      }

      // 이름이 변경된 경우에만 처리
      if (this.userName !== this.editUserName) {
        this.userName = this.editUserName.trim()

        // URL 파라미터 업데이트
        const currentUrl = new URL(window.location.href)
        currentUrl.searchParams.set('userName', this.userName)
        window.history.replaceState({}, '', currentUrl.toString())

        // 알림 표시
        this.showNotification(`사용자 이름이 '${this.userName}'(으)로 변경되었습니다.`)
      }

      this.isEditingUserName = false
    },

    // 파일 미리보기 메서드
    async previewFile(file) {
      // 미리보기 모달 초기화
      this.previewModal.file = file
      this.previewModal.previewUrl = ''
      this.previewModal.officeViewerUrl = ''
      this.previewModal.textContent = null
      this.previewModal.isLoading = true
      this.previewModal.show = true

      try {
        // 다운로드 URL 생성
        const downloadUrl = `${this.apiUrl}/api/rooms/${this.roomCode}/files/download/${file.id}`

        // 파일 유형에 따라 다른 처리
        if (this.isImageFile(file) || this.isPdfFile(file) || this.isVideoFile(file) || this.isAudioFile(file)) {
          // 미디어 파일은 URL로 직접 표시
          this.previewModal.previewUrl = downloadUrl
        } else if (this.isExcelFile(file) || this.isOfficeFile(file)) {
          // Excel 및 Office 파일은 Google Docs Viewer를 사용하여 표시
          const encodedUrl = encodeURIComponent(`${window.location.origin}${downloadUrl}`)
          this.previewModal.officeViewerUrl = `https://docs.google.com/viewer?url=${encodedUrl}&embedded=true`

          // Microsoft Office Online Viewer 대체 옵션 (필요시 사용)
          // this.previewModal.officeViewerUrl = `https://view.officeapps.live.com/op/embed.aspx?src=${encodedUrl}`
        } else if (this.isTextFile(file)) {
          // 텍스트 파일은 내용을 가져와서 표시
          const response = await axios({
            url: downloadUrl,
            method: 'GET',
            responseType: 'text'
          })
          this.previewModal.textContent = response.data
        }
      } catch (error) {
        console.error('파일 미리보기 오류:', error)
        this.showNotification('파일 미리보기를 불러오는데 실패했습니다.', 3000, true)
      } finally {
        this.previewModal.isLoading = false
      }
    },

    // 미리보기 모달 닫기
    closePreview() {
      this.previewModal.show = false
      this.previewModal.file = null
      this.previewModal.previewUrl = ''
      this.previewModal.textContent = null
    },

    // 파일 유형 확인 메서드
    isImageFile(file) {
      return file.mimetype && file.mimetype.startsWith('image/')
    },

    isPdfFile(file) {
      return file.mimetype === 'application/pdf'
    },

    isVideoFile(file) {
      return file.mimetype && file.mimetype.startsWith('video/')
    },

    isAudioFile(file) {
      return file.mimetype && file.mimetype.startsWith('audio/')
    },

    isExcelFile(file) {
      const excelTypes = [
        'application/vnd.ms-excel',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'application/vnd.oasis.opendocument.spreadsheet'
      ]
      return excelTypes.includes(file.mimetype) ||
        (file.originalName && /\.(xlsx|xls|csv|ods)$/i.test(file.originalName))
    },

    isOfficeFile(file) {
      const officeTypes = [
        // Word
        'application/msword',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        // PowerPoint
        'application/vnd.ms-powerpoint',
        'application/vnd.openxmlformats-officedocument.presentationml.presentation'
      ]
      return officeTypes.includes(file.mimetype) ||
        (file.originalName && /\.(doc|docx|ppt|pptx)$/i.test(file.originalName))
    },

    isTextFile(file) {
      const textTypes = [
        'text/plain', 'text/html', 'text/css', 'text/javascript',
        'application/json', 'application/xml', 'application/javascript'
      ]
      return textTypes.includes(file.mimetype)
    },

    // Socket.IO 연결 관련 메서드
    connectSocket() {
      // 이미 연결된 소켓이 있으면 재사용
      if (this.socket && this.socket.connected) {
        console.log('이미 연결된 Socket.IO 재사용');
        return;
      }

      // Socket.IO 연결 생성
      this.socket = io(this.socketUrl, {
        reconnection: true,        // 자동 재연결 활성화
        reconnectionAttempts: 10,  // 최대 10번 재연결 시도
        reconnectionDelay: 1000,   // 재연결 시도 간격 (1초)
        timeout: 20000             // 연결 타임아웃 (20초)
      });

      // 연결 이벤트
      this.socket.on('connect', () => {
        console.log('Socket.IO 연결 성공')

        // URL에서 직접 사용자 이름 추출
        const urlParams = new URLSearchParams(window.location.search);
        const userNameFromUrl = urlParams.get('userName');

        // 주소창에서 사용자 이름 가져오기
        const userName = userNameFromUrl || '사용자';
        console.log('Socket 연결 시 사용자 이름:', userName);

        // 사용자 이름 설정
        this.userName = userName;

        // 방에 참여 (사용자 이름도 전송)
        this.socket.emit('joinRoom', this.roomCode, userName)
      })

      // 재연결 이벤트
      this.socket.on('reconnect', (attemptNumber) => {
        console.log(`Socket.IO 재연결 성공 (시도 ${attemptNumber}번째)`);

        // 재연결 시 방에 다시 참여
        const urlParams = new URLSearchParams(window.location.search);
        const userNameFromUrl = urlParams.get('userName');
        const userName = userNameFromUrl || '사용자';

        // 사용자 이름 설정
        this.userName = userName;

        this.socket.emit('joinRoom', this.roomCode, userName);
      })

      // 파일 업로드 이벤트
      this.socket.on('fileUploaded', (data) => {
        console.log('새 파일 업로드 알림 수신:', data)

        // 파일에 고유 키 추가
        const newFile = {
          ...data.file,
          _uniqueKey: generateUUID()
        }

        // 사용자 이름 처리 (항상 Redis에 저장된 이름 사용)
        if (newFile.userName === undefined || newFile.userName === null || newFile.userName === '') {
          console.log('Socket 이벤트: 사용자 이름 없음, 기본값 사용:', newFile.originalName);
          newFile.userName = '사용자';
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

.room-info {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.room-header h2 {
  margin: 0;
  font-size: 1.5rem;
  font-weight: 500;
}

.user-name-container {
  display: flex;
  align-items: center;
  font-size: 0.9rem;
  opacity: 0.9;
}

.user-name {
  display: flex;
  align-items: center;
  cursor: pointer;
  padding: 4px 8px;
  border-radius: 4px;
  transition: all 0.2s ease;
}

.user-name:hover {
  background-color: rgba(255, 255, 255, 0.2);
}

.edit-icon {
  margin-left: 6px;
  font-size: 12px;
  opacity: 0.7;
}

.user-name-edit {
  width: 100%;
}

.user-name-input {
  background-color: rgba(255, 255, 255, 0.2);
  border: none;
  border-radius: 4px;
  padding: 4px 8px;
  color: white;
  font-size: 0.9rem;
  width: 100%;
  max-width: 200px;
  outline: none;
}

.user-name-input::placeholder {
  color: rgba(255, 255, 255, 0.6);
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

.file-list-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 16px;
}

.file-upload-section h3,
.file-list-section h3 {
  margin-top: 0;
  margin-bottom: 0;
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

.download-all-button {
  background-color: #2ecc71;
  color: white;
  border: none;
  border-radius: 20px;
  padding: 10px 18px;
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.3s ease;
  display: flex;
  align-items: center;
  box-shadow: 0 2px 5px rgba(0, 0, 0, 0.1);
  position: relative;
  overflow: hidden;
}

.download-all-button::before {
  content: '📦';
  margin-right: 8px;
  font-size: 16px;
}

.download-all-button::after {
  content: '';
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  background: linear-gradient(rgba(255, 255, 255, 0.1), rgba(255, 255, 255, 0));
  opacity: 0;
  transition: opacity 0.3s ease;
}

.download-all-button:hover {
  background-color: #27ae60;
  transform: translateY(-2px);
  box-shadow: 0 4px 8px rgba(0, 0, 0, 0.15);
}

.download-all-button:hover::after {
  opacity: 1;
}

.download-all-button:active {
  transform: translateY(0);
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
}

.download-all-button:disabled {
  background-color: #95a5a6;
  cursor: not-allowed;
  transform: none;
  box-shadow: none;
}

.download-all-button:disabled::after {
  display: none;
}

.download-all-button.downloading {
  background-color: #27ae60;
  padding-right: 40px;
}

.loading-spinner {
  position: absolute;
  right: 15px;
  top: 50%;
  transform: translateY(-50%);
  width: 16px;
  height: 16px;
  border: 2px solid rgba(255, 255, 255, 0.3);
  border-radius: 50%;
  border-top-color: #fff;
  animation: spin 1s linear infinite;
}

@keyframes spin {
  0% { transform: translateY(-50%) rotate(0deg); }
  100% { transform: translateY(-50%) rotate(360deg); }
}

/* 모달 미리보기 스타일 */
.preview-modal {
  position: fixed;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  background-color: rgba(0, 0, 0, 0.8);
  display: flex;
  justify-content: center;
  align-items: center;
  z-index: 1000;
  backdrop-filter: blur(5px);
  animation: fade-in 0.3s ease;
}

@keyframes fade-in {
  from { opacity: 0; }
  to { opacity: 1; }
}

.preview-content {
  background-color: white;
  border-radius: 12px;
  width: 90%;
  max-width: 900px;
  max-height: 90vh;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  box-shadow: 0 10px 30px rgba(0, 0, 0, 0.3);
  animation: modal-appear 0.3s ease;
}

@keyframes modal-appear {
  from { opacity: 0; transform: scale(0.9); }
  to { opacity: 1; transform: scale(1); }
}

.preview-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 16px 20px;
  background-color: var(--primary-color);
  color: white;
  border-bottom: 1px solid #eee;
}

.preview-header h3 {
  margin: 0;
  font-size: 18px;
  font-weight: 500;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 80%;
}

.close-button {
  background: none;
  border: none;
  color: white;
  font-size: 24px;
  cursor: pointer;
  width: 32px;
  height: 32px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 50%;
  transition: all 0.2s ease;
}

.close-button:hover {
  background-color: rgba(255, 255, 255, 0.2);
}

.preview-body {
  padding: 20px;
  overflow: auto;
  flex: 1;
  display: flex;
  justify-content: center;
  align-items: center;
  min-height: 300px;
  max-height: calc(90vh - 70px);
}

.preview-loading {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 30px;
}

.preview-loading .loading-spinner {
  width: 40px;
  height: 40px;
  border: 3px solid rgba(255, 255, 255, 0.1);
  border-radius: 50%;
  border-top-color: var(--primary-color);
  animation: spin 1s linear infinite;
  margin-bottom: 16px;
}

.preview-loading p {
  color: #666;
  font-size: 14px;
}

.preview-image {
  max-width: 100%;
  max-height: calc(90vh - 110px);
  object-fit: contain;
  border-radius: 4px;
}

.preview-pdf, .preview-excel, .preview-office {
  width: 100%;
  height: calc(90vh - 110px);
  border: none;
  border-radius: 4px;
  background-color: #f5f5f5;
}

.preview-excel, .preview-office {
  min-height: 600px;
}

.preview-video, .preview-audio {
  max-width: 100%;
  max-height: calc(90vh - 110px);
}

.preview-text {
  width: 100%;
  max-height: calc(90vh - 110px);
  overflow: auto;
  background-color: #f5f5f5;
  padding: 16px;
  border-radius: 8px;
}

.preview-text pre {
  margin: 0;
  white-space: pre-wrap;
  word-wrap: break-word;
  font-family: 'Courier New', monospace;
  font-size: 14px;
  line-height: 1.5;
}

.preview-unsupported {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 30px;
  text-align: center;
}

.unsupported-icon {
  font-size: 64px;
  margin-bottom: 16px;
  color: #95a5a6;
}

.preview-unsupported p {
  margin-bottom: 20px;
  color: #7f8c8d;
}

/* 미리보기 버튼 스타일 */
.preview-button {
  background-color: var(--primary-color);
  color: var(--text-on-primary);
  margin-right: 8px;
}

.preview-button::before {
  content: '👁️';
  margin-right: 6px;
  font-size: 14px;
}

.upload-form {
  display: flex;
  margin-top: 16px;
  margin-bottom: 16px;
  position: relative;
}

.drop-zone-container {
  display: flex;
  justify-content: center;
  align-items: center;
  width: 100%;
}

.drop-zone {
  border: 2px dashed #2ecc71;
  border-radius: 20px;
  padding: 25px 20px;
  text-align: center;
  margin-bottom: 20px;
  transition: all 0.3s ease;
  background-color: rgba(46, 204, 113, 0.05);
  cursor: pointer;
  position: relative;
  overflow: hidden;
  width: 60%;
  max-width: 350px;
  height: auto;
  margin: 0 auto 20px auto;
  box-shadow: 0 4px 8px rgba(0, 0, 0, 0.1);
}

.drop-zone:hover {
  border-color: #27ae60;
  background-color: rgba(46, 204, 113, 0.1);
  box-shadow: 0 6px 12px rgba(0, 0, 0, 0.15);
  transform: translateY(-2px);
}

.drop-zone-active {
  border-color: #27ae60;
  background-color: rgba(46, 204, 113, 0.15);
  box-shadow: 0 0 20px rgba(46, 204, 113, 0.4);
  transform: scale(1.02);
}

.drop-zone-content {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
}

.drop-icon {
  font-size: 36px;
  margin-bottom: 12px;
  color: #2ecc71;
}

.drop-zone p {
  margin: 4px 0;
  color: #333;
  font-size: 15px;
  font-weight: 500;
}

.drop-zone-or {
  display: none;
}

.file-select-button {
  display: none;
}

.selected-file {
  display: flex;
  align-items: center;
  justify-content: space-between;
  background-color: #e8eaf6;
  padding: 8px 12px;
  border-radius: 8px;
  margin-top: 10px;
  font-size: 12px;
}

.selected-file-name {
  font-weight: 500;
  color: #333;
  word-break: break-all;
  margin-right: 8px;
  font-size: 12px;
  max-width: 150px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.clear-file-button {
  background: none;
  border: none;
  color: #757575;
  cursor: pointer;
  font-size: 14px;
  padding: 2px 4px;
  border-radius: 50%;
  transition: all 0.3s ease;
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
  margin-top: 24px;
  margin-right: 6px;
}

.success-message {
  color: var(--success-color);
  margin-top: 24px;
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

.file-details {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  margin-top: 5px;
}

.file-size,
.file-date {
  font-size: 13px;
  color: #757575;
  display: flex;
  align-items: center;
}

.file-uploader {
  font-size: 13px;
  display: flex;
  align-items: center;
  background-color: #f1f9f5;
  padding: 3px 8px;
  border-radius: 12px;
  border: 1px solid #d1e7dd;
}

.uploader-label {
  color: #757575;
  margin-right: 4px;
}

.uploader-name {
  font-weight: bold;
  color: #2ecc71;
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

.file-uploader::before {
  content: '👤';
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

  &.error-notification {
    background-color: var(--error-color);
    border-left-color: #c0392b;
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

/* 오류 알림 스타일 */
.error-notification {
  background-color: #f44336;
  border-left: 5px solid #d32f2f;
  box-shadow: 0 8px 16px rgba(244, 67, 54, 0.3);
}

.error-notification::before {
  content: '⚠️';
  margin-right: 8px;
}

@media (max-width: 576px) {
  .file-upload-section, .file-list-section {
    padding: 16px;
  }

  .file-list-header {
    flex-direction: column;
    align-items: flex-start;
    gap: 10px;
  }

  .download-all-button {
    width: 100%;
    justify-content: center;
  }

  .room-header {
    flex-direction: column;
    gap: 16px;
    padding: 16px;
  }

  .room-info {
    width: 100%;
  }

  .user-name-container {
    width: 100%;
  }

  .user-name-input {
    max-width: 100%;
  }

  .expiry-timer {
    width: 100%;
    text-align: center;
  }

  .drop-zone {
    width: 80%;
    max-width: none;
    padding: 15px 10px;
  }

  .drop-icon {
    font-size: 28px;
  }

  .drop-zone p {
    font-size: 12px;
  }

  .selected-file {
    flex-direction: column;
    align-items: flex-start;
  }

  .selected-file-name {
    margin-bottom: 8px;
    margin-right: 0;
  }

  .clear-file-button {
    align-self: flex-end;
  }

  .upload-form {
    flex-direction: column;
  }

  .file-item {
    margin-bottom: 10px;
    flex-direction: column;
    align-items: flex-start;
  }

  .file-info {
    width: 100%;
    margin-bottom: 12px;
  }

  .file-details {
    flex-direction: column;
    gap: 5px;
  }

  .notification {
    margin-right: 0;
    top: 10px;
    right: 10px;
    left: 10px;
    max-width: calc(100% - 20px);
    align-self: flex-end;
    padding: 12px 16px;
  }
}
</style>
