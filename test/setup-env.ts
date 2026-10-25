// Chave de encriptação apenas para testes.
process.env.ENCRYPTION_KEYS ??= '1=' + Buffer.alloc(32, 7).toString('base64');
