-- Rebrand: e-mails demo @nexo.local → @aion.local
UPDATE "Usuario"
SET email = REPLACE(email, '@nexo.local', '@aion.local')
WHERE email LIKE '%@nexo.local';
