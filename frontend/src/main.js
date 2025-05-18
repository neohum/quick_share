import Vue from 'vue'
import App from './App.vue'
import router from './router'
import store from './store'
import './assets/main.css'
import QRCode from 'qrcode'

Vue.config.productionTip = false

// QR 코드 라이브러리를 전역으로 등록
Vue.prototype.$qrcode = QRCode

new Vue({
  router,
  store,
  render: h => h(App)
}).$mount('#app')
