UPDATE integrations
SET status = CASE
  WHEN secret_ciphertext IS NOT NULL THEN 'connected'
  ELSE 'disconnected'
END,
last_error = CASE
  WHEN secret_ciphertext IS NOT NULL THEN last_error
  ELSE NULL
END
WHERE status = 'error';
