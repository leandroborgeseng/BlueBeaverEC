-- AlterEnum: perfil de campo com permissões mínimas (OS + inventário)
ALTER TYPE "PerfilAcesso" ADD VALUE IF NOT EXISTS 'TECNICO_RESTRITO';
