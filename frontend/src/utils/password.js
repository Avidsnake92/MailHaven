// Regole e robustezza della password, condivise tra pannello utenti e reset.
// Il backend applica le stesse regole in routes/auth.js (passwordPolicyError):
// se le cambi qui, cambiale anche lì.

export const getPasswordStrength = (pwd) => {
  if (!pwd) return { score: 0, label: '', color: '' }
  let score = 0
  if (pwd.length >= 8) score++
  if (pwd.length >= 12) score++
  if (/[A-Z]/.test(pwd)) score++
  if (/[0-9]/.test(pwd)) score++
  if (/[^A-Za-z0-9]/.test(pwd)) score++
  if (score <= 1) return { score, label: 'Debole', color: 'bg-red-500' }
  if (score <= 3) return { score, label: 'Media', color: 'bg-amber-500' }
  return { score, label: 'Forte', color: 'bg-green-500' }
}

export const validatePassword = (pwd) => {
  const errors = []
  if (!pwd) return errors
  if (pwd.length < 8) errors.push('Minimo 8 caratteri')
  if (!/[A-Z]/.test(pwd)) errors.push('Almeno una maiuscola')
  if (!/[0-9]/.test(pwd)) errors.push('Almeno un numero')
  if (!/[^A-Za-z0-9]/.test(pwd)) errors.push('Almeno un carattere speciale')
  return errors
}
