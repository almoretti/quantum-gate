export function adminPageHtml(email: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Quantum Gate — Admin</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: 'Inter', ui-sans-serif, system-ui, sans-serif; background: #f8fafe; color: #3d4449; }
    .header {
      background: linear-gradient(135deg, #0086ff 0%, #0070d6 50%, #004d94 100%);
      padding: 24px 32px;
      display: flex;
      align-items: center;
      justify-content: space-between;
      color: white;
    }
    .header h1 { font-size: 1.2rem; font-weight: 700; }
    .header-right { display: flex; align-items: center; gap: 16px; font-size: 0.85rem; }
    .header-right a { color: rgba(255,255,255,0.8); text-decoration: none; }
    .header-right a:hover { color: white; }
    .container { max-width: 960px; margin: 0 auto; padding: 24px; }
    .stats { display: grid; grid-template-columns: repeat(3, 1fr); gap: 16px; margin-bottom: 24px; }
    .stat-card {
      background: white; border-radius: 12px; padding: 20px;
      border: 1px solid #e2e8f0; text-align: center;
    }
    .stat-card .value { font-size: 2rem; font-weight: 700; color: #0086ff; }
    .stat-card .label { font-size: 0.75rem; color: #5a6268; text-transform: uppercase; letter-spacing: 0.05em; margin-top: 4px; }
    .section { background: white; border-radius: 12px; border: 1px solid #e2e8f0; margin-bottom: 24px; overflow: hidden; }
    .section-header {
      padding: 16px 20px; border-bottom: 1px solid #e2e8f0;
      display: flex; align-items: center; justify-content: space-between;
    }
    .section-header h2 { font-size: 0.95rem; font-weight: 700; }
    table { width: 100%; border-collapse: collapse; }
    th { text-align: left; font-size: 0.7rem; text-transform: uppercase; letter-spacing: 0.05em; color: #5a6268; padding: 10px 20px; border-bottom: 1px solid #e2e8f0; }
    td { padding: 12px 20px; border-bottom: 1px solid #f0f0f0; font-size: 0.85rem; }
    tr:last-child td { border-bottom: none; }
    .badge {
      display: inline-block; padding: 3px 10px; border-radius: 100px;
      font-size: 0.7rem; font-weight: 600; text-transform: uppercase;
    }
    .badge-protected { background: #e8f4ff; color: #0086ff; }
    .badge-open { background: #e8f8f0; color: #10b395; }
    .badge-super { background: #fef3c7; color: #d97706; }
    .badge-admin { background: #ede9fe; color: #7c3aed; }
    .badge-user { background: #f1f5f9; color: #64748b; }
    .toggle-btn {
      padding: 6px 14px; border-radius: 100px; border: 1px solid #e2e8f0;
      background: white; font-family: inherit; font-size: 0.75rem; font-weight: 600;
      cursor: pointer; transition: all 0.2s;
    }
    .toggle-btn:hover { border-color: #0086ff; color: #0086ff; }
    .toggle-btn.danger:hover { border-color: #ff0054; color: #ff0054; }
    .add-form {
      padding: 16px 20px; display: flex; gap: 8px; border-top: 1px solid #e2e8f0;
    }
    .add-form input {
      flex: 1; padding: 8px 12px; border: 1px solid #e2e8f0; border-radius: 8px;
      font-family: inherit; font-size: 0.85rem;
    }
    .add-form button {
      padding: 8px 20px; border: none; border-radius: 8px;
      background: #0086ff; color: white; font-family: inherit; font-size: 0.85rem;
      font-weight: 600; cursor: pointer;
    }
    .add-form button:hover { background: #0070d6; }
    .empty { padding: 40px 20px; text-align: center; color: #5a6268; font-size: 0.85rem; }
    .name-input {
      border: none; background: transparent; font-family: inherit; font-size: 0.85rem;
      padding: 2px 4px; border-radius: 4px; width: 140px; color: #3d4449;
    }
    .name-input:hover { background: #f8fafe; }
    .name-input:focus { outline: 1px solid #0086ff; background: white; }
  </style>
</head>
<body>
  <div class="header">
    <h1>Quantum Gate</h1>
    <div class="header-right">
      <span>${esc(email)}</span>
      <a href="/auth/logout">Logout</a>
    </div>
  </div>
  <div class="container">
    <div class="stats">
      <div class="stat-card"><div class="value" id="total">-</div><div class="label">Total Services</div></div>
      <div class="stat-card"><div class="value" id="protected">-</div><div class="label">Protected</div></div>
      <div class="stat-card"><div class="value" id="open">-</div><div class="label">Open</div></div>
    </div>

    <div class="section">
      <div class="section-header">
        <h2>Services</h2>
      </div>
      <div id="services-table"></div>
      <div class="add-form">
        <input id="add-host" placeholder="subdomain.marketing.qih-tech.com" />
        <input id="add-name" placeholder="Display name" style="max-width:160px;" />
        <button onclick="addService()">Add</button>
      </div>
    </div>

    <div class="section">
      <div class="section-header"><h2>Users</h2></div>
      <div id="users-table"></div>
      <div class="add-form">
        <input id="add-admin-email" placeholder="user@quantum.media" />
        <button onclick="addAdminByEmail()">Add Admin</button>
      </div>
    </div>

    <div class="section">
      <div class="section-header"><h2>API Exemptions</h2></div>
      <p style="padding:12px 20px 0;font-size:0.8rem;color:#5a6268;">Paths matching these rules bypass Quantum Gate auth (for services with their own auth like bearer tokens).</p>
      <div id="exemptions-table"></div>
      <div class="add-form">
        <input id="add-ex-host" placeholder="* or hostname" style="max-width:200px;" />
        <input id="add-ex-path" placeholder="/api/v1" style="max-width:160px;" />
        <input id="add-ex-label" placeholder="Label" style="max-width:140px;" />
        <button onclick="addExemption()">Add</button>
      </div>
    </div>

    <div class="section">
      <div class="section-header"><h2>Recent Logins</h2></div>
      <div id="logins-table"></div>
    </div>
  </div>

  <script>
    function esc(s) { const d = document.createElement('div'); d.textContent = s; return d.innerHTML.replace(/'/g, '&#39;'); }
    function timeAgo(iso) {
      const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
      if (s < 60) return s + 's ago';
      if (s < 3600) return Math.floor(s/60) + 'm ago';
      if (s < 86400) return Math.floor(s/3600) + 'h ago';
      return Math.floor(s/86400) + 'd ago';
    }

    async function loadServices() {
      const res = await fetch('/api/services');
      const services = await res.json();
      const entries = Object.entries(services);
      const protectedCount = entries.filter(([,v]) => v.protected).length;
      document.getElementById('total').textContent = entries.length;
      document.getElementById('protected').textContent = protectedCount;
      document.getElementById('open').textContent = entries.length - protectedCount;

      if (!entries.length) {
        document.getElementById('services-table').innerHTML = '<div class="empty">No services discovered yet. Services appear here automatically when accessed.</div>';
        return;
      }

      let html = '<table><tr><th>Name</th><th>Hostname</th><th>Status</th><th>Discovered</th><th>Actions</th></tr>';
      for (const [host, svc] of entries.sort((a,b) => a[1].name.localeCompare(b[1].name))) {
        const badge = svc.protected
          ? '<span class="badge badge-protected">Protected</span>'
          : '<span class="badge badge-open">Open</span>';
        const toggleLabel = svc.protected ? 'Make Open' : 'Protect';
        html += '<tr>'
          + '<td><input class="name-input" value="' + esc(svc.name) + '" onchange="rename(\\'' + esc(host) + '\\',this.value)" /></td>'
          + '<td style="font-size:0.8rem;color:#5a6268;">' + esc(host) + '</td>'
          + '<td>' + badge + '</td>'
          + '<td style="font-size:0.8rem;color:#5a6268;">' + timeAgo(svc.discoveredAt) + '</td>'
          + '<td>'
          + '<button class="toggle-btn" onclick="toggle(\\'' + esc(host) + '\\',' + !svc.protected + ')">' + toggleLabel + '</button> '
          + '<button class="toggle-btn danger" onclick="remove(\\'' + esc(host) + '\\')">Remove</button>'
          + '</td>'
          + '</tr>';
      }
      html += '</table>';
      document.getElementById('services-table').innerHTML = html;
    }

    async function loadUsers() {
      const [usersRes, adminsRes] = await Promise.all([
        fetch('/api/users'),
        fetch('/api/admins')
      ]);
      const users = await usersRes.json();
      const adminData = await adminsRes.json();
      const adminSet = new Set([adminData.superAdmin, ...adminData.admins]);

      const entries = Object.values(users).sort((a, b) =>
        new Date(b.lastLogin).getTime() - new Date(a.lastLogin).getTime()
      );

      // Also include admins who haven't logged in yet
      const allEmails = new Set(entries.map(u => u.email));
      const extraAdmins = adminData.admins.filter(e => !allEmails.has(e));

      if (!entries.length && !extraAdmins.length) {
        document.getElementById('users-table').innerHTML = '<div class="empty">No users have logged in yet.</div>';
        return;
      }

      let html = '<table><tr><th>Email</th><th>Name</th><th>Last Login</th><th>Logins</th><th>Role</th><th>Actions</th></tr>';

      for (const user of entries) {
        const isSuperAdmin = user.email === adminData.superAdmin;
        const isAdm = adminSet.has(user.email);
        const roleBadge = isSuperAdmin
          ? '<span class="badge badge-super">Super Admin</span>'
          : isAdm
            ? '<span class="badge badge-admin">Admin</span>'
            : '<span class="badge badge-user">User</span>';
        const actions = isSuperAdmin
          ? ''
          : isAdm
            ? '<button class="toggle-btn danger" onclick="demoteUser(\\'' + esc(user.email) + '\\')">Remove Admin</button>'
            : '<button class="toggle-btn" onclick="promoteUser(\\'' + esc(user.email) + '\\')">Make Admin</button>';
        html += '<tr>'
          + '<td>' + esc(user.email) + '</td>'
          + '<td>' + esc(user.name) + '</td>'
          + '<td>' + timeAgo(user.lastLogin) + '</td>'
          + '<td>' + user.loginCount + '</td>'
          + '<td>' + roleBadge + '</td>'
          + '<td>' + actions + '</td>'
          + '</tr>';
      }

      for (const adminEmail of extraAdmins) {
        html += '<tr>'
          + '<td>' + esc(adminEmail) + '</td>'
          + '<td style="color:#5a6268;">—</td>'
          + '<td style="color:#5a6268;">Never</td>'
          + '<td>0</td>'
          + '<td><span class="badge badge-admin">Admin</span></td>'
          + '<td><button class="toggle-btn danger" onclick="demoteUser(\\'' + esc(adminEmail) + '\\')">Remove Admin</button></td>'
          + '</tr>';
      }

      html += '</table>';
      document.getElementById('users-table').innerHTML = html;
    }

    async function loadLogins() {
      const res = await fetch('/api/sessions');
      const logins = await res.json();
      if (!logins.length) {
        document.getElementById('logins-table').innerHTML = '<div class="empty">No logins recorded yet.</div>';
        return;
      }
      let html = '<table><tr><th>Email</th><th>Name</th><th>Time</th><th>IP</th></tr>';
      for (const l of logins) {
        html += '<tr><td>' + esc(l.email) + '</td><td>' + esc(l.name) + '</td><td>' + timeAgo(l.timestamp) + '</td><td style="font-size:0.8rem;color:#5a6268;">' + esc(l.ip) + '</td></tr>';
      }
      html += '</table>';
      document.getElementById('logins-table').innerHTML = html;
    }

    async function toggle(host, newState) {
      await fetch('/api/services/' + encodeURIComponent(host), {
        method: 'PATCH', headers: {'Content-Type':'application/json'},
        body: JSON.stringify({ protected: newState })
      });
      loadServices();
    }

    async function rename(host, name) {
      await fetch('/api/services/' + encodeURIComponent(host), {
        method: 'PATCH', headers: {'Content-Type':'application/json'},
        body: JSON.stringify({ name })
      });
    }

    async function remove(host) {
      if (!confirm('Remove ' + host + '? It will be re-discovered on next access.')) return;
      await fetch('/api/services/' + encodeURIComponent(host), { method: 'DELETE' });
      loadServices();
    }

    async function addService() {
      const host = document.getElementById('add-host').value.trim();
      const name = document.getElementById('add-name').value.trim();
      if (!host) return;
      await fetch('/api/services', {
        method: 'POST', headers: {'Content-Type':'application/json'},
        body: JSON.stringify({ host, name: name || host.split('.')[0], protected: true })
      });
      document.getElementById('add-host').value = '';
      document.getElementById('add-name').value = '';
      loadServices();
    }

    async function promoteUser(userEmail) {
      await fetch('/api/admins', {
        method: 'POST', headers: {'Content-Type':'application/json'},
        body: JSON.stringify({ email: userEmail })
      });
      loadUsers();
    }

    async function demoteUser(userEmail) {
      if (!confirm('Remove admin role from ' + userEmail + '?')) return;
      await fetch('/api/admins/' + encodeURIComponent(userEmail), { method: 'DELETE' });
      loadUsers();
    }

    async function addAdminByEmail() {
      const input = document.getElementById('add-admin-email');
      const adminEmail = input.value.trim();
      if (!adminEmail) return;
      await fetch('/api/admins', {
        method: 'POST', headers: {'Content-Type':'application/json'},
        body: JSON.stringify({ email: adminEmail })
      });
      input.value = '';
      loadUsers();
    }

    async function loadExemptions() {
      const res = await fetch('/api/exemptions');
      const exemptions = await res.json();
      if (!exemptions.length) {
        document.getElementById('exemptions-table').innerHTML = '<div class="empty">No API exemptions configured.</div>';
        return;
      }
      let html = '<table><tr><th>Label</th><th>Host</th><th>Path Prefix</th><th>Created</th><th>Actions</th></tr>';
      for (const ex of exemptions) {
        html += '<tr>'
          + '<td>' + esc(ex.label) + '</td>'
          + '<td style="font-size:0.8rem;color:#5a6268;">' + esc(ex.host) + '</td>'
          + '<td style="font-size:0.8rem;"><code>' + esc(ex.pathPrefix) + '</code></td>'
          + '<td style="font-size:0.8rem;color:#5a6268;">' + timeAgo(ex.createdAt) + '</td>'
          + '<td><button class="toggle-btn danger" onclick="removeExemption(\\'' + esc(ex.host) + '\\',\\'' + esc(ex.pathPrefix) + '\\')">Remove</button></td>'
          + '</tr>';
      }
      html += '</table>';
      document.getElementById('exemptions-table').innerHTML = html;
    }

    async function addExemption() {
      const host = document.getElementById('add-ex-host').value.trim();
      const pathPrefix = document.getElementById('add-ex-path').value.trim();
      const label = document.getElementById('add-ex-label').value.trim();
      if (!host || !pathPrefix) return;
      await fetch('/api/exemptions', {
        method: 'POST', headers: {'Content-Type':'application/json'},
        body: JSON.stringify({ host, pathPrefix, label: label || host })
      });
      document.getElementById('add-ex-host').value = '';
      document.getElementById('add-ex-path').value = '';
      document.getElementById('add-ex-label').value = '';
      loadExemptions();
    }

    async function removeExemption(host, pathPrefix) {
      if (!confirm('Remove exemption ' + host + ' ' + pathPrefix + '?')) return;
      await fetch('/api/exemptions', {
        method: 'DELETE', headers: {'Content-Type':'application/json'},
        body: JSON.stringify({ host, pathPrefix })
      });
      loadExemptions();
    }

    loadServices();
    loadUsers();
    loadExemptions();
    loadLogins();
  </script>
</body>
</html>`;
}

function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
