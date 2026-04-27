#!/bin/bash
echo "=== MailHaven Security Setup ==="

# ── 1. Firewall UFW ────────────────────────────────────────────────────────
echo "Configurazione firewall..."
apt-get install -y ufw > /dev/null 2>&1

# Reset regole esistenti
ufw --force reset

# Policy default: blocca tutto in ingresso, permetti uscita
ufw default deny incoming
ufw default allow outgoing

# Permetti solo SSH, HTTP, HTTPS
ufw allow 22/tcp comment 'SSH'
ufw allow 80/tcp comment 'HTTP'
ufw allow 443/tcp comment 'HTTPS'
ufw allow 8080/tcp comment 'MailHaven Frontend'
ufw allow 3001/tcp comment 'MailHaven Backend'

# Blocca accesso diretto a PostgreSQL dall'esterno
ufw deny 5432/tcp

# Abilita firewall
ufw --force enable
echo "✅ Firewall configurato"
ufw status

# ── 2. Fail2ban ────────────────────────────────────────────────────────────
echo "Installazione Fail2ban..."
apt-get install -y fail2ban > /dev/null 2>&1

cat > /etc/fail2ban/jail.local << 'FAIL2BAN'
[DEFAULT]
bantime = 3600
findtime = 600
maxretry = 5
backend = systemd

[sshd]
enabled = true
port = ssh
logpath = %(sshd_log)s
maxretry = 3
bantime = 86400

[mailvault-auth]
enabled = true
port = 3001,8080
logpath = /var/log/mailvault-auth.log
maxretry = 5
bantime = 3600
findtime = 300
filter = mailvault-auth
FAIL2BAN

# Filtro per tentativi di login MailHaven
cat > /etc/fail2ban/filter.d/mailvault-auth.conf << 'FILTER'
[Definition]
failregex = ^.*"POST /api/auth/login.*" 401
ignoreregex =
FILTER

systemctl enable fail2ban
systemctl restart fail2ban
echo "✅ Fail2ban configurato"

# ── 3. Proteggi .env ───────────────────────────────────────────────────────
echo "Protezione file sensibili..."
chmod 600 /root/mailvault/.env
chown root:root /root/mailvault/.env
echo "✅ .env protetto (chmod 600)"

# ── 4. Disabilita accesso SSH con password (solo chiavi) ───────────────────
# ATTENZIONE: assicurati di avere una chiave SSH prima di abilitare questo!
# sed -i 's/#PasswordAuthentication yes/PasswordAuthentication no/' /etc/ssh/sshd_config
# systemctl restart sshd
echo "⚠️  SSH password auth: lasciata abilitata (configura chiavi SSH prima di disabilitarla)"

# ── 5. Limita risorse container ────────────────────────────────────────────
echo "✅ Security setup completato!"
echo ""
echo "=== Riepilogo ==="
echo "✅ UFW firewall attivo"
echo "✅ Fail2ban attivo (ban dopo 3 tentativi SSH, 5 tentativi login)"
echo "✅ .env protetto con chmod 600"
echo "⚠️  Cifratura email DB: da implementare separatamente"
echo "⚠️  SSH chiavi: configura prima di disabilitare password auth"
