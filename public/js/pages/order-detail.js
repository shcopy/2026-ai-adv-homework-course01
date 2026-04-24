const { createApp, ref, onMounted } = Vue;

createApp({
  setup() {
    if (!Auth.requireAuth()) return {};

    const el = document.getElementById('app');
    const orderId = el.dataset.orderId;
    const paymentResult = ref(el.dataset.paymentResult || null);

    const order = ref(null);
    const loading = ref(true);
    const loadingEcpay = ref(false);
    const verifying = ref(false);

    const statusMap = {
      pending: { label: '待付款', cls: 'bg-apricot/20 text-apricot' },
      paid: { label: '已付款', cls: 'bg-sage/20 text-sage' },
      failed: { label: '付款失敗', cls: 'bg-red-100 text-red-600' },
    };

    const paymentMessages = {
      success: { text: '付款成功！感謝您的購買。', cls: 'bg-sage/10 text-sage border border-sage/20' },
      failed: { text: '付款失敗，請重試。', cls: 'bg-red-50 text-red-600 border border-red-100' },
      cancel: { text: '付款已取消。', cls: 'bg-apricot/10 text-apricot border border-apricot/20' },
      done: { text: '已從綠界返回，請點「確認付款結果」更新訂單狀態。', cls: 'bg-blue-50 text-blue-600 border border-blue-100' },
    };

    async function goToEcpay() {
      if (!order.value || loadingEcpay.value) return;
      loadingEcpay.value = true;
      try {
        const res = await apiFetch('/api/orders/' + order.value.id + '/ecpay-params');
        const { action, params } = res.data;

        const ecpayForm = document.createElement('form');
        ecpayForm.method = 'POST';
        ecpayForm.action = action;
        Object.entries(params).forEach(([k, v]) => {
          const input = document.createElement('input');
          input.type = 'hidden';
          input.name = k;
          input.value = v;
          ecpayForm.appendChild(input);
        });
        document.body.appendChild(ecpayForm);
        ecpayForm.submit();
      } catch (e) {
        Notification.show('無法載入綠界付款頁', 'error');
        loadingEcpay.value = false;
      }
    }

    async function verifyPayment() {
      if (!order.value || verifying.value) return;
      verifying.value = true;
      try {
        const res = await apiFetch('/api/orders/' + order.value.id + '/verify-payment', { method: 'POST' });
        order.value = res.data;
        const msgMap = { paid: '付款成功', failed: '付款失敗', pending: '尚未付款，請完成綠界付款後再查詢' };
        Notification.show(msgMap[res.data.status] || res.message, res.data.status === 'paid' ? 'success' : 'error');
      } catch (e) {
        Notification.show(e?.data?.message || '查詢付款狀態失敗', 'error');
      } finally {
        verifying.value = false;
      }
    }

    onMounted(async function () {
      // 從 URL 讀取 payment 參數
      const urlParams = new URLSearchParams(window.location.search);
      const paymentParam = urlParams.get('payment');
      if (paymentParam) paymentResult.value = paymentParam;

      try {
        const res = await apiFetch('/api/orders/' + orderId);
        order.value = res.data;
      } catch (e) {
        Notification.show('載入訂單失敗', 'error');
      } finally {
        loading.value = false;
      }
    });

    return {
      order, loading, loadingEcpay, verifying,
      paymentResult, statusMap, paymentMessages,
      goToEcpay, verifyPayment,
    };
  }
}).mount('#app');
