const API = {
  async register(name, country, level) {
    const res = await fetch('/api/register', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name, country, level }) });
    return res.json();
  },
  async getUser() { const res = await fetch('/api/user'); return res.json(); },
  async getPosts() { const res = await fetch('/api/posts'); return res.json(); },
  async createPost(content, category) { const res = await fetch('/api/posts', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ content, category }) }); return res.json(); },
  async deletePost(postId) { const res = await fetch(`/api/posts/${postId}`, { method: 'DELETE' }); return res.json(); },
  async toggleLike(postId) { const res = await fetch(`/api/posts/${postId}/like`, { method: 'POST' }); return res.json(); },
  async getComments(postId) { const res = await fetch(`/api/posts/${postId}/comments`); return res.json(); },
  async addComment(postId, content) { const res = await fetch(`/api/posts/${postId}/comments`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ content }) }); return res.json(); },
  async getMembers() { const res = await fetch('/api/users/online'); return res.json(); },
  async getUnreadCount() { const res = await fetch('/api/notifications/unread'); return res.json(); },
  async getNotifications() { const res = await fetch('/api/notifications'); return res.json(); },
  async markNotificationsRead() { const res = await fetch('/api/notifications/read', { method: 'POST' }); return res.json(); }
};

const App = {
  user: null, posts: [], currentFilter: 'الكل', currentPage: 'feed', notifications: [],
  notifTimer: null, sseSource: null,

  async init() {
    const data = await API.getUser();
    if (data.loggedIn) {
      this.user = data.user;
      document.getElementById('onboarding').style.display = 'none';
      document.getElementById('app').classList.add('show');
      this.renderUserBadge();
      this.loadFeed();
      this.startSSE();
      this.loadUnreadCount();
    } else {
      document.getElementById('onboarding').style.display = 'flex';
    }
    this.setupOnboarding();
    this.setupEvents();
    this.loadDarkMode();
  },

  setupOnboarding() {
    let step = 1; const formData = {};
    document.getElementById('nextStep1').addEventListener('click', () => {
      const name = document.getElementById('onbName').value.trim();
      if (!name) { showToast('الرجاء إدخال اسمك'); return; }
      formData.name = name; step = 2; showStep(step);
    });
    document.getElementById('nextStep2').addEventListener('click', () => {
      const country = document.getElementById('onbCountry').value.trim();
      if (!country) { showToast('الرجاء إدخال بلدك'); return; }
      formData.country = country; step = 3; showStep(step);
    });
    document.getElementById('onbCountry').addEventListener('keydown', (e) => { if (e.key === 'Enter') document.getElementById('nextStep2').click(); });
    document.querySelectorAll('.level-option').forEach(btn => {
      btn.addEventListener('click', () => { document.querySelectorAll('.level-option').forEach(b => b.classList.remove('selected')); btn.classList.add('selected'); });
    });
    document.getElementById('finishBtn').addEventListener('click', async () => {
      const selected = document.querySelector('.level-option.selected');
      if (!selected) { showToast('الرجاء اختيار مستوى الدراسة'); return; }
      formData.level = selected.dataset.value;
      const result = await API.register(formData.name, formData.country, formData.level);
      if (result.success) {
        this.user = result.user;
        document.getElementById('onboarding').style.display = 'none';
        document.getElementById('app').classList.add('show');
        this.renderUserBadge();
        this.loadFeed();
        this.startSSE();
        showToast(`مرحباً بك يا ${formData.name}!`);
      } else { showToast('حدث خطأ، الرجاء المحاولة مرة أخرى'); }
    });
    function showStep(n) {
      document.querySelectorAll('.onboarding-step').forEach((el, i) => el.classList.toggle('active', i === n - 1));
      document.querySelectorAll('.step-dot').forEach((el, i) => el.classList.toggle('active', i < n));
    }
  },

  setupEvents() {
    document.getElementById('postBtn').addEventListener('click', () => this.submitPost());
    document.querySelectorAll('.cat-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.cat-btn').forEach(b => b.classList.remove('active')); btn.classList.add('active');
        this.currentFilter = btn.dataset.cat; this.renderPosts();
      });
    });
    document.querySelectorAll('.nav-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active')); btn.classList.add('active');
        this.currentPage = btn.dataset.page; this.switchPage(btn.dataset.page);
      });
    });
    // Notification bell
    document.getElementById('notifBell').addEventListener('click', () => this.toggleNotifPanel());
    document.getElementById('notifClose').addEventListener('click', () => document.getElementById('notifPanel').classList.remove('open'));
    document.getElementById('notifPanel').addEventListener('click', (e) => { if (e.target === e.currentTarget) document.getElementById('notifPanel').classList.remove('open'); });
    // Dark mode toggle
    document.getElementById('darkToggle').addEventListener('click', () => this.toggleDarkMode());
  },

  switchPage(page) {
    document.querySelectorAll('.page-content').forEach(el => el.classList.remove('active'));
    document.getElementById(`page-${page}`).classList.add('active');
    if (page === 'members') this.loadMembers();
    if (page === 'feed') this.loadFeed();
    if (page === 'notifications') this.loadNotifPage();
  },

  renderUserBadge() {
    const u = this.user; if (!u) return;
    document.getElementById('userBadge').innerHTML = `
      <div class="user-info"><div class="name">${u.name}</div><div class="detail">${u.country} · ${u.level}</div></div>
      <div class="avatar" style="background:${u.avatar_color}">${u.name.charAt(0)}</div>`;
  },

  loadDarkMode() {
    if (localStorage.getItem('darkMode') === 'true') {
      document.documentElement.setAttribute('data-theme', 'dark');
    }
  },
  toggleDarkMode() {
    const html = document.documentElement;
    const isDark = html.getAttribute('data-theme') === 'dark';
    if (isDark) { html.removeAttribute('data-theme'); localStorage.setItem('darkMode', 'false'); }
    else { html.setAttribute('data-theme', 'dark'); localStorage.setItem('darkMode', 'true'); }
  },

  async loadFeed() {
    const container = document.getElementById('postsContainer');
    container.innerHTML = '<div class="loading-spinner"><div class="spinner"></div></div>';
    this.posts = await API.getPosts();
    this.renderPosts();
    if (this.currentPage === 'feed') this.loadMembers();
  },

  renderPosts() {
    const container = document.getElementById('postsContainer');
    const filtered = this.currentFilter === 'الكل' ? this.posts : this.posts.filter(p => p.category === this.currentFilter);
    if (filtered.length === 0) {
      container.innerHTML = '<div class="empty-state"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M12 2L2 7l10 5 10-5-10-5z"/><path d="M2 17l10 5 10-5"/><path d="M2 12l10 5 10-5"/></svg><h3>لا توجد منشورات</h3><p>كن أول من يشارك تجربته مع المنح الدراسية!</p></div>';
      return;
    }
    container.innerHTML = filtered.map(p => this.renderPostCard(p)).join('');
    filtered.forEach(p => {
      const card = document.getElementById(`post-${p.id}`); if (!card) return;
      card.querySelector('.like-btn')?.addEventListener('click', () => this.handleLike(p.id));
      card.querySelector('.comment-btn')?.addEventListener('click', () => this.toggleComments(p.id));
      card.querySelector('.delete-btn')?.addEventListener('click', () => this.deletePost(p.id));
      const form = card.querySelector('.comment-form');
      form?.addEventListener('submit', (e) => { e.preventDefault(); const i = form.querySelector('input'); if (i.value.trim()) this.addComment(p.id, i.value); });
    });
  },

  renderPostCard(p) {
    const time = this.formatTime(p.created_at);
    const likedClass = p.liked ? 'liked' : '';
    const canDelete = this.user && p.user_id === this.user.id;
    const delBtn = canDelete ? `<button class="delete-btn" title="حذف المنشور"><svg viewBox="0 0 24 24"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg></button>` : '';
    return `<div class="post" id="post-${p.id}">
      <div class="post-header">
        <div class="avatar" style="background:${p.user_color || '#6C63FF'}">${(p.user_name||'?').charAt(0)}</div>
        <div class="post-author"><div class="name">${p.user_name}</div><div class="country">${p.user_country||''}</div></div>
        <span class="post-time" style="margin-right:auto">${time}</span>
        ${delBtn}
      </div>
      <span class="post-category">${p.category||'عام'}</span>
      <div class="post-content">${this.linkify(p.content)}</div>
      <div class="post-actions">
        <button class="action-btn like-btn ${likedClass}"><svg viewBox="0 0 24 24"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg><span>${p.likes_count||0}</span></button>
        <button class="action-btn comment-btn"><svg viewBox="0 0 24 24"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg><span>${p.comments_count||0}</span></button>
      </div>
      <div class="comments-section" id="comments-${p.id}"><div class="comments-list" id="commentsList-${p.id}"></div>
        <form class="comment-form"><input type="text" placeholder="اكتب تعليقاً..." required><button type="submit">إرسال</button></form>
      </div></div>`;
  },

  async deletePost(postId) {
    if (!confirm('هل أنت متأكد من حذف هذا المنشور؟')) return;
    const result = await API.deletePost(postId);
    if (result.success) {
      this.posts = this.posts.filter(p => p.id !== postId);
      this.renderPosts();
      showToast('تم حذف المنشور ✓');
    } else {
      showToast(result.error || 'خطأ في الحذف');
    }
  },

  async submitPost() {
    const textarea = document.getElementById('postContent');
    const content = textarea.value.trim();
    if (!content) { showToast('الرجاء كتابة محتوى المنشور'); return; }
    const category = document.getElementById('postCategory').value;
    const result = await API.createPost(content, category);
    if (result.success) {
      textarea.value = '';
      this.posts.unshift(result.post);
      this.renderPosts();
      showToast('تم نشر المنشور بنجاح ✓');
    }
  },

  async handleLike(postId) {
    const result = await API.toggleLike(postId);
    const post = this.posts.find(p => p.id === postId);
    if (post) { post.liked = result.liked; post.likes_count = result.likes_count; this.renderPosts(); }
  },

  async toggleComments(postId) {
    const section = document.getElementById(`comments-${postId}`);
    const list = document.getElementById(`commentsList-${postId}`);
    if (section.classList.contains('open')) { section.classList.remove('open'); return; }
    section.classList.add('open'); list.innerHTML = '<div class="loading-spinner"><div class="spinner"></div></div>';
    const comments = await API.getComments(postId);
    list.innerHTML = comments.map(c => `<div class="comment"><div class="avatar" style="background:${c.user_color||'#6C63FF'}">${c.user_name.charAt(0)}</div><div class="comment-body"><div class="name">${c.user_name}</div><div class="text">${c.content}</div><div class="time">${this.formatTime(c.created_at)}</div></div></div>`).join('');
  },

  async addComment(postId, content) {
    const result = await API.addComment(postId, content);
    if (result.success) {
      const list = document.getElementById(`commentsList-${postId}`);
      const c = result.comment;
      list.insertAdjacentHTML('beforeend', `<div class="comment"><div class="avatar" style="background:${c.user_color||'#6C63FF'}">${c.user_name.charAt(0)}</div><div class="comment-body"><div class="name">${c.user_name}</div><div class="text">${c.content}</div><div class="time">الآن</div></div></div>`);
      const post = this.posts.find(p => p.id === postId);
      if (post) { post.comments_count = (post.comments_count || 0) + 1; this.renderPosts(); }
      const input = document.querySelector(`#comments-${postId} .comment-form input`);
      if (input) input.value = '';
    }
  },

  async loadMembers() {
    const container = document.getElementById('membersContainer');
    container.innerHTML = '<div class="loading-spinner"><div class="spinner"></div></div>';
    const members = await API.getMembers();
    if (members.length === 0) { container.innerHTML = '<div class="empty-state"><h3>لا يوجد أعضاء بعد</h3></div>'; return; }
    container.innerHTML = members.map(m => `<div class="member-card"><div class="avatar" style="background:${m.avatar_color||'#6C63FF'}">${m.name.charAt(0)}</div><div class="name">${m.name}</div><div class="country">${m.country}</div><div class="level">${m.level}</div></div>`).join('');
  },

  // NOTIFICATIONS
  startSSE() {
    if (this.sseSource) { this.sseSource.close(); }
    try {
      this.sseSource = new EventSource('/api/notifications/stream');
      this.sseSource.onmessage = (e) => {
        try {
          const data = JSON.parse(e.data);
          if (data.connected) return;
          if (data.type === 'new_post') {
            this.notifications.unshift(data);
            this.updateNotifBadge();
            showToast(data.message);
          }
        } catch(e) {}
      };
      this.sseSource.onerror = () => { this.sseSource.close(); };
    } catch(e) {}
    // Backup polling every 30s
    if (this.notifTimer) clearInterval(this.notifTimer);
    this.notifTimer = setInterval(() => this.loadUnreadCount(), 30000);
  },

  async loadUnreadCount() {
    const data = await API.getUnreadCount();
    const badge = document.getElementById('notifBadge');
    if (data.count > 0) { badge.textContent = data.count; badge.classList.add('show'); }
    else { badge.classList.remove('show'); }
  },

  async toggleNotifPanel() {
    const panel = document.getElementById('notifPanel');
    if (panel.classList.contains('open')) { panel.classList.remove('open'); return; }
    panel.classList.add('open');
    const list = document.getElementById('notifList');
    this.notifications = await API.getNotifications();
    await API.markNotificationsRead();
    this.updateNotifBadgeImmediate();
    if (this.notifications.length === 0) {
      list.innerHTML = '<div style="padding:40px;text-align:center;color:var(--text-light)">لا توجد إشعارات</div>';
      return;
    }
    list.innerHTML = this.notifications.map(n => {
      const icon = n.type === 'new_post' ? '💬' : '❤️';
      return `<div class="notif-item ${n.read ? '' : 'unread'}">
        <div class="notif-icon ${n.type}" style="background:#6C63FF;color:white;font-size:1rem">${icon}</div>
        <div><div class="text">${n.message}</div><div class="time">${this.formatTime(n.created_at)}</div></div>
      </div>`;
    }).join('');
  },

  loadNotifPage() {
    const container = document.getElementById('notifPageContainer');
    if (this.notifications.length === 0) {
      API.getNotifications().then(n => {
        this.notifications = n;
        this.updateNotifBadgeImmediate();
        if (n.length === 0) { container.innerHTML = '<div class="empty-state"><h3>لا توجد إشعارات</h3></div>'; return; }
        container.innerHTML = n.map(not => `<div class="notif-item ${not.read ? '' : 'unread'}">
          <div class="notif-icon ${not.type}" style="background:#6C63FF;color:white;font-size:1rem">${not.type === 'new_post' ? '💬' : '❤️'}</div>
          <div><div class="text">${not.message}</div><div class="time">${this.formatTime(not.created_at)}</div></div>
        </div>`).join('');
      });
    } else {
      container.innerHTML = this.notifications.map(n => `<div class="notif-item ${n.read ? '' : 'unread'}">
        <div class="notif-icon ${n.type}" style="background:#6C63FF;color:white;font-size:1rem">${n.type === 'new_post' ? '💬' : '❤️'}</div>
        <div><div class="text">${n.message}</div><div class="time">${this.formatTime(n.created_at)}</div></div>
      </div>`).join('');
    }
  },

  updateNotifBadge() {
    this.loadUnreadCount();
  },

  updateNotifBadgeImmediate() {
    const unread = this.notifications.filter(n => !n.read).length;
    const badge = document.getElementById('notifBadge');
    if (unread > 0) { badge.textContent = unread; badge.classList.add('show'); }
    else { badge.classList.remove('show'); }
  },

  formatTime(dateStr) {
    const d = new Date(dateStr); const now = new Date(); const diff = Math.floor((now - d) / 1000);
    if (diff < 60) return 'الآن';
    if (diff < 3600) return `منذ ${Math.floor(diff / 60)} د`;
    if (diff < 86400) return `منذ ${Math.floor(diff / 3600)} س`;
    return d.toLocaleDateString('ar-SA', { day: 'numeric', month: 'short' });
  },

  linkify(text) {
    return text.replace(/(https?:\/\/[^\s]+)/g, url => `<a href="${url}" target="_blank" rel="noopener" style="color:var(--primary)">${url}</a>`);
  }
};

function showToast(msg) {
  let toast = document.getElementById('toast');
  if (!toast) { toast = document.createElement('div'); toast.id = 'toast'; toast.className = 'toast'; document.body.appendChild(toast); }
  toast.textContent = msg; toast.classList.add('show');
  clearTimeout(toast._timeout); toast._timeout = setTimeout(() => toast.classList.remove('show'), 3000);
}

document.addEventListener('DOMContentLoaded', () => App.init());
